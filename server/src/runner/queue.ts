import type { TaskMode } from '../types/index.js';

type ExecutionCallback = () => Promise<void>;

interface QueuedItem {
  taskId: string;
  mode: TaskMode;
  execute: ExecutionCallback;
}

interface ProjectQueueState {
  activeBuilderTaskId: string | null;
  queue: QueuedItem[];
}

const projectQueues = new Map<string, ProjectQueueState>();

function getOrCreateQueue(projectId: string): ProjectQueueState {
  let state = projectQueues.get(projectId);
  if (!state) {
    state = {
      activeBuilderTaskId: null,
      queue: [],
    };
    projectQueues.set(projectId, state);
  }
  return state;
}

export const TaskQueue = {
  /**
   * Enfileira uma tarefa para execução respeitando a concorrência por modo e evitando re-entrância
   */
  async enqueue(
    projectId: string,
    taskId: string,
    mode: TaskMode,
    execute: ExecutionCallback
  ): Promise<{ queued: boolean; position: number }> {
    // Tarefas Scout rodam em paralelo imediatamente
    if (mode === 'Scout') {
      setImmediate(() => {
        execute().catch((err) => {
          console.error(`[TaskQueue] Erro ao executar tarefa Scout ${taskId}:`, err);
        });
      });
      return { queued: false, position: 0 };
    }

    // Tarefas Builder entram na fila FIFO por projeto
    const state = getOrCreateQueue(projectId);

    // Guarda de Re-entrância: previne duplicação se já estiver ativa ou já enfileirada
    if (state.activeBuilderTaskId === taskId) {
      return { queued: false, position: 0 };
    }
    const existingIndex = state.queue.findIndex((i) => i.taskId === taskId);
    if (existingIndex !== -1) {
      return { queued: true, position: existingIndex + 1 };
    }

    if (state.activeBuilderTaskId === null) {
      // Nenhuma Builder ativa, inicia imediatamente
      state.activeBuilderTaskId = taskId;
      setImmediate(() => {
        execute().catch((err) => {
          console.error(`[TaskQueue] Falha crítica não tratada no Builder ${taskId}:`, err);
          TaskQueue.notifyCompleted(projectId, taskId);
        });
      });
      return { queued: false, position: 0 };
    }

    // Já existe uma Builder rodando no projeto, coloca na fila de espera
    state.queue.push({ taskId, mode, execute });
    return { queued: true, position: state.queue.length };
  },

  /**
   * Chamado quando uma tarefa finaliza sua execução para liberar a próxima da fila
   */
  notifyCompleted(projectId: string, taskId: string): void {
    const state = projectQueues.get(projectId);
    if (!state) {
      return;
    }

    if (state.activeBuilderTaskId === taskId) {
      state.activeBuilderTaskId = null;

      // Se houver próximas na fila, desenfileira a primeira Builder
      const nextIndex = state.queue.findIndex((item) => item.mode === 'Builder');
      if (nextIndex !== -1) {
        const [nextItem] = state.queue.splice(nextIndex, 1);
        if (nextItem) {
          state.activeBuilderTaskId = nextItem.taskId;
          setImmediate(() => {
            nextItem.execute().catch((err) => {
              console.error(`[TaskQueue] Erro ao disparar próximo Builder ${nextItem.taskId}:`, err);
              TaskQueue.notifyCompleted(projectId, nextItem.taskId);
            });
          });
        }
      }
    } else {
      // Remove da fila se estava aguardando
      state.queue = state.queue.filter((item) => item.taskId !== taskId);
    }
  },

  /**
   * Retorna o status da fila do projeto
   */
  getStatus(projectId: string): {
    activeBuilderTaskId: string | null;
    waitingCount: number;
    waitingTaskIds: string[];
  } {
    const state = projectQueues.get(projectId);
    if (!state) {
      return { activeBuilderTaskId: null, waitingCount: 0, waitingTaskIds: [] };
    }
    return {
      activeBuilderTaskId: state.activeBuilderTaskId,
      waitingCount: state.queue.length,
      waitingTaskIds: state.queue.map((q) => q.taskId),
    };
  },

  /**
   * Limpa todo o estado da fila de um projeto
   */
  clear(projectId: string): void {
    projectQueues.delete(projectId);
  },
};
