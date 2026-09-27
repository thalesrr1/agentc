import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, X } from 'lucide-react';
import {
  getPwaState,
  onNeedRefresh,
  onOfflineReady,
} from '../../pwa.js';

export function ReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    const offNeed = onNeedRefresh(setNeedRefresh);
    const offOffline = onOfflineReady(setOfflineReady);
    return () => {
      offNeed();
      offOffline();
    };
  }, []);

  const handleReload = async () => {
    await getPwaState().updateSW(true);
  };

  const handleDismiss = () => setOfflineDismissed(true);

  if (needRefresh) {
    return (
      <div
        role="alert"
        data-testid="pwa-update-banner"
        className="fixed bottom-5 left-1/2 z-[110] -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-[#18181b] border border-emerald-500/40 shadow-2xl rounded-xl text-xs text-[#f4f4f5] animate-in fade-in slide-in-from-bottom-2 duration-150"
      >
        <RefreshCw className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>
          Nova versao do AgentC disponivel. Recarregue para aplicar.
        </span>
        <button
          onClick={handleReload}
          className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium border border-emerald-500/40 transition-colors"
        >
          Recarregar
        </button>
      </div>
    );
  }

  if (offlineReady && !offlineDismissed) {
    return (
      <div
        role="status"
        data-testid="pwa-offline-banner"
        className="fixed bottom-5 left-1/2 z-[110] -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-[#18181b] border border-[#3f3f46] shadow-2xl rounded-xl text-xs text-[#f4f4f5] animate-in fade-in slide-in-from-bottom-2 duration-150"
      >
        <Wifi className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>AgentC pronto para uso offline.</span>
        <button
          onClick={handleDismiss}
          aria-label="Fechar aviso"
          className="text-[#71717a] hover:text-[#f4f4f5] p-0.5 rounded transition-colors text-sm ml-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

export default ReloadPrompt;
