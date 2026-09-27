import { registerSW } from 'virtual:pwa-register';
import type { RegisterSWOptions } from 'virtual:pwa-register';

type Listener<T> = (value: T) => void;

interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateSW: (reloadPage?: boolean) => Promise<void>;
}

const state: PwaState = {
  needRefresh: false,
  offlineReady: false,
  updateSW: async () => {
    /* preenchido em registerPWA() */
  },
};

const needRefreshListeners = new Set<Listener<boolean>>();
const offlineReadyListeners = new Set<Listener<boolean>>();

function emit<K extends keyof PwaState>(key: K, value: PwaState[K]) {
  state[key] = value;
  if (key === 'needRefresh') {
    for (const fn of needRefreshListeners) fn(value as boolean);
  } else if (key === 'offlineReady') {
    for (const fn of offlineReadyListeners) fn(value as boolean);
  }
}

function subscribe<K extends keyof PwaState>(
  key: K,
  fn: Listener<PwaState[K]>
): () => void {
  const listeners = (
    key === 'needRefresh' ? needRefreshListeners : offlineReadyListeners
  ) as Set<Listener<PwaState[K]>>;
  listeners.add(fn);
  fn(state[key]);
  return () => {
    listeners.delete(fn);
  };
}

export function getPwaState(): Readonly<PwaState> {
  return state;
}

export function onNeedRefresh(fn: Listener<boolean>): () => void {
  return subscribe('needRefresh', fn);
}

export function onOfflineReady(fn: Listener<boolean>): () => void {
  return subscribe('offlineReady', fn);
}

/**
 * Registra o Service Worker gerado pelo Workbox.
 * Deve ser chamado uma unica vez na bootstrap do React (main.tsx).
 *
 * Estrategia: autoUpdate. Quando uma nova build for detectada, o SW novo
 * fica em estado "waiting"; expomos `needRefresh=true` para que a UI
 * ofereca "Atualizar" quando o usuario quiser.
 */
export function registerPWA() {
  const options: RegisterSWOptions = {
    immediate: true,

    onNeedRefresh() {
      emit('needRefresh', true);
    },

    onOfflineReady() {
      emit('offlineReady', true);
      console.info('[AgentC PWA] Pronto para uso offline.');
    },

    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      console.info('[AgentC PWA] Service Worker registrado:', swUrl);

      // Checa atualizacao a cada hora enquanto a aba estiver aberta.
      setInterval(
        () => {
          registration.update().catch(() => {
            /* offline: ignora */
          });
        },
        60 * 60 * 1000
      );
    },

    onRegisterError(error) {
      console.error('[AgentC PWA] Falha ao registrar Service Worker:', error);
    },
  };

  const updateSW = registerSW(options);
  state.updateSW = async (reloadPage = true) => {
    await updateSW(reloadPage);
  };

  window.addEventListener('online', () => {
    // Limpa qualquer cache de API obsoleta quando voltar online.
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          if (name === 'agentc-api') {
            caches.delete(name);
          }
        }
      });
    }
  });

  return state;
}
