import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CONFIG } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { projectsRoutes } from './routes/projects.js';
import { boardRoutes } from './routes/board.js';
import { tasksRoutes } from './routes/tasks.js';
import { logsRoutes } from './routes/logs.js';
import { eventsRoutes } from './routes/events.js';
import { systemRoutes } from './routes/system.js';
import { settingsRoutes } from './routes/settings.js';
import { pipelinesRoutes } from './routes/pipelines.js';
import { TaskRepository } from './db/repository.js';
import { ProcessManager } from './runner/processManager.js';
import { PipelineEngine } from './runner/pipeline.js';

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // CORS habilitado para o frontend Vite
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Inicializa banco SQLite, reconciliação de disco e motor de pipelines
  getDb();
  PipelineEngine.init();
  TaskRepository.resetOrphanedRunningTasks();

  // Registro de rotas REST e SSE
  await fastify.register(projectsRoutes, { prefix: '/api/projects' });
  await fastify.register(boardRoutes, { prefix: '/api/projects' });
  await fastify.register(tasksRoutes, { prefix: '/api' });
  await fastify.register(logsRoutes, { prefix: '/api' });
  await fastify.register(eventsRoutes, { prefix: '/api' });
  await fastify.register(systemRoutes, { prefix: '/api/system' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });
  await fastify.register(pipelinesRoutes, { prefix: '/api' });

  // Rota de Healthcheck
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      service: 'agentc-server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  });

  return fastify;
}

async function start() {
  try {
    const server = await createServer();
    const address = await server.listen({
      port: CONFIG.PORT,
      host: CONFIG.HOST,
    });
    console.log(`[AgentC Server] Rodando com sucesso em ${address}`);

    const shutdown = async () => {
      console.log('\n[AgentC Server] Encerrando servidor e subprocessos ativos...');
      try {
        await ProcessManager.killAll();
      } catch (e) {
        console.error('Erro ao encerrar processos filhos:', e);
      }
      await server.close();
      closeDb();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[AgentC Server] Falha ao iniciar:', err);
    process.exit(1);
  }
}

// Se executado diretamente
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  start();
}
