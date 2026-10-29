import type { ReactNode } from 'react';
import { useStore, type CameraView, type LightingMode } from '../store';
import { actions } from '../utils/actions';
import {
  IconCamera,
  IconClose,
  IconExplode,
  IconInspect,
  IconInternal,
  IconLight,
  IconEmbed,
  IconLayers,
  IconLink,
  IconMeasure,
  IconOverlay,
  IconPresent,
  IconRotate,
  IconSection,
  IconSettings,
  IconSound,
  IconXray,
} from './Icons';
import { engineRef } from '../engine/engineRef';

function RailButton({ active, onClick, icon, label, hint }: { active?: boolean; onClick: () => void; icon: ReactNode; label: string; hint?: string }) {
  return (
    <button className={`k-rail-btn ${active ? 'active' : ''}`} onClick={onClick} title={hint ? `${label} (${hint})` : label} aria-pressed={!!active}>
      <span className="k-rail-icon">{icon}</span>
      <span className="k-rail-label">{label}</span>
      {hint && <span className="k-rail-key">{hint}</span>}
    </button>
  );
}

/** Right-edge tool rail. */
export function ToolRail() {
  const mode = useStore((s) => s.mode);
  const explode = useStore((s) => s.explode);
  const view = useStore((s) => s.view);
  const section = useStore((s) => s.section);
  const overlay = useStore((s) => s.overlay);
  const lighting = useStore((s) => s.lighting);
  const embed = useStore((s) => s.embed);
  const embedOpen = useStore((s) => s.embedOpen);
  return (
    <nav className="k-rail fade-on-idle" aria-label="Inspection tools">
      <div className="k-rail-group">
        <RailButton active={mode === 'inspect'} onClick={() => actions.setMode('inspect')} icon={<IconInspect />} label="INSPECT" hint="I" />
        <RailButton active={mode === 'measure'} onClick={() => actions.setMode('measure')} icon={<IconMeasure />} label="MEASURE" hint="M" />
      </div>
      <div className="k-rail-sep" />
      <div className="k-rail-group">
        <RailButton active={explode > 0.01} onClick={actions.toggleExplode} icon={<IconExplode />} label="EXPLODE" hint="E" />
        <RailButton active={view === 'internal'} onClick={() => actions.toggleView('internal')} icon={<IconInternal />} label="INTERNAL" hint="T" />
        <RailButton active={view === 'xray'} onClick={() => actions.toggleView('xray')} icon={<IconXray />} label="X-RAY" hint="X" />
        <RailButton active={!!section} onClick={() => actions.toggleSection()} icon={<IconSection />} label="SECTION" hint="S" />
      </div>
      <div className="k-rail-sep" />
      <div className="k-rail-group">
        <RailButton active={overlay} onClick={actions.toggleOverlay} icon={<IconOverlay />} label="OVERLAY" hint="O" />
        <RailButton active={lighting !== 'studio'} onClick={actions.cycleLighting} icon={<IconLight />} label={lighting.toUpperCase()} hint="L" />
      </div>
      {!embed && (
        <>
          <div className="k-rail-sep" />
          <div className="k-rail-group">
            <RailButton
              onClick={() => {
                const sel = useStore.getState().selected;
                window.location.href = `/parts${sel ? `?component=${sel}` : ''}`;
              }}
              icon={<IconLayers />}
              label="2D PARTS"
            />
            <RailButton active={embedOpen} onClick={() => useStore.setState({ embedOpen: true })} icon={<IconEmbed />} label="EMBED" />
          </div>
        </>
      )}
    </nav>
  );
}

const VIEWS: { id: CameraView; label: string; key: string }[] = [
  { id: 'reset', label: 'RESET', key: '1' },
  { id: 'front', label: 'FRONT', key: '2' },
  { id: 'side', label: 'SIDE', key: '3' },
  { id: 'top', label: 'TOP', key: '4' },
  { id: 'bottom', label: 'BOTTOM', key: '5' },
];

