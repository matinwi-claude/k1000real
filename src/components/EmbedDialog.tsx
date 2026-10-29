import { useMemo } from 'react';
import { useStore } from '../store';
import { EmbedCodeDialog } from './EmbedCodeDialog';

/** "Embed on your site" for the 3D viewer, pre-filled with the current view. */
export function EmbedDialog() {
  const open = useStore((s) => s.embedOpen);
  const selected = useStore((s) => s.selected);
  const explode = useStore((s) => s.explode);
  const view = useStore((s) => s.view);
  const lighting = useStore((s) => s.lighting);

  const current = useMemo(() => {
    const o: Record<string, string> = {};
    if (selected) o.component = selected;
    const views = [explode > 0.5 && 'exploded', view !== 'exterior' && view].filter(Boolean) as string[];
    if (views.length) o.view = views.join(',');
    if (lighting !== 'studio') o.light = lighting;
    const parts: Record<string, string> = selected ? { component: selected } : {};
    return { '3d': o, parts };
  }, [selected, explode, view, lighting]);

  if (!open) return null;
  return <EmbedCodeDialog onClose={() => useStore.setState({ embedOpen: false })} current={current} />;
}
