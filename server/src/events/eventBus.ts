import { EventEmitter } from 'node:events';

export type AgentCEventType =
  | 'BOARD_UPDATED'
  | 'PROJECTS_UPDATED'
  | 'TASK_UPDATED'
  | 'QUEUE_UPDATED'
  | 'PIPELINE_STARTED'
  | 'PIPELINE_TASK_STARTED'
  | 'PIPELINE_TASK_COMPLETED'
  | 'PIPELINE_TASK_VERIFYING'
  | 'PIPELINE_HALTED'
  | 'PIPELINE_COMPLETED'
  | 'PIPELINE_PAUSED'
  | 'PIPELINE_RESUMED';

export interface AgentCEventPayload {
  type: AgentCEventType;
  projectId?: string;
  taskId?: string;
  feature?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

class AgentCEventBus extends EventEmitter {
  emitEvent(
    type: AgentCEventType,
    data?: { projectId?: string; taskId?: string; feature?: string; metadata?: Record<string, unknown> }
  ): boolean {
    const payload: AgentCEventPayload = {
      type,
      projectId: data?.projectId,
      taskId: data?.taskId,
      feature: data?.feature,
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
