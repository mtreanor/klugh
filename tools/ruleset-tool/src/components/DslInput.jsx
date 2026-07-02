import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useInsert } from '../InsertContext.js';
import { predicateTemplate } from '../predicateTemplate.js';

// A text field (input or textarea) with schema-aware autocomplete for the klugh
// DSL. It completes, at the caret:
//   • predicate names          (default, at a word boundary)
//   • tier names after a dot   ("trust." → none/low/mid/…)
//   • entity names & variables (inside an unclosed argument list)
// It also registers as the predicate sidebar's insert target while focused.
//
// `insertMode` controls what a plain (non-shift) sidebar click does:
//   'replace' — set the whole field to the predicate (search box)
//   'cursor'  — insert the predicate at the caret (rule body)
// A shift-click always appends as a conjunction (or after a trailing `=>`).
const VARIABLES = ['?SELF', '?OTHER', '?X', '?Y', '?Z', '?W'];

export default function DslInput({
  value, onChange, predicates, entityNames = [],
  multiline = false, placeholder = '', rows = 3, className = '',
  insertMode = 'cursor', primary = false,
}) {
  const ref = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const predByName = new Map(predicates.map(p => [p.name, p]));

  // ── Sidebar insert target registration ──
  const insertCtx = useInsert();
  const valueRef = useRef(value);
  valueRef.current = value;

  const inserter = useCallback((template, shift) => {
    const el = ref.current;
    const current = valueRef.current ?? '';
    const caret = el ? el.selectionStart : current.length;
    const { text, pos } = computeInsert(current, template, shift, insertMode, caret);
    onChange(text);
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    });
  }, [onChange, insertMode]);

  useEffect(() => {
    if (!insertCtx) return undefined;
    if (primary) insertCtx.register(inserter);
    return () => insertCtx.clear(inserter);
  }, [insertCtx, inserter, primary]);

  function computeSuggestions(text, caret) {
    const before = text.slice(0, caret);

    const dot = before.match(/([\w-]+)\.([\w-]*)$/);
    if (dot) {
      const def = predByName.get(dot[1]);
      if (def && def.tiers.length) {
        return def.tiers
          .filter(t => t.startsWith(dot[2]))
          .map(t => ({ label: t, insert: t, kind: 'tier', replace: dot[2].length }));
      }
    }

    const opens = (before.match(/\(/g) || []).length;
    const closes = (before.match(/\)/g) || []).length;
    if (opens > closes) {
      const partial = (before.match(/[^,()\s]*$/) || [''])[0];
      const pool = [...VARIABLES, ...entityNames];
      return pool
        .filter(c => c.toLowerCase().startsWith(partial.toLowerCase()))
        .slice(0, 12)
        .map(c => ({ label: c, insert: c, kind: c.startsWith('?') ? 'var' : 'entity', replace: partial.length }));
    }

    const partial = (before.match(/[\w-]*$/) || [''])[0];
    if (!partial) return [];
    return predicates
      .filter(p => p.name.toLowerCase().startsWith(partial.toLowerCase()))
      .slice(0, 12)
      .map(p => ({
        label: p.name,
        detail: `${p.type}(${p.args.join(', ')})`,
        insert: predicateTemplate(p),
        caretBack: 0,
        kind: 'pred',
        replace: partial.length,
      }));
  }

  function refresh() {
    const el = ref.current;
    if (!el) return;
    const s = computeSuggestions(el.value, el.selectionStart);
    setSuggestions(s);
    setActive(0);
    setOpen(s.length > 0);
  }

  function apply(sug) {
    const el = ref.current;
    const caret = el.selectionStart;
    const text = el.value;
    const start = caret - sug.replace;
    const next = text.slice(0, start) + sug.insert + text.slice(caret);
    const newCaret = start + sug.insert.length - (sug.caretBack || 0);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  }

  function onKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!multiline || e.key === 'Tab' || open) { e.preventDefault(); apply(suggestions[active]); }
    } else if (e.key === 'Escape') { setOpen(false); }
  }

  const commonProps = {
    ref,
    value,
    placeholder,
    className: `dsl-input ${className}`,
    spellCheck: false,
    onChange: (e) => { onChange(e.target.value); },
    onKeyUp: (e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) refresh(); },
    onClick: refresh,
    onFocus: () => { insertCtx?.register(inserter); },
    onKeyDown,
    onBlur: () => setTimeout(() => setOpen(false), 120),
  };

  return (
    <div className="dsl-wrap">
      {multiline
        ? <textarea {...commonProps} rows={rows} />
        : <input {...commonProps} type="text" />}
      {open && (
        <ul className="dsl-suggest">
          {suggestions.map((s, i) => (
            <li
              key={s.label + i}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); apply(s); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`tag tag-${s.kind}`}>{s.kind}</span>
              <span className="sug-label">{s.label}</span>
              {s.detail && <span className="sug-detail">{s.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Compute the new field text when the sidebar inserts `template`.
//   replace mode + plain click → the field becomes exactly the template
//   otherwise → splice at the caret (cursor mode) or append (replace+shift),
//   joined by a connector that respects a trailing `=>` and shift-conjunction.
function computeInsert(current, template, shift, mode, caret) {
  if (mode === 'replace' && !shift) {
    return { text: template, pos: template.length };
  }
  const at = mode === 'cursor' ? caret : current.length;
  const before = current.slice(0, at);
  const after = current.slice(at);
  const piece = connector(before, shift) + template;
  return { text: before + piece + after, pos: (before + piece).length };
}

function connector(before, shift) {
  const t = before.replace(/\s+$/, '');
  if (t === '') return '';          // nothing before → no separator
  if (/=>$/.test(t)) return ' ';    // right after an arrow → start the RHS
  if (/[(^]$/.test(t)) return ' ';  // right after '(' or '^'
  return shift ? ' ^ ' : ' ';       // shift → conjunction; plain → a space
}
