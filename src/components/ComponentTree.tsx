import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { CATEGORIES, COMPONENTS, componentsByCategory } from '../data/components';
import { actions } from '../utils/actions';
import { IconChevron, IconClose, IconEye, IconLayers, IconSearch } from './Icons';

/** Expandable component hierarchy with per-part visibility (bottom-left). */
export function ComponentTree() {
  const open = useStore((s) => s.treeOpen);
  const hidden = useStore((s) => s.hidden);
  const selected = useStore((s) => s.selected);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ airframe: true, propulsion: true });
  const [query, setQuery] = useState('');
  const hiddenCount = Object.keys(hidden).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return COMPONENTS.filter((c) => c.name.toLowerCase().includes(q) || c.partNumber.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [query]);

  const toggleCat = (id: string, ids: string[]) => {
    const allHidden = ids.every((i) => hidden[i]);
    useStore.getState().setHiddenMany(ids, !allHidden);
    void id;
  };

  const Item = ({ id }: { id: string }) => {
    const c = COMPONENTS.find((x) => x.id === id)!;
    const isHidden = !!hidden[id];
    return (
      <li
        className={`k-tree-item ${selected === id ? 'sel' : ''} ${isHidden ? 'off' : ''}`}
        onMouseEnter={() => useStore.setState({ hovered: id, hoverSource: 'ui' })}
        onMouseLeave={() => useStore.setState({ hovered: null, hoverSource: null })}
      >
        <button className="k-tree-name" onClick={() => actions.select(selected === id ? null : id, true)}>
          <i className={`k-dot ${c.status}`} />
          <span>{c.name}</span>
        </button>
        <button className="k-eye" onClick={() => useStore.getState().toggleHidden(id)} aria-label={isHidden ? `Show ${c.name}` : `Hide ${c.name}`}>
          <IconEye size={14} off={isHidden} />
        </button>
      </li>
    );
  };

  return (
    <div className={`k-tree-wrap ${open ? 'open' : ''}`}>
      <button className="k-tree-toggle fade-on-idle" onClick={() => useStore.setState({ treeOpen: !open })} aria-expanded={open}>
        <IconLayers size={15} />
        <span>COMPONENTS</span>
        <b>{COMPONENTS.length}</b>
        {hiddenCount > 0 && <em>{hiddenCount} HIDDEN</em>}
      </button>
      {open && (
        <div className="k-tree panel" role="tree">
          <div className="k-tree-head">
            <div className="k-search">
              <IconSearch size={13} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter components" aria-label="Filter components" />
            </div>
            <button className="k-link" onClick={actions.showAll} disabled={hiddenCount === 0}>
              SHOW ALL
            </button>
            <button className="k-icon-btn" onClick={() => useStore.setState({ treeOpen: false })} aria-label="Close components">
              <IconClose size={14} />
            </button>
          </div>
          <div className="k-tree-body">
            {filtered ? (
              <ul>{filtered.length ? filtered.map((c) => <Item key={c.id} id={c.id} />) : <li className="k-empty">No match</li>}</ul>
            ) : (
              CATEGORIES.map((cat) => {
                const items = componentsByCategory(cat.id);
                const ids = items.map((i) => i.id);
                const allHidden = ids.every((i) => hidden[i]);
                const isOpen = !!expanded[cat.id];
                return (
                  <div key={cat.id} className="k-tree-cat">
                    <div className="k-tree-cat-head">
                      <button className="k-tree-cat-name" onClick={() => setExpanded({ ...expanded, [cat.id]: !isOpen })} aria-expanded={isOpen}>
                        <IconChevron size={12} open={isOpen} />
                        <span>{cat.label.toUpperCase()}</span>
                        <small>{items.length}</small>
                      </button>
                      <button className="k-eye" onClick={() => toggleCat(cat.id, ids)} aria-label={`${allHidden ? 'Show' : 'Hide'} ${cat.label}`}>
                        <IconEye size={14} off={allHidden} />
                      </button>
                    </div>
                    {isOpen && (
                      <ul>
                        {items.map((c) => (
                          <Item key={c.id} id={c.id} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
