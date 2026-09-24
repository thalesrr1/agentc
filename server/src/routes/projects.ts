import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';
import { ProjectRepository, TaskRepository } from '../db/repository.js';
import { ProcessManager } from '../runner/processManager.js';
import { TaskQueue } from '../runner/queue.js';
import { Reconciler } from '../reconciler/index.js';
import { eventBus } from '../events/eventBus.js';
import type { CreateProjectDTO } from '../types/index.js';

export const projectsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/projects
  fastify.get('/', async (_request, reply) => {
    const list = ProjectRepository.list();
    return reply.send(list);
  });

  // GET /api/projects/hidden — projetos ocultos (soft-deleted) recuperáveis
  fastify.get('/hidden', async (_request, reply) => {
    const list = ProjectRepository.listHidden();
    return reply.send(list);
  });

  // GET /api/projects/by-path?path=...
  fastify.get('/by-path', async (request, reply) => {
    const query = request.query as { path?: string };
    if (!query.path) {
      return reply.status(400).send({ error: 'Parâmetro path é obrigatório' });
    }

    const project = ProjectRepository.getByPath(query.path);
    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado para o caminho informado' });
    }

    return reply.send(project);
  });

  // POST /api/projects
  fastify.post('/', async (request, reply) => {
    const body = request.body as Partial<CreateProjectDTO>;
    if (!body.name || !body.path) {
      return reply.status(400).send({ error: 'name e path são obrigatórios' });
    }

    const absPath = path.resolve(body.path);
    if (!fs.existsSync(absPath)) {
      return reply.status(400).send({ error: `Diretório não existe no sistema: ${absPath}` });
    }

    const existing = ProjectRepository.getByPath(absPath);
    if (existing) {
      // Se já existe e está oculto, restaura automaticamente para evitar duplicidade
      if (existing.hidden_at) {
        ProjectRepository.unhide(existing.id);
        eventBus.emitEvent('PROJECTS_UPDATED');
        return reply.status(200).send({
          ...existing,
          hidden_at: null,
          restored: true,
        });
      }
      return reply.status(409).send({ error: 'Projeto já cadastrado neste caminho', project: existing });
    }

    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Garante estrutura .agent/runs/ no repositório
    Reconciler.ensureProjectStructure(absPath);

    const project = ProjectRepository.create({
      id,
      name: body.name.trim(),
      path: absPath,
    });

    // Reconcilia runs pré-existentes caso já haja histórico no repositório
    Reconciler.reconcileProject(id, absPath);

    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.status(201).send(project);
  });

  // DELETE /api/projects/:id → oculta (soft-delete). Mantém todos os dados em disco e no SQLite.
  fastify.delete('/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const success = ProjectRepository.hide(params.id);
    if (!success) {
      return reply.status(404).send({ error: 'Projeto não encontrado ou já está oculto' });
    }

    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send({ success: true, hidden: true });
  });

  // POST /api/projects/:id/restore → restaura projeto oculto
  fastify.post('/:id/restore', async (request, reply) => {
    const params = request.params as { id: string };
    const success = ProjectRepository.unhide(params.id);
    if (!success) {
      return reply.status(404).send({ error: 'Projeto oculto não encontrado' });
    }

    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send({ success: true, restored: true });
  });

  // DELETE /api/projects/:id/permanent → exclusão definitiva segura (limpeza de processos, fila, SQLite e opcional de runs)
  fastify.delete('/:id/permanent', async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { deleteRunsDir?: string | boolean };
    const body = (request.body as { deleteRunsDir?: boolean } | undefined) || {};
    const deleteRunsDir = body.deleteRunsDir ?? (query.deleteRunsDir === 'true' || query.deleteRunsDir === true);

    const project = ProjectRepository.getById(params.id);
    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado' });
    }

    // 1. Interrompe quaisquer processos ativos e limpa a fila de execução do projeto
    try {
      const tasks = TaskRepository.listByProjectId(params.id);
      for (const t of tasks) {
        if (t.run_id && ProcessManager.isRunning(t.run_id)) {
          await ProcessManager.kill(t.run_id);
        }
      }
    } catch (err) {
      console.warn(`[Projects] Erro ao interromper processos para projeto ${params.id}:`, err);
    }
    TaskQueue.clear(params.id);

    // 2. Se solicitado explicitamente, apaga apenas a subpasta .agent/runs/ no repositório
    if (deleteRunsDir && project.path) {
      try {
        const runsDir = path.join(project.path, '.agent', 'runs');
        if (fs.existsSync(runsDir)) {
          fs.rmSync(runsDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[Projects] Falha ao limpar diretório .agent/runs do projeto ${params.id}:`, err);
      }
    }

    // 3. Exclui do banco SQLite (as tasks são excluídas em cascata pelo SQLite)
    const success = ProjectRepository.delete(params.id);
    if (!success) {
      return reply.status(500).send({ error: 'Falha ao excluir projeto do banco de dados' });
    }

    eventBus.emitEvent('PROJECTS_UPDATED');

    return reply.send({ success: true, permanent: true });
  });
};
