import { useState, useEffect } from 'react';
import { getPwaState, onNeedRefresh } from '../pwa.js';

function getIsInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Captura o prompt de instalação globalmente (antes do React montar)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event('pwa-installable'));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  window.dispatchEvent(new Event('pwa-installed'));
});

export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(getIsInstalled);
  const [canInstall, setCanInstall] = useState(() => deferredPrompt !== null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(
    () => getPwaState().needRefresh
  );

  useEffect(() => {
    // Monitorar mudança de modo standalone (ex: usuário instala e reabre)
    const mq = window.matchMedia('(display-mode: standalone)');
    const handleMq = () => setIsInstalled(mq.matches);
    mq.addEventListener('change', handleMq);

    // Escutar disponibilidade do prompt de instalação
    const onInstallable = () => setCanInstall(deferredPrompt !== null);
    const onInstalled = () => {
      setCanInstall(false);
      setIsInstalled(true);
    };
    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('pwa-installed', onInstalled);

    // Escutar necessidade de update via pub-sub do pwa.ts
    const unsubRefresh = onNeedRefresh((v) => setIsUpdateAvailable(v));

    return () => {
      mq.removeEventListener('change', handleMq);
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('pwa-installed', onInstalled);
      unsubRefresh();
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    return result.outcome === 'accepted';
  };

  const updateAndReload = () => {
    getPwaState().updateSW(true);
  };

  return { isInstalled, canInstall, isUpdateAvailable, install, updateAndReload };
}
