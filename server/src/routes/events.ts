import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eventBus, type AgentCEventPayload, type AgentCEventType } from '../events/eventBus.js';

export const eventsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/events
  fastify.get('/events', async (request, reply) => {
    // Assume controle do socket raw para SSE
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
        // socket fechado
      }
    };

    // 1. Mensagem de handshake imediata
    sendEvent('connected', { timestamp: new Date().toISOString() });

    // 2. Listener do EventBus
    const onAgentCEvent = (payload: AgentCEventPayload) => {
      sendEvent('agentc_event', payload);
    };

    eventBus.onEvent(onAgentCEvent);

    // 3. Heartbeat Keep-Alive a cada 15 segundos
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

    // 4. Limpeza ao desconectar
    request.raw.on('close', () => {
      clearInterval(pingInterval);
      eventBus.offEvent(onAgentCEvent);
    });
  });

  // POST /api/events/broadcast
  // Permite que processos externos (ex: MCP Server, scripts CLI) emitam eventos SSE para o frontend
  fastify.post('/events/broadcast', async (request, reply) => {
    const body = request.body as {
      type?: AgentCEventType;
      projectId?: string;
      taskId?: string;
      metadata?: Record<string, unknown>;
      events?: Array<{
        type: AgentCEventType;
        projectId?: string;
        taskId?: string;
        metadata?: Record<string, unknown>;
      }>;
    };

    let count = 0;
    if (Array.isArray(body?.events)) {
      for (const ev of body.events) {
        if (ev.type) {
          eventBus.emitEvent(ev.type, {
            projectId: ev.projectId,
            taskId: ev.taskId,
            metadata: ev.metadata,
          });
          count++;
        }
      }
    } else if (body?.type) {
      eventBus.emitEvent(body.type, {
        projectId: body.projectId,
        taskId: body.taskId,
        metadata: body.metadata,
      });
      count++;
    }

    return reply.send({ success: true, broadcasted: count });
  });
};

