import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SettingsRepository } from '../db/settingsRepository.js';
import type { RunnerType } from '../types/index.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/settings?project_id=...
  fastify.get('/', async (request, reply) => {
    const query = request.query as { project_id?: string };
    const settings = SettingsRepository.getFullSettings(query.project_id);
    return reply.send(settings);
  });

  // POST /api/settings (atualiza motor ativo global ou por projeto)
  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      runner?: RunnerType;
      model?: string;
      project_id?: string;
    };

    if (!body.runner || !body.model) {
      return reply.status(400).send({ error: 'runner e model são obrigatórios' });
    }

    SettingsRepository.setActiveExecutionEngine({
      runner: body.runner,
      model: body.model.trim(),
      projectId: body.project_id,
    });

    const full = SettingsRepository.getFullSettings(body.project_id);
    return reply.send({ success: true, ...full });
  });

  // POST /api/settings/models (adiciona novo modelo ao catálogo do runner)
  fastify.post('/models', async (request, reply) => {
    const body = request.body as {
      runner?: RunnerType;
      model?: string;
    };

    if (!body.runner || !body.model) {
      return reply.status(400).send({ error: 'runner e model são obrigatórios' });
    }

    const updatedList = SettingsRepository.addModelToCatalog(body.runner, body.model.trim());
    return reply.send({ success: true, runner: body.runner, models: updatedList });
  });

  // DELETE /api/settings/models (remove modelo do catálogo do runner)
  fastify.delete('/models', async (request, reply) => {
    const body = request.body as {
      runner?: RunnerType;
      model?: string;
    };

    if (!body.runner || !body.model) {
      return reply.status(400).send({ error: 'runner e model são obrigatórios' });
    }

    const updatedList = SettingsRepository.removeModelFromCatalog(body.runner, body.model.trim());
    return reply.send({ success: true, runner: body.runner, models: updatedList });
  });

  // GET /api/settings/opencode/providers (lista provedores disponíveis para o OpenCode)
  fastify.get('/opencode/providers', async (_request, reply) => {
    const providers = [
      { id: 'minimax', name: 'MiniMax (minimax.io)', prefix: 'minimax' },
      { id: 'openrouter', name: 'OpenRouter', prefix: 'openrouter' },
      { id: 'anthropic', name: 'Anthropic', prefix: 'anthropic' },
      { id: 'openai', name: 'OpenAI', prefix: 'openai' },
      { id: 'ollama', name: 'Ollama (Local)', prefix: 'ollama' },
      { id: 'custom', name: 'Outro Provedor...', prefix: '' },
    ];
    return reply.send({ providers });
  });

  // GET /api/settings/opencode/models?provider=... (busca modelos na CLI do OpenCode)
  fastify.get('/opencode/models', async (request, reply) => {
    const query = request.query as { provider?: string };
    const provider = query.provider || 'openrouter';
    const models = await SettingsRepository.fetchOpenCodeModels(provider);
    return reply.send({ provider, count: models.length, models });
  });
};
