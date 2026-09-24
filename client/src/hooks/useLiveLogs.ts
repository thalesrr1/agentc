import { useState, useEffect } from 'react';

export function useLiveLogs(taskId: string | null) {
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
    const eventSource = new EventSource(`/api/tasks/${taskId}/logs/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.addEventListener('history', (event) => {
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

    eventSource.addEventListener('chunk', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.chunk) {
          setLogs((prev) => prev + data.chunk);
        }
      } catch (err) {
        console.error('Erro ao processar chunk SSE:', err);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        setIsRunning(Boolean(data.running));
      } catch (err) {
        console.error('Erro ao processar status SSE:', err);
      }
    });

    eventSource.addEventListener('end', () => {
      setIsRunning(false);
    });

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [taskId]);

  return { logs, isConnected, isRunning, clearLogs: () => setLogs('') };
}
