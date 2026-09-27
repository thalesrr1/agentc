import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import { useAgentCEvents } from './useAgentCEvents.js';
import type { FeaturePipelineState } from '../types/index.js';

interface UseProjectPipelinesResult {
  /** Lista de todos os pipelines conhecidos do projeto */
  pipelines: FeaturePipelineState[];
  /** Pipelines que estão ativamente em execução, pausados ou halted */
  activePipelines: FeaturePipelineState[];
  /** Carrega ou atualiza os pipelines do projeto */
  refresh: () => Promise<void>;
  /** Inicia a esteira autônoma de uma feature */
  start: (feature: string) => Promise<void>;
  /** Pausa a esteira */
  pause: (feature: string) => Promise<{ success: boolean; message: string; state: FeaturePipelineState } | undefined>;
  /** Retoma a esteira */
  resume: (feature: string) => Promise<void>;
  /** Feature atualmente em processamento de ação (start/pause/resume) */
  busyFeature: string | null;
  /** Última mensagem de erro */
  error: string | null;
}

export function useProjectPipelines(projectId: string | null): UseProjectPipelinesResult {
  const [pipelines, setPipelines] = useState<FeaturePipelineState[]>([]);
  const [busyFeature, setBusyFeature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPipelines([]);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await api.listFeaturePipelines(projectId);
      setPipelines(res.pipelines || []);
      setError(null);
    } catch (err: unknown) {
      // Ignora erro se for apenas transição de projeto
      console.warn('Erro ao carregar pipelines do projeto:', err);
    } finally {
      inflightRef.current = false;
    }
  }, [projectId]);

  // Atualiza automaticamente em eventos do SSE (PIPELINE_* e BOARD_UPDATED)
  useAgentCEvents(
    useCallback(
      (event) => {
        if (!projectId) return;
        const type = event.type;
        if (type.startsWith('PIPELINE_') || type === 'BOARD_UPDATED') {
          if (!event.projectId || event.projectId === projectId) {
            void refresh();
          }
        }
      },
      [projectId, refresh]
    )
  );

  // Carrega ao montar ou ao alterar o projectId
  useEffect(() => {
    setPipelines([]);
    setError(null);
    void refresh();
  }, [refresh]);

  // Filtra pipelines ativos (executando, pausados ou falhados)
  const activePipelines = pipelines.filter(
    (p) => p.status === 'running' || p.status === 'paused' || p.status === 'failed'
  );

  // Polling adaptativo quando há algum pipeline ativo & reativação por visibilidade/foco
  useEffect(() => {
    if (!projectId) return;

    const handleReactivation = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);

    if (activePipelines.length === 0) {
      return () => {
        document.removeEventListener('visibilitychange', handleReactivation);
        window.removeEventListener('focus', handleReactivation);
      };
    }

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    }, 3000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
    };
  }, [projectId, activePipelines.length, refresh]);

  const start = useCallback(
    async (feature: string) => {
      if (!projectId || !feature) return;
      setBusyFeature(feature);
      setError(null);
      try {
        const res = await api.startFeaturePipeline(projectId, feature);
        setPipelines((prev) => {
          const idx = prev.findIndex((p) => p.feature.toLowerCase() === feature.toLowerCase());
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.state;
            return next;
          }
          return [...prev, res.state];
        });
      } catch (err: unknown) {
        setError(String(err));
        throw err;
      } finally {
        setBusyFeature(null);
      }
    },
    [projectId]
  );

  const pause = useCallback(
    async (feature: string) => {
      if (!projectId || !feature) return;
      setBusyFeature(feature);
      setError(null);
      try {
        const res = await api.pauseFeaturePipeline(projectId, feature);
        setPipelines((prev) => {
          const idx = prev.findIndex((p) => p.feature.toLowerCase() === feature.toLowerCase());
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.state;
            return next;
          }
          return [...prev, res.state];
        });
        return res;
      } catch (err: unknown) {
        setError(String(err));
        throw err;
      } finally {
        setBusyFeature(null);
      }
    },
    [projectId]
  );

  const resume = useCallback(
    async (feature: string) => {
      if (!projectId || !feature) return;
      setBusyFeature(feature);
      setError(null);
      try {
        const res = await api.resumeFeaturePipeline(projectId, feature);
        setPipelines((prev) => {
          const idx = prev.findIndex((p) => p.feature.toLowerCase() === feature.toLowerCase());
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.state;
            return next;
          }
          return [...prev, res.state];
        });
      } catch (err: unknown) {
        setError(String(err));
        throw err;
      } finally {
        setBusyFeature(null);
      }
    },
    [projectId]
  );

  return {
    pipelines,
    activePipelines,
    refresh,
    start,
    pause,
    resume,
    busyFeature,
    error,
  };
}
