import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA.js';

export const PWAUpdateBanner: React.FC = () => {
  const { isUpdateAvailable, updateAndReload } = usePWA();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isUpdateAvailable && !dismissed) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isUpdateAvailable, dismissed]);

  if (!isUpdateAvailable || dismissed) return null;

  return (
    <div
      className={`fixed top-16 right-4 z-[95] transition-all duration-300 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-950 border border-emerald-800 rounded-xl shadow-2xl shadow-emerald-950/50 min-w-[280px]">
        <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-300">
            Nova versão disponível
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            Recarregue para aplicar a atualização
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={updateAndReload}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Atualizar
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Dispensar"
            className="p-1 rounded-md text-emerald-600 hover:text-emerald-400 hover:bg-emerald-900 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
