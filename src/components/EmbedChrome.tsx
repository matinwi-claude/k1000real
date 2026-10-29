import { useEffect, useState } from 'react';
import { useStore } from '../store';

const touch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function fullUrl() {
  const u = new URL(window.location.href);
  u.searchParams.delete('embed');
  return u.toString();
}

/**
 * Chrome shown only in embed mode (?embed=1): activation gate so the host page keeps
 * scrolling normally, fullscreen toggle, and a link to the full-page experience.
 */
export function EmbedChrome() {
  const embed = useStore((s) => s.embed);
  const activated = useStore((s) => s.activated);
  const wheelHint = useStore((s) => s.wheelHint);
  const phase = useStore((s) => s.introPhase);
  const [hint, setHint] = useState(false);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    if (!wheelHint) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 1600);
    return () => clearTimeout(t);
  }, [wheelHint]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  if (!embed) return null;
  const canFs = !!document.fullscreenEnabled;
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <>
      <div className="k-embed-actions">
        {canFs && (
          <button onClick={toggleFs} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'} title={fs ? 'Exit fullscreen' : 'Fullscreen'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              {fs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}
        <a href={fullUrl()} target="_blank" rel="noopener" aria-label="Open full experience" title="Open full experience">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      </div>
      {!activated && touch && phase === 'done' && (
        <button className="k-embed-gate" onClick={() => useStore.setState({ activated: true })}>
          <span>TAP TO EXPLORE</span>
        </button>
      )}
      <div className={`k-embed-hint ${hint ? 'show' : ''}`}>CLICK THE MODEL TO ENABLE ZOOM</div>
    </>
  );
}

export function ContextLost() {
  const lost = useStore((s) => s.contextLost);
  if (!lost) return null;
  return (
    <div className="k-context-lost">
      <div>GRAPHICS CONTEXT RESET</div>
      <small>Restoring the viewer…</small>
      <button onClick={() => window.location.reload()}>RELOAD</button>
    </div>
  );
}
