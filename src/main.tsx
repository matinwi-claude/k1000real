import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { readUrlState } from './utils/url';
import { initEmbedBridge } from './utils/embedBridge';
import './styles/global.css';

if (import.meta.env.DEV) {
  void import('./engine/engineRef').then(({ engineRef }) => {
    (window as unknown as Record<string, unknown>).__k1000 = { store: useStore, engine: engineRef };
  });
}

// Restore shareable state from the URL before first render.
useStore.setState(readUrlState());
initEmbedBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
