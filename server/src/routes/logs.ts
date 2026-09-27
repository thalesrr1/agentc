import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { TaskRepository, ProjectRepository } from '../db/repository.js';
import { ProcessManager } from '../runner/processManager.js';
import { CONFIG } from '../config.js';

export const logsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/tasks/:id/logs/stream', async (request, reply) => {
    const params = request.params as { id: string };
    const task = TaskRepository.getById(params.id);

    if (!task) {
      return reply.status(404).send({ error: 'Tarefa não encontrada' });
    }

    const project = ProjectRepository.getById(task.project_id);
    if (!project) {
      return reply.status(404).send({ error: 'Projeto não encontrado' });
    }

    // Assumir o controle do socket raw para SSE no Fastify
    reply.hijack();

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // ignora se socket fechou
      }
    };

    // 1. Envia histórico existente do execution.log
    const logPath = path.join(project.path, '.agent', 'runs', task.run_id, 'execution.log');
    if (fs.existsSync(logPath)) {
      try {
        const stats = fs.statSync(logPath);
        let initialContent = '';
        if (stats.size <= CONFIG.MAX_LOG_BYTES_RETURN) {
          initialContent = fs.readFileSync(logPath, 'utf8');
        } else {
          const fd = fs.openSync(logPath, 'r');
          const buffer = Buffer.alloc(CONFIG.MAX_LOG_BYTES_RETURN);
          fs.readSync(fd, buffer, 0, CONFIG.MAX_LOG_BYTES_RETURN, stats.size - CONFIG.MAX_LOG_BYTES_RETURN);
          fs.closeSync(fd);
          initialContent = '... [Truncado - exibindo últimos 100KB] ...\n' + buffer.toString('utf8');
        }

        if (initialContent) {
          sendEvent('history', { chunk: initialContent });
        }
      } catch (err) {
        console.error('Erro ao ler log inicial:', err);
      }
    }

    // 2. Heartbeat Keep-Alive a cada 15 segundos para evitar timeouts de socket
    const pingInterval = setInterval(() => {
      if (reply.raw.destroyed || reply.raw.writableEnded) {
        clearInterval(pingInterval);
        return;
      }
      try {
        reply.raw.write(': keep-alive\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 15000);

    // 3. Registra listener em tempo real
    const unsubscribe = ProcessManager.addListener(task.run_id, (chunk: string) => {
      if (chunk === '__AGENTC_LOG_RESET__') {
        sendEvent('reset', {});
      } else if (chunk.startsWith('__AGENTC_RUN_COMPLETE__:')) {
        const exitCode = parseInt(chunk.split(':')[1] || '0', 10);
        sendEvent('status', { running: false, exitCode });
        sendEvent('end', { exitCode });
      } else {
        sendEvent('chunk', { chunk });
      }
    });

    const isRunning = ProcessManager.isRunning(task.run_id);
    sendEvent('status', { running: isRunning, taskStatus: task.status });

    // Encerra streaming se o cliente desconectar
    request.raw.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  });
};
