import React from 'react';
import HighlightedCode from './HighlightedCode.jsx';

// One rule in the inspector list.
export default function RuleCard({ rule, highlighter, onEdit, onDelete }) {
  return (
    <div className="rule-card">
      <div className="rule-head">
        <span className="rule-name">{rule.name}</span>
        <span className="badge">{rule.ruleset}</span>
        {rule.parseError && <span className="badge err">parse error</span>}
        {rule.predicateCount != null && (
          <span className="counts">{rule.predicateCount} cond · {rule.effectCount} eff</span>
        )}
        <span className="spacer" />
        <button className="btn tiny" onClick={() => onEdit(rule)}>Edit</button>
        <button className="btn tiny danger" onClick={() => onDelete(rule)}>Delete</button>
      </div>
      {rule.comment && <div className="rule-comment">{rule.comment}</div>}
      <HighlightedCode
        className="rule-body"
        highlighter={highlighter}
        text={`rule "${rule.name}"\n${rule.bodyText}`}
      />
      {rule.parseError && <div className="rule-parseerr">{rule.parseError}</div>}
    </div>
  );
}
