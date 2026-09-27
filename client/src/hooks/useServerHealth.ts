import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_ENDPOINT = '/api/projects';

export const SERVER_UNREACHABLE_EVENT = 'server-unreachable';
export const SERVER_REACHABLE_EVENT = 'server-reachable';

interface ServerHealthDetail {
  reason?: 'timeout' | 'network' | 'http';
  status?: number;
}

function dispatchServerEvent(name: string, detail?: ServerHealthDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export interface ServerHealthState {
  isServerReachable: boolean;
  lastChecked: Date | null;
  /** Trigger an out-of-band probe (e.g. after the user clicks "retry"). */
  probeNow: () => Promise<void>;
}

export interface UseServerHealthOptions {
  /** Interval between probes in ms (default 30s). */
  intervalMs?: number;
  /** Request timeout in ms (default 5s). */
  timeoutMs?: number;
  /** Disable polling (e.g. when running in tests or hidden tab). */
  enabled?: boolean;
  /** Override the probed URL (defaults to `${API_BASE}/projects`). */
  endpoint?: string;
}

/**
 * Polls a lightweight backend endpoint to detect if the Fastify server
 * is reachable. When the status changes, dispatches a custom event on
 * `window` so non-React surfaces (or sibling components) can react too.
 *
 * The hook performs its own `fetch` instead of `api.getProjects()` to
 * keep this isolated from the data layer (no error throws, no UI side
 * effects). Cleanup correctly aborts in-flight requests and clears the
 * interval timer.
 */
export function useServerHealth(options: UseServerHealthOptions = {}): ServerHealthState {
  const {
    intervalMs = POLL_INTERVAL_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    enabled = true,
    endpoint = DEFAULT_HEALTH_ENDPOINT,
  } = options;

  const [isServerReachable, setIsServerReachable] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Track previous reachability to emit edge events only on transitions.
  const wasReachableRef = useRef<boolean>(true);
  // Guard against overlapping probes (e.g. slow network + fast interval).
  const inflightRef = useRef<AbortController | null>(null);

  const probe = useCallback(async () => {
    if (!enabled) return;

    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const reachable = res.ok;
      setLastChecked(new Date());
      setIsServerReachable(reachable);

      if (wasReachableRef.current && !reachable) {
        wasReachableRef.current = false;
        dispatchServerEvent(SERVER_UNREACHABLE_EVENT, {
          reason: 'http',
          status: res.status,
        });
      } else if (!wasReachableRef.current && reachable) {
        wasReachableRef.current = true;
        dispatchServerEvent(SERVER_REACHABLE_EVENT);
      }
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        controller.signal.aborted;
      setLastChecked(new Date());
      setIsServerReachable(false);

      if (wasReachableRef.current) {
        wasReachableRef.current = false;
        dispatchServerEvent(SERVER_UNREACHABLE_EVENT, {
          reason: aborted ? 'timeout' : 'network',
        });
      }
    } finally {
      clearTimeout(timer);
      if (inflightRef.current === controller) {
        inflightRef.current = null;
      }
    }
  }, [enabled, endpoint, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    // Probe immediately so the banner can appear right after server crash or disappear right after restart.
    probe();

    // Quando o servidor está inacessível, sonda mais rápido (4s) para limpar o banner imediatamente após a recuperação
    const currentInterval = isServerReachable ? intervalMs : 4000;
    const intervalId = window.setInterval(() => {
      probe();
    }, currentInterval);

    // Quando a aba acorda ou o usuário foca na janela, sonda imediatamente
    const handleReactivation = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        probe();
      }
    };

    document.addEventListener('visibilitychange', handleReactivation);
    window.addEventListener('focus', handleReactivation);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
      inflightRef.current?.abort();
      inflightRef.current = null;
    };
  }, [enabled, intervalMs, isServerReachable, probe]);

  return { isServerReachable, lastChecked, probeNow: probe };
}