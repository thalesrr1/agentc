import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PipelineEngine } from '../runner/pipeline.js';
import type { FeaturePipelineState } from '../types/index.js';

interface StartParams {
  id: string;
  feature: string;
}

interface StartBody {
  wait?: boolean;
}

export const pipelinesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/projects/:id/features/:feature/start
  // Inicia a esteira autônoma da feature. Retorna imediatamente (wait=false) por padrão.
  fastify.post<{ Params: StartParams; Body: StartBody }>(
    '/projects/:id/features/:feature/start',
    async (request, reply) => {
      const { id, feature } = request.params;
      const decoded = decodeURIComponent(feature);

      try {
        const state = await PipelineEngine.start(id, decoded);
        return reply.send({
          success: true,
          message: `Pipeline da feature "${decoded}" iniciado.`,
          state,
        });
      } catch (err: unknown) {
        const msg = String(err);
        const status = msg.includes('não encontrado') ? 404 : 400;
        return reply.status(status).send({ error: msg });
      }
    }
  );

  // POST /api/projects/:id/features/:feature/pause
  fastify.post<{ Params: StartParams }>(
    '/projects/:id/features/:feature/pause',
    async (request, reply) => {
      const { id, feature } = request.params;
      const decoded = decodeURIComponent(feature);

      try {
        const state: FeaturePipelineState = PipelineEngine.pause(id, decoded);
        return reply.send({
          success: true,
          message: `Pipeline da feature "${decoded}" pausado.`,
          state,
        });
      } catch (err: unknown) {
        const msg = String(err);
        const status = msg.includes('não encontrado') || msg.includes('Nenhum pipeline') ? 404 : 400;
        return reply.status(status).send({ error: msg });
      }
    }
  );

  // POST /api/projects/:id/features/:feature/resume
  fastify.post<{ Params: StartParams }>(
    '/projects/:id/features/:feature/resume',
    async (request, reply) => {
      const { id, feature } = request.params;
      const decoded = decodeURIComponent(feature);

      try {
        const state = await PipelineEngine.resume(id, decoded);
        return reply.send({
          success: true,
          message: `Pipeline da feature "${decoded}" retomado.`,
          state,
        });
      } catch (err: unknown) {
        const msg = String(err);
        const status = msg.includes('não encontrado') || msg.includes('Nenhum pipeline') ? 404 : 400;
        return reply.status(status).send({ error: msg });
      }
    }
  );

  // GET /api/projects/:id/features/:feature/status
  fastify.get<{ Params: StartParams }>(
    '/projects/:id/features/:feature/status',
    async (request, reply) => {
      const { id, feature } = request.params;
      const decoded = decodeURIComponent(feature);
      const state = PipelineEngine.getStatus(id, decoded);
      return reply.send({ success: true, state });
    }
  );

  // GET /api/projects/:id/pipelines — Lista todas as esteiras (ativas e sintéticas)
  fastify.get<{ Params: { id: string } }>(
    '/projects/:id/pipelines',
    async (request, reply) => {
      const { id } = request.params;
      const list = PipelineEngine.listByProject(id);
      return reply.send({ success: true, pipelines: list });
    }
  );
};