import { useMemo, useState } from 'react';
import { IconClose } from './Icons';

type Format = 'script' | 'iframe';
export type EmbedTarget = '3d' | 'parts';

export interface EmbedCodeDialogProps {
  onClose: () => void;
  initialTarget?: EmbedTarget;
  /** current-view attributes per target, e.g. { component: 'battery' } */
  current?: Partial<Record<EmbedTarget, Record<string, string>>>;
}

const TARGETS: Record<EmbedTarget, { label: string; path: string; aspect: string; title: string }> = {
  '3d': { label: '3D MODEL', path: '/', aspect: '16/9', title: 'K1000ULE 3D viewer' },
  parts: { label: '2D PARTS ATLAS', path: '/parts', aspect: '16/10', title: 'K1000ULE parts atlas' },
};

/** Copy-paste embed code for the 3D viewer or the 2D parts atlas. Store-free so both apps can use it. */
export function EmbedCodeDialog({ onClose, initialTarget = '3d', current = {} }: EmbedCodeDialogProps) {
  const [target, setTarget] = useState<EmbedTarget>(initialTarget);
  const [format, setFormat] = useState<Format>('script');
  const [keepView, setKeepView] = useState(true);
  const [light, setLight] = useState(false);
  const [height, setHeight] = useState('');
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const t = TARGETS[target];
  const cur = current[target] ?? {};
  const hasCurrent = Object.keys(cur).length > 0;

  const code = useMemo(() => {
    const opts: Record<string, string> = keepView ? { ...cur } : {};
    if (target === 'parts' && light) opts.theme = 'light';
    const h = /^\d+$/.test(height) ? height : '';
    if (format === 'script') {
      const attrs = [
        target === 'parts' ? 'data-k1000="parts"' : 'data-k1000',
        h && `data-height="${h}"`,
        ...Object.entries(opts).map(([k, v]) => `data-${k}="${v}"`),
      ].filter(Boolean);
      return `<div ${attrs.join(' ')}></div>\n<script src="${origin}/embed.js" async></script>`;
    }
    const q = new URLSearchParams({ embed: '1', ...opts }).toString().replace(/%2C/g, ',');
    const size = h ? `height:${h}px` : `aspect-ratio:${t.aspect}`;
    return `<iframe src="${origin}${t.path}?${q}" title="${t.title}"\n  style="width:100%;${size};border:0;border-radius:12px"\n  allow="fullscreen" loading="lazy"></iframe>`;
  }, [format, keepView, cur, target, light, height, origin, t]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="k-modal-backdrop" onClick={onClose}>
      <div className="k-modal panel" role="dialog" aria-modal="true" aria-label="Embed on your site" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3>EMBED ON YOUR SITE</h3>
            <p>Paste this into any web page or site builder's "custom HTML" block.</p>
          </div>
          <button className="k-icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={15} />
          </button>
        </header>

        <div className="k-modal-row">
          <div className="k-seg k-modal-seg" role="group" aria-label="What to embed">
            {(Object.keys(TARGETS) as EmbedTarget[]).map((k) => (
              <button key={k} className={target === k ? 'on' : ''} onClick={() => setTarget(k)}>
                {TARGETS[k].label}
              </button>
            ))}
          </div>
          <div className="k-seg k-modal-seg" role="group" aria-label="Code format">
            <button className={format === 'script' ? 'on' : ''} onClick={() => setFormat('script')}>
              SCRIPT
            </button>
            <button className={format === 'iframe' ? 'on' : ''} onClick={() => setFormat('iframe')}>
              IFRAME
            </button>
          </div>
        </div>

        <pre className="k-code">{code}</pre>

        <div className="k-modal-opts">
          <label>
            <input type="checkbox" checked={keepView} onChange={(e) => setKeepView(e.target.checked)} />
            Open with the current view{hasCurrent ? '' : ' (default view)'}
          </label>
          {target === 'parts' && (
            <label>
              <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
              Light theme
            </label>
          )}
          <label>
            Height
            <input value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} placeholder={`auto ${t.aspect.replace('/', ':')}`} inputMode="numeric" />
            px
          </label>
        </div>

        <div className="k-modal-actions">
          <button className="k-btn-primary" onClick={() => void copy()}>
            {copied ? 'COPIED ✓' : 'COPY CODE'}
          </button>
          <a className="k-btn-line" href="/embed-demo.html" target="_blank" rel="noopener">
            SEE A LIVE EXAMPLE ↗
          </a>
        </div>
        <p className="k-note">
          The embed won't hijack page scrolling, loads only when scrolled into view, and can be controlled from your page (select a part
          {target === '3d' ? ', explode, change view' : ', filter a category'}). Full guide: EMBED.md in the project.
        </p>
      </div>
    </div>
  );
}
