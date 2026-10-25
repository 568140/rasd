import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Defer PWA Service Worker registration until after initial paint to prioritize fast app startup
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const registerSw = () => {
      import('./services/pushService')
        .then(({ pushService }) => pushService.registerServiceWorker())
        .catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(registerSw);
    } else {
      setTimeout(registerSw, 1200);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>
);

