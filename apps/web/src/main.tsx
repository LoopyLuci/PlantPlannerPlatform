import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// The offline shell is registered in production builds only. In development the
// file changes on every save, and a cached copy would hide the change.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
