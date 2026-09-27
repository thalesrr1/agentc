import { useState, useEffect } from 'react';

export function useLiveLogs(taskId: string | null, startedAt?: string | null) {
  const [logs, setLogs] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    if (!taskId) {
      setLogs('');
      setIsConnected(false);
      setIsRunning(false);
      return;
    }

    setLogs('');
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      if (eventSource) {
        eventSource.close();
      }

      const es = new EventSource(`/api/tasks/${taskId}/logs/stream`);
      eventSource = es;

      es.onopen = () => {
        if (isDisposed) return;
        setIsConnected(true);
      };

      es.addEventListener('reset', () => {
        if (isDisposed) return;
        setLogs('');
      });

      es.addEventListener('history', (event) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.chunk !== undefined) {
            // Substituição integral evita duplicação do histórico ao reconectar
            setLogs(data.chunk);
          }
        } catch (err) {
          console.error('Erro ao processar history SSE:', err);
        }
      });

      es.addEventListener('chunk', (event) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.chunk) {
            setLogs((prev) => prev + data.chunk);
          }
        } catch (err) {
          console.error('Erro ao processar chunk SSE:', err);
        }
      });

      es.addEventListener('status', (event) => {
        if (isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          setIsRunning(Boolean(data.running));
        } catch (err) {
          console.error('Erro ao processar status SSE:', err);
        }
      });

      es.addEventListener('end', () => {
        if (isDisposed) return;
        setIsRunning(false);
      });

      es.onerror = () => {
        if (isDisposed) return;
        setIsConnected(false);
        // Reconexão resiliente após 3s
        if (!reconnectTimeout && !isDisposed) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
          }, 3000);
        }
      };
    };

    connect();

    // Quando o usuário volta à aba, garante que a conexão esteja ativa para atualizar logs
    const handleReactivation = () => {
      if (document.visibilityState === 'visible' && !isDisposed) {
        if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);

    return () => {
      isDisposed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
      if (eventSource) {
        eventSource.close();
      }
      setIsConnected(false);
    };
  }, [taskId, startedAt]);

  return { logs, isConnected, isRunning, clearLogs: () => setLogs('') };
}
