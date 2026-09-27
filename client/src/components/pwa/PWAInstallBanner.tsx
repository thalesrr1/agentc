import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA.js';

const DISMISS_KEY = 'agentc_pwa_install_dismissed';

export const PWAInstallBanner: React.FC = () => {
  const { canInstall, isInstalled, install } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Verifica sessionStorage apenas no cliente
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  useEffect(() => {
    // Mostra o banner com pequeno delay para animar slide-up
    if (canInstall && !isInstalled && !dismissed) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [canInstall, isInstalled, dismissed]);

  if (!canInstall || isInstalled || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const handleInstall = async () => {
    const accepted = await install();
    if (!accepted) handleDismiss();
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[90] transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[#18181b] border-t border-[#3f3f46] shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center">
            <Download className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#f4f4f5]">
              Instalar AgentC como app
            </p>
            <p className="text-[11px] text-[#71717a] truncate">
              Acesso rápido e experiência standalone no desktop
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            title="Agora não"
            className="p-1.5 rounded-md text-[#71717a] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
