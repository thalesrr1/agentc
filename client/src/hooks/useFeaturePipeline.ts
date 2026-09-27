import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import { useAgentCEvents } from './useAgentCEvents.js';
import type { FeaturePipelineState } from '../types/index.js';

interface UseFeaturePipelineResult {
  /** Estado atual do pipeline. `null` enquanto carrega ou se nunca foi consultado. */
  state: FeaturePipelineState | null;
  /** Carrega o estado corrente do pipeline da feature. */
  refresh: () => Promise<void>;
  /** Dispara a esteira autônoma. */
  start: () => Promise<void>;
  /** Pausa a esteira (a tarefa atual termina de forma limpa). */
  pause: () => Promise<void>;
  /** Retoma uma esteira pausada ou halted (após mover tarefa com erro para backlog). */
  resume: () => Promise<void>;
  /** Indica se há uma operação em andamento (start/pause/resume). */
  busy: boolean;
  /** Última mensagem de erro, se houver. */
  error: string | null;
}

export function useFeaturePipeline(
  projectId: string | null,
  feature: string | null
): UseFeaturePipelineResult {
  const [state, setState] = useState<FeaturePipelineState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    if (!projectId || !feature) {
      setState(null);
      return;
    }
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await api.getFeaturePipelineStatus(projectId, feature);
      setState(res.state);
      setError(null);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      inflightRef.current = false;
    }
  }, [projectId, feature]);

  // Atualiza automaticamente em eventos PIPELINE_* que correspondam a este project+feature.
  useAgentCEvents(
    useCallback(
      (event) => {
        if (!projectId || !feature) return;
        const type = event.type;
        if (!type.startsWith('PIPELINE_')) return;
        if (event.projectId && event.projectId !== projectId) return;
        if (event.feature && event.feature.toLowerCase() !== feature.toLowerCase()) return;
        // Pequeno debounce implícito via setState batch
        void refresh();
      },
      [projectId, feature, refresh]
    )
  );

  // Auto-refresh inicial e ao trocar de feature
  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
  }, [refresh]);

  // Polling adaptativo quando há pipeline ativo (running/paused)
  useEffect(() => {
    if (!projectId || !feature) return;
    if (!state) return;
    if (state.status !== 'running' && state.status !== 'paused') return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [projectId, feature, state?.status, refresh]);

  const start = useCallback(async () => {
    if (!projectId || !feature) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.startFeaturePipeline(projectId, feature);
      setState(res.state);
    } catch (err: unknown) {
      setError(String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [projectId, feature]);

  const pause = useCallback(async () => {
    if (!projectId || !feature) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.pauseFeaturePipeline(projectId, feature);
      setState(res.state);
    } catch (err: unknown) {
      setError(String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [projectId, feature]);

  const resume = useCallback(async () => {
    if (!projectId || !feature) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.resumeFeaturePipeline(projectId, feature);
      setState(res.state);
    } catch (err: unknown) {
      setError(String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, [projectId, feature]);

  return { state, refresh, start, pause, resume, busy, error };
}