export function ViewButtons() {
  return (
    <div className="k-views fade-on-idle" role="group" aria-label="Camera views">
      {VIEWS.map((v) => (
        <button key={v.id} onClick={() => actions.cameraView(v.id)} title={`${v.label} view (${v.key})`}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

const LIGHTS: { id: LightingMode; label: string; desc: string }[] = [
  { id: 'studio', label: 'STUDIO', desc: 'Product photography' },
  { id: 'technical', label: 'TECHNICAL', desc: 'Flat, component clarity' },
  { id: 'night', label: 'NIGHT', desc: 'Low-light cinematic' },
  { id: 'inspection', label: 'INSPECTION', desc: 'Bright directional' },
];

function Toggle({ on, onClick, icon, label, kbd }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; kbd?: string }) {
  return (
    <button className={`k-set-toggle ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="k-set-icon">{icon}</span>
      <span className="k-set-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
      <span className="k-switch" />
    </button>
  );
}

export function SettingsMenu() {
  const open = useStore((s) => s.settingsOpen);
  const lighting = useStore((s) => s.lighting);
  const autoRotate = useStore((s) => s.autoRotate);
  const freeCam = useStore((s) => s.freeCam);
  const presentation = useStore((s) => s.presentation);
  const snd = useStore((s) => s.sound);
  const engineer = useStore((s) => s.engineer);
  const spinTest = useStore((s) => s.spinTest);
  const toggle = () => useStore.setState({ settingsOpen: !open });

  return (
    <div className={`k-settings ${open ? 'open' : ''}`}>
      <button className="k-settings-btn fade-on-idle" onClick={toggle} aria-label="Settings" aria-expanded={open}>
        {open ? <IconClose /> : <IconSettings />}
      </button>
      {open && (
        <div className="k-settings-panel" role="dialog" aria-label="Settings">
          <section>
            <h4>LIGHTING</h4>
            <div className="k-light-grid">
              {LIGHTS.map((l) => (
                <button key={l.id} className={lighting === l.id ? 'on' : ''} onClick={() => actions.setLighting(l.id)}>
                  <span className={`k-light-swatch ${l.id}`} />
                  <span>{l.label}</span>
                  <small>{l.desc}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>CAMERA</h4>
            <Toggle on={autoRotate} onClick={actions.toggleAutoRotate} icon={<IconRotate size={15} />} label="AUTO ROTATE" kbd="R" />
            <Toggle on={freeCam} onClick={actions.toggleFreeCam} icon={<IconCamera size={15} />} label="FREE CAM" kbd="C" />
            <Toggle on={presentation} onClick={actions.togglePresentation} icon={<IconPresent size={15} />} label="PRESENTATION" kbd="P" />
          </section>
          <section>
            <h4>INTERFACE</h4>
            <Toggle on={snd} onClick={actions.toggleSound} icon={<IconSound size={15} off={!snd} />} label="INTERFACE SOUND" />
            <button className="k-set-action" onClick={() => void actions.copyLink()}>
              <IconLink size={15} /> COPY LINK TO THIS VIEW
            </button>
            <button className="k-set-action" onClick={() => useStore.setState({ embedOpen: true, settingsOpen: false })}>
              <IconEmbed size={15} /> EMBED ON YOUR SITE
            </button>
          </section>
          {engineer && (
            <section className="eng">
              <h4>ENGINEER</h4>
              <Toggle on={spinTest} onClick={() => useStore.setState({ spinTest: !spinTest })} icon={<IconRotate size={15} />} label="ROTOR SPIN TEST" />
              <WireframeToggle />
            </section>
          )}
          <section className="k-shortcuts">
            <h4>SHORTCUTS</h4>
            <div className="k-kbd-grid">
              <span><kbd>1</kbd>–<kbd>5</kbd> views</span>
              <span><kbd>E</kbd> explode</span>
              <span><kbd>I</kbd> inspect</span>
              <span><kbd>M</kbd> measure</span>
              <span><kbd>T</kbd> internal</span>
              <span><kbd>X</kbd> x-ray</span>
              <span><kbd>S</kbd> section</span>
              <span><kbd>O</kbd> overlay</span>
              <span><kbd>F</kbd> focus</span>
              <span><kbd>H</kbd> hide part</span>
              <span><kbd>B</kbd> components</span>
              <span><kbd>ESC</kbd> back</span>
            </div>
          </section>
          <p className="k-disclaimer">
            Interactive visualization of the Kraus Hamdani Aerospace K1000ULE. Geometry is procedurally modelled from public
            product imagery; absolute scale and internal layout are illustrative. Specs tagged PUBLISHED come from the public
            product page — everything else is a placeholder, not official engineering data.
          </p>
        </div>
      )}
    </div>
  );
}

function WireframeToggle() {
  const on = useStore((s) => s.wireframe);
  return (
    <Toggle
      on={on}
      onClick={() => {
        useStore.setState({ wireframe: !on });
        engineRef.current?.setWireframe(!on);
      }}
      icon={<IconSection size={15} />}
      label="WIREFRAME"
    />
  );
}
