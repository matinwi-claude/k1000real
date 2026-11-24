import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PartsApp, type LineArt } from './PartsApp';
import '../styles/global.css';
import './parts.css';

function Root() {
  const [art, setArt] = useState<{ aircraft: LineArt; payloads: LineArt } | null>(null);
  useEffect(() => {
    void Promise.all([import('./lineart.json'), import('./lineart-payloads.json')]).then(([a, p]) =>
      setArt({ aircraft: a.default as unknown as LineArt, payloads: p.default as unknown as LineArt }),
    );
  }, []);
  if (!art) return <div className="pa-root pa-loading" />;
  return <PartsApp art={art.aircraft} payloadArt={art.payloads} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
