import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PartsApp, type LineArt } from './PartsApp';
import '../styles/global.css';
import './parts.css';

/** Tall narrow screens get the portrait drawing (loose parts stacked under the aircraft). */
const isPortrait = () => window.innerWidth < 760 && window.innerHeight > window.innerWidth * 1.15;
const load = (portrait: boolean): Promise<LineArt> =>
  (portrait ? import('./lineart-portrait.json') : import('./lineart.json')).then((m) => m.default as unknown as LineArt);

function Root() {
  const [portrait, setPortrait] = useState(isPortrait);
  const [art, setArt] = useState<LineArt | null>(null);
  useEffect(() => {
    const on = () => setPortrait(isPortrait());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    let live = true;
    void load(portrait).then((a) => live && setArt(a));
    return () => {
      live = false;
    };
  }, [portrait]);
  if (!art) return <div className="pa-root pa-loading" />;
  return <PartsApp art={art} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
