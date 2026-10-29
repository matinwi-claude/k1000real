import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { engineRef } from '../engine/engineRef';
import type { EngineStats } from '../engine/DroneEngine';
import { actions } from '../utils/actions';
import { IconClose } from './Icons';

export function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className={`k-toast ${visible ? 'show' : ''}`} role="status">
      {toast?.text}
    </div>
  );
}

/** Engineer-mode diagnostics (unlocked by clicking the logo five times). */
export function EngineerPanel() {
  const engineer = useStore((s) => s.engineer);
  const [stats, setStats] = useState<EngineStats | null>(null);
  useEffect(() => {
    if (!engineer) return;
    const id = setInterval(() => setStats(engineRef.current?.getStats() ?? null), 400);
    return () => clearInterval(id);
  }, [engineer]);
  if (!engineer || !stats) return null;
  const f = (v: number[]) => v.map((x) => (x * 1000).toFixed(0).padStart(5, ' ')).join(' ');
  return (
    <div className="k-eng panel mono">
      <div className="k-eng-title">ENGINEER · DIAGNOSTICS</div>
      <div>
        FPS <b>{stats.fps}</b> · CALLS <b>{stats.calls}</b> · TRIS <b>{(stats.triangles / 1000).toFixed(1)}k</b> · DPR <b>{stats.dpr.toFixed(2)}</b>
      </div>
      <div>CAM {f(stats.camera)}</div>
      <div>TGT {f(stats.target)}</div>
      <div>DIST {(stats.distance * 1000).toFixed(0)} mm</div>
      <div className="dim">Type K-1-0-0-0 for a cinematic pass.</div>
    </div>
  );
}

export function Letterbox() {
  const cinematic = useStore((s) => s.cinematic);
  return (
    <div className={`k-letterbox ${cinematic ? 'show' : ''}`} aria-hidden={!cinematic}>
      <i className="top" />
      <i className="bottom" />
      <div className="k-cine-caption">
        <span>K1000</span> CINEMATIC SEQUENCE · ESC TO EXIT
      </div>
    </div>
  );
}

/** Minimal exit affordance for presentation / free-cam / cinematic (touch has no ESC). */
export function ExitChip() {
  const presentation = useStore((s) => s.presentation);
  const freeCam = useStore((s) => s.freeCam);
  const cinematic = useStore((s) => s.cinematic);
  const [flash, setFlash] = useState(false);
  const active = presentation || freeCam || cinematic;
  useEffect(() => {
    if (!active) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2600);
    return () => clearTimeout(t);
  }, [active]);
  if (!active) return null;
  const label = cinematic ? 'CINEMATIC' : presentation ? 'PRESENTATION' : 'FREE CAM';
  return (
    <button className={`k-exit ${flash ? 'flash' : ''}`} onClick={actions.escape}>
      <span>{label}</span>
      <kbd>ESC</kbd>
      <IconClose size={12} />
    </button>
  );
}
