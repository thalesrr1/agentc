import { EventEmitter } from 'node:events';

export type AgentCEventType =
  | 'BOARD_UPDATED'
  | 'PROJECTS_UPDATED'
  | 'TASK_UPDATED'
  | 'QUEUE_UPDATED';

export interface AgentCEventPayload {
  type: AgentCEventType;
  projectId?: string;
  taskId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class AgentCEventBus extends EventEmitter {
  emitEvent(type: AgentCEventType, data?: { projectId?: string; taskId?: string; metadata?: Record<string, unknown> }): boolean {
    const payload: AgentCEventPayload = {
      type,
      projectId: data?.projectId,
      taskId: data?.taskId,
      metadata: data?.metadata,
      timestamp: new Date().toISOString(),
    };
    return this.emit('agentc_event', payload);
  }

  onEvent(listener: (payload: AgentCEventPayload) => void): this {
    return this.on('agentc_event', listener);
  }

  offEvent(listener: (payload: AgentCEventPayload) => void): this {
    return this.off('agentc_event', listener);
  }
}

export const eventBus = new AgentCEventBus();
