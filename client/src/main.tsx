import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { registerPWA } from './pwa.js';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento root nao encontrado');
}

// Service Worker: estrategia autoUpdate via Workbox (vite-plugin-pwa).
// Roda antes do React para que o shell esteja em cache o mais cedo possivel.
registerPWA();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
