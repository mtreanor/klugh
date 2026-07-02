import React, { useState } from 'react';
import RuleEditor from './RuleEditor.jsx';

export default function AddRuleTab({ scenario, data, onChanged, onExit }) {
  const [key, setKey] = useState(0); // remount to reset the form after a successful add
  const [flash, setFlash] = useState(null);

  if (data.rulesets.length === 0) {
    return <div className="empty">This scenario has no ruleset files registered in project.config.json.</div>;
  }

  return (
    <div className="add-tab">
      {flash && <div className="banner ok">{flash}</div>}
      <RuleEditor
        key={key}
        scenario={scenario}
        rulesets={data.rulesets}
        predicates={data.predicates}
        entityNames={data.entityNames}
        mode="add"
        onSaved={() => {
          setFlash('Rule added.');
          setKey(k => k + 1);
          onChanged();
          setTimeout(() => setFlash(null), 3000);
        }}
        onCancel={onExit}
      />
    </div>
  );
}
