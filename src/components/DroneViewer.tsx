import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { engineRef } from '../engine/engineRef';
import { getComponent } from '../data/components';

/**
 * Hosts the WebGL canvas and the screen-space HUD layers. The Three.js engine is
 * code-split and loaded lazily so the shell paints instantly.
 */
export function DroneViewer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const gizmoRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let engine: import('../engine/DroneEngine').DroneEngine | null = null;
    useStore.setState({ loadProgress: 0.15 });
    Promise.all([import('../engine/DroneEngine'), import('../engine/GltfModel')])
      .then(async ([{ DroneEngine }, { loadExternalModel }]) => {
        if (cancelled) return;
        useStore.setState({ loadProgress: 0.45 });
        const external = await loadExternalModel();
        if (cancelled) return;
        useStore.setState({ loadProgress: 0.7, modelSource: external ? 'cad' : 'procedural' });
        // let fonts settle so canvas-drawn labels use the right typeface
        try {
          await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        try {
          engine = new DroneEngine({
            external,
            host: hostRef.current!,
            hud: hudRef.current!,
            gizmo: gizmoRef.current!,
            tooltip: tipRef.current!,
          });
        } catch (e) {
          console.error(e);
          setError('WebGL is unavailable on this device or browser.');
          return;
        }
        engineRef.current = engine;
        useStore.setState({ loadProgress: 1, ready: true });
      })
      .catch((e) => {
        console.error(e);
        setError('Failed to load the 3D engine.');
      });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="k-stage">
      <div className="k-host" ref={hostRef} />
      <div className="k-vignette" />
      <svg className="k-hud" ref={hudRef} />
      <div className="k-gizmo-wrap fade-on-idle">
        <svg className="k-gizmo" ref={gizmoRef} />
      </div>
      <Tooltip innerRef={tipRef} />
      {error && (
        <div className="k-error">
          <div className="k-error-title">VISUALIZATION OFFLINE</div>
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}

function Tooltip({ innerRef }: { innerRef: React.RefObject<HTMLDivElement | null> }) {
  const hovered = useStore((s) => s.hovered);
  const source = useStore((s) => s.hoverSource);
  const selected = useStore((s) => s.selected);
  const mode = useStore((s) => s.mode);
  const c = getComponent(hovered);
  const show = !!c && source === 'canvas' && mode !== 'measure';
  return (
    <div ref={innerRef} className={`k-tooltip ${show ? 'show' : ''}`} aria-hidden>
      {c && (
        <>
          <div className="k-tooltip-name">{c.name.toUpperCase()}</div>
          <div className="k-tooltip-sub">{selected === c.id ? 'Selected' : 'Click to inspect'}</div>
        </>
      )}
    </div>
  );
}
