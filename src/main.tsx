import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { pushService } from './services/pushService';

// Boot PWA Service Worker for background caching and push alerts
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    pushService.registerServiceWorker().catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(<App />);

