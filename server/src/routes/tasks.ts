import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProjectRepository, TaskRepository } from '../db/repository.js';
import { Reconciler } from '../reconciler/index.js';
import { RunnerEngine } from '../runner/index.js';
import { PipelineEngine } from '../runner/pipeline.js';
import { GitService } from '../runner/git.js';
import { eventBus } from '../events/eventBus.js';
import type { CreateTaskDTO, StartTaskDTO, TaskStatus } from '../types/index.js';

export const tasksRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/projects/:id/tasks
  fastify.post('/projects/:id/tasks', async (request, reply) => {
    const params = request.params as { id: string };
    const project = ProjectRepository.getById(params.id);

    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado' });
    }

    const body = request.body as Partial<CreateTaskDTO>;
    if (!body.title || !body.mode || !body.prompt) {
      return reply.status(400).send({ error: 'title, mode e prompt são obrigatórios' });
    }

    const task = Reconciler.createTaskOnDisk(project.id, project.path, {
      title: body.title.trim(),
      mode: body.mode,
      feature: body.feature?.trim(),
      runner: body.runner,
      model: body.model,
      variant: body.variant?.trim(),
      thinking: body.thinking,
      order_index: typeof body.order_index === 'number' ? body.order_index : 0,
      verify_command: body.verify_command?.trim(),
      prompt: body.prompt.trim(),
      guardrails: body.guardrails?.trim(),
    });

    eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id, taskId: task.id });
    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.status(201).send(task);
  });

  // GET /api/tasks/:id
  fastify.get('/tasks/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const task = TaskRepository.getById(params.id);

    if (!task) {
      return reply.status(404).send({ error: 'Tarefa não encontrada' });
    }

    const project = ProjectRepository.getById(task.project_id);
    if (!project) {
      return reply.status(404).send({ error: 'Projeto da tarefa não encontrado' });
    }

    // Carrega arquivos do disco (task.md, report.md, execution.log)
    const details = Reconciler.getTaskDetails(task, project.path);

    // Carrega diff cirúrgico se houver affected_files
    if (task.affected_files && task.affected_files.length > 0) {
      details.diff_unified = GitService.getUnifiedDiff(project.path, task.affected_files);
      details.diff_stat = GitService.getDiffStat(project.path, task.affected_files);
    } else {
      details.diff_unified = '';
      details.diff_stat = 'Nenhum arquivo modificado nesta tarefa.';
    }

    return reply.send(details);
  });

  // PATCH /api/tasks/:id (atualiza especificações, prompt, runner, modelo, feature, ordem e verify_command)
  fastify.patch('/tasks/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const task = TaskRepository.getById(params.id);

    if (!task) {
      return reply.status(404).send({ error: 'Tarefa não encontrada' });
    }

    if (task.status === 'running') {
      return reply.status(400).send({ error: 'Não é possível editar uma tarefa enquanto estiver em execução' });
    }

    const project = ProjectRepository.getById(task.project_id);
    if (!project) {
      return reply.status(404).send({ error: 'Projeto da tarefa não encontrado' });
    }

    const body = request.body as {
      title?: string;
      mode?: 'Builder' | 'Scout';
      prompt?: string;
      guardrails?: string;
      task_markdown?: string;
      runner?: 'opencode' | 'antigravity-cli';
      model?: string;
      variant?: string | null;
      thinking?: boolean;
      feature?: string | null;
      order_index?: number | null;
      verify_command?: string | null;
    };

    const updatedTitle = body.title !== undefined ? body.title.trim() : task.title;
    const updatedMode = body.mode !== undefined ? body.mode : task.mode;
    const updatedRunner = body.runner !== undefined ? body.runner : task.runner;
    const updatedModel = body.model !== undefined ? body.model.trim() : task.model;
    const updatedVariant = body.variant !== undefined ? (body.variant?.trim() || null) : task.variant;
    const updatedThinking = body.thinking !== undefined ? body.thinking : task.thinking;
    const updatedFeature = body.feature !== undefined ? (body.feature?.trim() || null) : task.feature;
    const updatedOrderIndex = typeof body.order_index === 'number' ? body.order_index : task.order_index;
    const updatedVerifyCommand =
      body.verify_command !== undefined ? (body.verify_command?.trim() || null) : task.verify_command;

    // 1. Atualiza SQLite
    TaskRepository.updateTaskDefinition(task.id, {
      title: updatedTitle,
      mode: updatedMode,
      feature: updatedFeature,
      runner: updatedRunner,
      model: updatedModel,
      variant: updatedVariant,
      thinking: updatedThinking,
      order_index: updatedOrderIndex,
      verify_command: updatedVerifyCommand,
    });

    // 2. Atualiza run.json
    Reconciler.updateRunJSON(project.path, task.run_id, {
      title: updatedTitle,
      mode: updatedMode,
      feature: updatedFeature || undefined,
      runner: updatedRunner,
      model: updatedModel,
      variant: updatedVariant || undefined,
      thinking: updatedThinking,
      order_index: updatedOrderIndex,
      verify_command: updatedVerifyCommand || undefined,
    });

    // 3. Atualiza task.md
    if (body.task_markdown !== undefined) {
      Reconciler.writeTaskMarkdown(project.path, task.run_id, body.task_markdown);
    } else if (body.prompt !== undefined) {
      const generatedMd = Reconciler.buildTaskMarkdown({
        title: updatedTitle,
        mode: updatedMode,
        feature: updatedFeature || undefined,
        variant: updatedVariant || undefined,
        prompt: body.prompt.trim(),
        guardrails: body.guardrails?.trim(),
        projectPath: project.path,
        runId: task.run_id,
      });
      Reconciler.writeTaskMarkdown(project.path, task.run_id, generatedMd);
    }

    const updatedTask = TaskRepository.getById(task.id)!;
    const details = Reconciler.getTaskDetails(updatedTask, project.path);

    eventBus.emitEvent('BOARD_UPDATED', { projectId: task.project_id, taskId: task.id });
    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send(details);
  });

  // PATCH /api/tasks/:id/status
  fastify.patch('/tasks/:id/status', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { status?: TaskStatus };

    if (!body.status) {
      return reply.status(400).send({ error: 'status é obrigatório' });
    }

    const task = TaskRepository.getById(params.id);
    if (!task) {
      return reply.status(404).send({ error: 'Tarefa não encontrada' });
    }

    const project = ProjectRepository.getById(task.project_id);
    if (project) {
      Reconciler.updateRunJSON(project.path, task.run_id, { status: body.status });
    }

    TaskRepository.updateStatus(task.id, body.status);
    const updated = TaskRepository.getById(task.id);

    PipelineEngine.onTaskStatusChanged(task.id, body.status);

    eventBus.emitEvent('BOARD_UPDATED', { projectId: task.project_id, taskId: task.id });
    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send(updated);
  });

  // POST /api/tasks/:id/start
  fastify.post('/tasks/:id/start', async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body || {}) as StartTaskDTO;

    try {
      const task = TaskRepository.getById(params.id);
      if (!task) {
        return reply.status(404).send({ error: 'Tarefa não encontrada' });
      }

      // Conecta ao PipelineEngine se a tarefa pertence a uma feature com pipeline
      const pipelineCompletion = task.feature ? PipelineEngine.attachTaskCompletion(task) : undefined;

      const result = await RunnerEngine.startTask(params.id, {
        resume: body.resume,
        feedbackPrompt: body.feedback_prompt,
        autoComplete: body.auto_complete !== undefined ? body.auto_complete : Boolean(pipelineCompletion),
        onComplete: pipelineCompletion,
      });

      return reply.send({
        success: true,
        message: result.queued ? `Tarefa colocada na fila (posição ${result.position})` : 'Tarefa iniciada',
        ...result,
      });
    } catch (err: unknown) {
      return reply.status(500).send({ error: String(err) });
    }
  });

  // POST /api/tasks/:id/cancel
  fastify.post('/tasks/:id/cancel', async (request, reply) => {
    const params = request.params as { id: string };

    try {
      await RunnerEngine.cancelTask(params.id);
      return reply.send({ success: true, message: 'Execução cancelada com sucesso' });
    } catch (err: unknown) {
      return reply.status(500).send({ error: String(err) });
    }
  });
};
