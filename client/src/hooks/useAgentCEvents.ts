import { useEffect, useRef } from 'react';

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

type EventCallback = (payload: AgentCEventPayload) => void;

class EventsClient {
  private eventSource: EventSource | null = null;
  private listeners: Set<EventCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource('/api/events');

      this.eventSource.addEventListener('agentc_event', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as AgentCEventPayload;
          this.listeners.forEach((listener) => listener(payload));
        } catch (err) {
          console.error('[AgentC Events] Erro ao processar payload SSE:', err);
        }
      });

      this.eventSource.onerror = () => {
        this.disconnect();
        // Reconexão resiliente após 3s
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.listeners.size > 0) {
              this.connect();
            }
          }, 3000);
        }
      };
    } catch (err) {
      console.error('[AgentC Events] Falha ao criar EventSource:', err);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    if (this.listeners.size === 1) {
      this.connect();
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.disconnect();
      }
    };
  }
}

const eventsClient = new EventsClient();

export function useAgentCEvents(onEvent: EventCallback) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const unsubscribe = eventsClient.subscribe((payload) => {
      onEventRef.current(payload);
    });
    return unsubscribe;
  }, []);
}
