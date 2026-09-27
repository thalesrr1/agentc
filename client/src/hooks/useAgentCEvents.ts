import { useEffect, useRef } from 'react';

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

type EventCallback = (payload: AgentCEventPayload) => void;

class EventsClient {
  private eventSource: EventSource | null = null;
  private listeners: Set<EventCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initializedLifecycle = false;

  constructor() {
    this.setupLifecycleListeners();
  }

  private setupLifecycleListeners() {
    if (this.initializedLifecycle || typeof window === 'undefined') return;
    this.initializedLifecycle = true;

    const checkAndSync = () => {
      if (this.listeners.size === 0) return;
      if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.disconnect();
        this.connect();
      } else {
        const now = new Date().toISOString();
        this.listeners.forEach((l) => {
          l({ type: 'BOARD_UPDATED', timestamp: now });
          l({ type: 'PROJECTS_UPDATED', timestamp: now });
        });
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkAndSync();
      }
    });
    window.addEventListener('focus', checkAndSync);
  }

  connect() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource('/api/events');

      this.eventSource.onopen = () => {
        // Notifica ouvintes de que a conexão SSE foi estabelecida ou restabelecida,
        // garantindo ressincronização total após desconexões ou suspensão da aba
        const now = new Date().toISOString();
        this.listeners.forEach((listener) => {
          listener({ type: 'BOARD_UPDATED', timestamp: now });
          listener({ type: 'PROJECTS_UPDATED', timestamp: now });
        });
      };

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
        // Reconexão resiliente após 2s
        if (!this.reconnectTimer && this.listeners.size > 0) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.listeners.size > 0) {
              this.connect();
            }
          }, 2000);
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
