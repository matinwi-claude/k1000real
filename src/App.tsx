import { useStore } from './store';
import { DroneViewer } from './components/DroneViewer';
import { BrandLogo, StatusPanel } from './components/StatusPanel';
import { SettingsMenu, ToolRail, ViewButtons } from './components/Controls';
import { ComponentInspector } from './components/ComponentInspector';
import { ExplodedView } from './components/ExplodedView';
import { SectionControl } from './components/SectionControl';
import { FrameMarks } from './components/FrameMarks';
import { IntroOverlay } from './components/IntroOverlay';
import { EngineerPanel, ExitChip, Letterbox, Toast } from './components/Misc';
import { ContextLost, EmbedChrome } from './components/EmbedChrome';
import { EmbedDialog } from './components/EmbedDialog';
import { useIdle } from './hooks/useIdle';
import { useKeyboard } from './hooks/useKeyboard';
import { useUrlSync } from './hooks/useUrlSync';

export default function App() {
  useIdle();
  useKeyboard();
  useUrlSync();
  const phase = useStore((s) => s.introPhase);
  const idle = useStore((s) => s.uiIdle);
  const presentation = useStore((s) => s.presentation);
  const freeCam = useStore((s) => s.freeCam);
  const cinematic = useStore((s) => s.cinematic);
  const mode = useStore((s) => s.mode);
  const selected = useStore((s) => s.selected);
  const explode = useStore((s) => s.explode);
  const section = useStore((s) => s.section);
  const embed = useStore((s) => s.embed);

  const cls = [
    'app',
    `intro-${phase}`,
    idle && 'is-idle',
    presentation && 'is-presentation',
    freeCam && 'is-free',
    cinematic && 'is-cinematic',
    `mode-${mode}`,
    selected && 'has-selection',
    (explode > 0.001 || section) && 'has-dock',
    embed && 'is-embed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      <DroneViewer />
      <div className="k-ui">
        <FrameMarks />
        <StatusPanel />
        <SettingsMenu />
        <ToolRail />
        <ViewButtons />
        <BrandLogo />
        <EngineerPanel />
        <ComponentInspector />
        <div className="k-dock">
          <ExplodedView />
          <SectionControl />
        </div>
      </div>
      <Letterbox />
      <ExitChip />
      <Toast />
      <EmbedChrome />
      <EmbedDialog />
      <ContextLost />
      <IntroOverlay />
    </div>
  );
}
