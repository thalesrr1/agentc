import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Mantem o manifesto canonico estatico em public/manifest.webmanifest.
      manifest: false,
      manifestFilename: 'manifest.webmanifest',

      // autoUpdate: o SW novo assume na proxima recarga, sem prompt invasivo.
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // InjectManifest: usamos um SW customizado em src/sw.ts para
      // fornecer a pagina /offline.html como fallback de navegacao
      // (workbox 7+ removeu o atalho `offlinePage` do generateSW).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Cap no tamanho de cada entrada do precache (offline.html ~8KB).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },

      // SW visivel durante o dev (`npm run dev`) para validar cache/offline.
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },

      workbox: {
        // Precache de todos os assets hashados emitidos pelo Vite + estaticos de public/.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,

        // As rotas de runtime caching e o navigationRoute ficam em
        // `src/sw.ts` (InjectManifest). Aqui ficam apenas os parametros
        // compartilhados que controlam a geracao do SW.
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
