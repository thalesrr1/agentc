import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProjectRepository, TaskRepository } from '../db/repository.js';
import { Reconciler } from '../reconciler/index.js';
import { TaskQueue } from '../runner/queue.js';
import { eventBus } from '../events/eventBus.js';
import type { Task } from '../types/index.js';

export const boardRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/projects/:id/board
  fastify.get('/:id/board', async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { reconcile?: string };
    const project = ProjectRepository.getById(params.id);

    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado' });
    }

    // Reconciliação do disco (.agent/runs/) com o SQLite apenas sob demanda explícita
    // Para consultas normais de leitura, consulta direto o SQLite (< 1ms, zero I/O de disco)
    let allTasks: Task[];
    if (query.reconcile === 'true' || query.reconcile === '1') {
      allTasks = Reconciler.reconcileProject(project.id, project.path);
      eventBus.emitEvent('PROJECTS_UPDATED');
    } else {
      allTasks = TaskRepository.listByProjectId(project.id);
    }

    // 2. Separação por colunas
    const columns = {
      backlog: [] as Task[],
      running: [] as Task[],
      review: [] as Task[],
      done: [] as Task[],
    };

    for (const task of allTasks) {
      if (task.status === 'backlog') {
        columns.backlog.push(task);
      } else if (task.status === 'running') {
        columns.running.push(task);
      } else if (task.status === 'review' || task.status === 'error') {
        columns.review.push(task);
      } else if (task.status === 'done') {
        columns.done.push(task);
      }
    }

    // 3. Status da fila Builder para este projeto
    const queueStatus = TaskQueue.getStatus(project.id);

    return reply.send({
      project,
      columns,
      queue: queueStatus,
    });
  });

  // POST /api/projects/:id/reconcile (reconciliação explícita)
  fastify.post('/:id/reconcile', async (request, reply) => {
    const params = request.params as { id: string };
    const project = ProjectRepository.getById(params.id);

    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado' });
    }

    Reconciler.reconcileProject(project.id, project.path);
    eventBus.emitEvent('BOARD_UPDATED', { projectId: project.id });
    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send({ success: true, message: 'Reconciliação com o disco concluída com sucesso' });
  });
};

