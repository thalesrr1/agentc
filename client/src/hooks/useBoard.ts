import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import { useAgentCEvents } from './useAgentCEvents.js';
import type { BoardData, CreateTaskDTO, TaskStatus } from '../types/index.js';

export function useBoard(projectId: string | null) {
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchBoard = useCallback(
    async (options?: { reconcile?: boolean }) => {
      if (!projectId) {
        setBoardData(null);
        return;
      }

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        const data = await api.getBoard(projectId, options);
        setBoardData(data);
        setError(null);
      } catch (err: unknown) {
        setError(String(err));
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [projectId]
  );

  // Escuta eventos SSE em tempo real (0ms de latência)
  useAgentCEvents(
    useCallback(
      (event) => {
        if (
          (event.type === 'BOARD_UPDATED' || event.type === 'QUEUE_UPDATED') &&
          (!event.projectId || event.projectId === projectId)
        ) {
          fetchBoard();
        }
      },
      [projectId, fetchBoard]
    )
  );

  // Polling adaptativo & Gerenciamento de visibilidade (Visibility API)
  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    fetchBoard();

    // Determina frequência de polling adaptativo (fallback):
    // - Com tarefas rodando ou fila ativa: polling de 3s para sincronização fina
    // - Em repouso (idle): polling ágil de 6s enquanto visível
    const hasActiveTasks =
      (boardData?.columns.running.length ?? 0) > 0 || (boardData?.queue.waitingCount ?? 0) > 0;
    const intervalMs = hasActiveTasks ? 3000 : 6000;

    const interval = setInterval(() => {
      // Se o usuário minimizou ou trocou de aba, suspende o fetch
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchBoard();
    }, intervalMs);

    // Quando o usuário volta para a aba, atualiza imediatamente
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBoard();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    projectId,
    fetchBoard,
    boardData?.columns.running.length,
    boardData?.queue.waitingCount,
  ]);

  const startTask = async (
    taskId: string,
    options?: { resume?: boolean; feedback_prompt?: string }
  ) => {
    const result = await api.startTask(taskId, options);
    await fetchBoard();
    return result;
  };

  const cancelTask = async (taskId: string) => {
    await api.cancelTask(taskId);
    await fetchBoard();
  };

  const updateStatus = async (taskId: string, status: TaskStatus) => {
    await api.updateTaskStatus(taskId, status);
    await fetchBoard();
  };

  const createTask = async (dto: CreateTaskDTO) => {
    if (!projectId) throw new Error('Nenhum projeto ativo');
    const created = await api.createTask(projectId, dto);
    await fetchBoard();
    return created;
  };

  return {
    boardData,
    loading,
    error,
    refreshBoard: fetchBoard,
    startTask,
    cancelTask,
    updateStatus,
    createTask,
  };
}
