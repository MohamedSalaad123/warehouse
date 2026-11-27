import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register service worker for offline warehouse inventory caching
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Periodically check for updated service worker every 30 minutes
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    }
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('wms:offline-ready'));
  },
});

createRoot(document.getElementById('root')!).render(<App />);
