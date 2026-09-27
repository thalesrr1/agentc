import { useEffect, useState } from 'react';
import { ServerCrash, RefreshCw, X } from 'lucide-react';
import { useServerHealth } from '../../hooks/useServerHealth.js';

const SERVER_LABEL = 'localhost:3000';
const HIDE_GRACE_MS = 250;

export function ServerOfflineBanner() {
  const { isServerReachable, lastChecked, probeNow } = useServerHealth();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Auto-hide grace: when the server becomes reachable, wait a beat so
  // the banner does not flicker during a transient blip. Also clear the
  // dismissed flag so a future outage surfaces the banner again.
  useEffect(() => {
    if (isServerReachable) {
      setDismissed(false);
      const t = window.setTimeout(() => setVisible(false), HIDE_GRACE_MS);
      return () => window.clearTimeout(t);
    }
    setVisible(true);
    return undefined;
  }, [isServerReachable]);

  const handleManualRetry = async () => {
    setRetrying(true);
    try {
      await probeNow();
    } finally {
      setRetrying(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  if (dismissed) {
    return null;
  }

  if (isServerReachable) return null;

  const lastCheckedLabel = lastChecked
    ? lastChecked.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="server-offline-banner"
      className={`fixed bottom-0 left-0 right-0 z-[120] transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-rose-950 border-t border-rose-800 shadow-[0_-12px_24px_-8px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 px-4 py-2.5 text-rose-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-900/70 border border-rose-800 shrink-0">
            <ServerCrash className="w-4 h-4 text-rose-300" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-rose-100 truncate">
              Servidor AgentC inacess&iacute;vel &mdash; inicie o servidor local
            </p>
            <p className="text-[11px] text-rose-300/80 truncate">
              Conex&atilde;o com o backend Fastify perdida. Verifique se o
              processo em{' '}
              <code className="px-1.5 py-0.5 rounded bg-rose-900/60 border border-rose-800/80 font-mono text-[10.5px] text-rose-200">
                {SERVER_LABEL}
              </code>{' '}
              est&aacute; ativo.
              <span className="ml-2 text-rose-400/70">
                &uacute;ltima verifica&ccedil;&atilde;o: {lastCheckedLabel}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-900/60 hover:bg-rose-900 text-rose-100 border border-rose-800 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              <RefreshCw
                className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`}
              />
              {retrying ? 'Verificando…' : 'Tentar reconectar'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              title="Dispensar"
              className="p-1 rounded-md text-rose-400 hover:text-rose-100 hover:bg-rose-900/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServerOfflineBanner;