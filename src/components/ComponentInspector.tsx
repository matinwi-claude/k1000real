import { useStore } from '../store';
import { getComponent, specSheet } from '../data/components';
import { actions } from '../utils/actions';
import { IconClose } from './Icons';

/** Specifications panel for the selected component: name, group and material. */
export function ComponentInspector() {
  const selected = useStore((s) => s.selected);
  const c = getComponent(selected);
  if (!c) return null;
  const spec = specSheet(c.id);

  return (
    <aside className="k-inspector panel" key={c.id} aria-label={`${c.name} specifications`}>
      <span className="k-callout-anchor" data-callout-anchor />
      <header className="k-insp-head">
        <h2>SPECIFICATIONS</h2>
        <button className="k-icon-btn k-insp-close" onClick={() => actions.select(null)} aria-label="Close specifications">
          <IconClose size={15} />
        </button>
      </header>
      <dl className="k-insp-facts">
        <div>
          <dt>Name</dt>
          <dd>{c.name}</dd>
        </div>
        <div>
          <dt>Group</dt>
          <dd>{spec.group}</dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>{spec.material}</dd>
        </div>
      </dl>
    </aside>
  );
}
