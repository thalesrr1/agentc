/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-unused-vars */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';
const API_CACHE = 'agentc-api';
const FONTS_CACHE = 'agentc-fonts';
const IMAGES_CACHE = 'agentc-images';
const STATIC_META_CACHE = 'agentc-static-meta';

// ---------------------------------------------------------------------------
// Precache + cleanup
// ---------------------------------------------------------------------------
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Make sure the offline page is always reachable even on first install:
// precache it explicitly with a known revision so Workbox treats it as a
// stable precache entry.
precacheAndRoute([
  { url: OFFLINE_URL, revision: 'agentc-offline-v1' },
]);

// ---------------------------------------------------------------------------
// Runtime caching rules (mirror do generateSW anterior)
// ---------------------------------------------------------------------------

// 1. SSE streams, EventSource, health probes e requisições no-store — NUNCA interceptar com cache.
registerRoute(
  ({ url, request }) =>
    url.pathname.includes('/logs/stream') ||
    url.pathname === '/api/events' ||
    url.pathname.endsWith('/stream') ||
    Boolean(request.headers.get('Accept')?.includes('text/event-stream')) ||
    request.cache === 'no-store' ||
    url.searchParams.has('health'),
  new NetworkOnly()
);

// 2. API do backend Fastify (board, tasks, projects, settings).
// Network-first com timeout curto (3s).
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 2, // 2h máximo
      }),
    ],
  })
);

// Fontes auto-hospedadas.
registerRoute(
  ({ request }) =>
    request.destination === 'font' ||
    /\.(?:woff2?|ttf|eot)$/.test(new URL(request.url).pathname),
  new CacheFirst({
    cacheName: FONTS_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
      }),
    ],
  })
);

// Imagens e icones PWA.
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    /\.(?:png|jpe?g|gif|svg|webp|avif|ico)$/.test(
      new URL(request.url).pathname
    ),
  new CacheFirst({
    cacheName: IMAGES_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
      }),
    ],
  })
);

// Manifesto e favicons.
registerRoute(
  ({ url }) =>
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/favicon.ico',
  new StaleWhileRevalidate({
    cacheName: STATIC_META_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
      }),
    ],
  })
);

// ---------------------------------------------------------------------------
// SPA navigation: shell first, offline.html como ultimo recurso.
// ---------------------------------------------------------------------------
// API e streams NAO sao navegacoes; nao devem ser interceptadas aqui.
const navigationRoute = new NavigationRoute(
  async ({ event, request }) => {
    try {
      // Tenta rede primeiro com cache do shell como fallback de rede.
      return await new NetworkFirst({
        cacheName: 'agentc-shell',
        networkTimeoutSeconds: 3,
      }).handle({ event, request });
    } catch {
      // Se nada disso funcionou, tenta o shell em cache explicitamente.
      const cache = await caches.open('agentc-shell');
      const cachedShell = await cache.match(SHELL_URL);
      if (cachedShell) return cachedShell;

      // Fallback final: pagina offline dedicada.
      const offlineCache = await caches.match(OFFLINE_URL);
      if (offlineCache) return offlineCache;

      throw new Error('No cached response available');
    }
  },
  {
    // Ignora requisicoes que nao sao de pagina (assets, API, streams).
    denylist: [/^\/api\//, /^\/logs\//],
  }
);
registerRoute(navigationRoute);

// Garante que qualquer fetch nao tratado por uma rota (e que nao seja de
// navegacao) tambem respeite o offline page quando aplicavel.
setCatchHandler(async ({ event, request }) => {
  if (event instanceof FetchEvent && request.mode === 'navigate') {
    const cache = await caches.open('agentc-shell');
    const cachedShell = await cache.match(SHELL_URL);
    if (cachedShell) return cachedShell;
    const offlineCache = await caches.match(OFFLINE_URL);
    if (offlineCache) return offlineCache;
  }
  return Response.error();
});

// Habilita `clientsClaim` para que o SW assuma imediatamente apos update.
self.addEventListener('install', () => {
  // skipWaiting fica false para que o SW espere confirmacao do usuario
  // atraves do banner de update (PWAUpdateBanner).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

export {};