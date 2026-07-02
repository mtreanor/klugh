import React, { useState } from 'react';
import { useInsert } from '../InsertContext.js';
import { predicateTemplate, tierTemplate } from '../predicateTemplate.js';

// Order predicate groups the way the schema thinks about them.
const TYPE_ORDER = ['boolean', 'numeric', 'derived', 'sensor', 'sensor-numeric'];
const TYPE_LABEL = {
  boolean: 'boolean', numeric: 'numeric', derived: 'derived',
  sensor: 'sensor', 'sensor-numeric': 'sensor · numeric',
};

// Collapsible left panel listing every predicate. Clicking one inserts it into
// the last-focused DSL field (search box or rule body); shift-click adds it as a
// conjunction. Numeric-tier chips insert `pred.tier(...)`.
export default function PredicateSidebar({ predicates = [] }) {
  const insertCtx = useInsert();
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');

  const insert = (template, e) => {
    e.preventDefault(); // keep focus/caret on the target field
    insertCtx?.insert(template, e.shiftKey);
  };

  const q = filter.trim().toLowerCase();
  const shown = q ? predicates.filter(p => p.name.toLowerCase().includes(q)) : predicates;
  const groups = TYPE_ORDER
    .map(type => ({ type, items: shown.filter(p => p.type === type) }))
    .filter(g => g.items.length > 0);

  if (!open) {
    return (
      <aside className="sidebar closed">
        <button className="sidebar-toggle" onClick={() => setOpen(true)} title="Show predicates">
          <span className="vlabel">▸ Predicates</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar open">
      <div className="sidebar-head">
        <span className="sidebar-title">Predicates <span className="dim">({predicates.length})</span></span>
        <button className="btn tiny ghost" onClick={() => setOpen(false)} title="Collapse">◀</button>
      </div>
      <input
        className="sidebar-filter"
        placeholder="filter predicates…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        spellCheck={false}
      />
      <div className="sidebar-hint">click to insert · shift-click to add ^</div>
      <div className="sidebar-list">
        {groups.map(g => (
          <div key={g.type} className="pred-group">
            <div className="pred-group-title">{TYPE_LABEL[g.type] ?? g.type}</div>
            {g.items.map(p => (
              <div key={p.name} className="pred-item">
                <button
                  className="pred-insert"
                  onMouseDown={e => insert(predicateTemplate(p), e)}
                  title="Insert (shift-click to add as a conjunction)"
                >
                  <span className="pred-name">{p.name}</span>
                  <span className="pred-sig">({p.args.join(', ')})</span>
                  {p.symmetric && <span className="pred-flag">sym</span>}
                </button>
                {p.tiers.length > 0 && (
                  <div className="pred-tiers">
                    {p.tiers.map(t => (
                      <button
                        key={t}
                        className="tier-chip"
                        onMouseDown={e => insert(tierTemplate(p, t), e)}
                        title={`Insert ${p.name}.${t}(…)`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="dim" style={{ padding: '10px' }}>No matches.</div>}
      </div>
    </aside>
  );
}
