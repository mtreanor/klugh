export class RuleSerializer {
  serialize({ rules, worldState = [] }) {
    const parts = rules.map(r => this.serializeRule(r));
    if (worldState.length > 0) parts.push(this.serializeWorldState(worldState));
    return parts.join('\n\n');
  }

  serializeRule({ name, predicates, effects }) {
    const lines = [`rule "${name}"`];

    predicates.forEach((entry, i) => {
      const prefix = i === 0 ? '  ' : '  ^ ';
      lines.push(prefix + this.serializePredicateEntry(entry));
    });

    lines.push('  => ' + effects.map(e => this.serializeRuleEffect(e)).join(', '));

    return lines.join('\n');
  }

  serializePredicateEntry(entry) {
    if ('predicate' in entry && 'importance' in entry && !('type' in entry)) {
      return `${this.serializePredicate(entry.predicate)} [importance: ${entry.importance}]`;
    }
    return this.serializePredicate(entry);
  }

  serializePredicate(pred) {
    if (pred.type === 'private') {
      return this.ownerPrefix(pred) + this.serializePredicate(pred.predicate);
    }
    if (pred.type === 'at-tick') {
      return `${this.serializePredicate(pred.predicate)} [at: ${pred.tick}]`;
    }
    if (pred.type === 'count') {
      return `|${this.serializePredicate(pred.predicate)}| ${pred.operator} ${pred.threshold}`;
    }
    if (pred.type === 'numeric-value') {
      return `${pred.name}(${this.serializeArgs(pred.args)}) ${pred.operator} ${pred.threshold}`;
    }
    if (pred.type === 'negation') {
      return `not ${this.serializePredicate(pred.predicate)}`;
    }
    if (pred.type === 'weak-negation') {
      return `~${this.serializePredicate(pred.predicate)}`;
    }
    if (pred.type === 'explicit-negation') {
      return `-${this.serializePredicate(pred.predicate)}`;
    }
    if (pred.type === 'not-negated') {
      return `not -${this.serializePredicate(pred.predicate)}`;
    }
    if (pred.type === 'historical' || pred.type === 'historical-window') {
      const modifier = pred.window !== undefined ? `[history: ${pred.window}]` : '[history]';
      const base = pred.tier ? `${pred.name}.${pred.tier}` : pred.name;
      return `${base}(${this.serializeArgs(pred.args)}) ${modifier}`;
    }
    if (pred.type === 'temporal-chain') {
      return pred.steps.map((step, i) => {
        const call = `${step.name}(${this.serializeArgs(step.args)})`;
        if (i === 0) return call;
        const gap = step.within !== undefined ? `[${step.within}]` : '';
        return `then${gap} ${call}`;
      }).join(' ');
    }
    if (pred.type === 'numeric-tier') {
      return `${pred.name}.${pred.tier}(${this.serializeArgs(pred.args)})`;
    }
    // 'fact' and 'derived' have the same surface syntax — type is recovered from schema on parse.
    return `${pred.name}(${this.serializeArgs(pred.args)})`;
  }

  serializeArgs(args) {
    return args.map(arg => {
      if (arg === null) return '_';
      return String(arg);
    }).join(', ');
  }

  serializeRuleEffect(effect) {
    const owner = this.ownerPrefix(effect);
    const call  = `${effect.name}(${this.serializeArgs(effect.args)})`;
    // Mirror parseStateOperationCore: an assert places the owner before the '-'
    // (?SELF.-pred), a retract places it after ('not -?SELF.pred').
    if (effect.type === 'assert') {
      const neg = effect.negated ? '-' : '';
      return `${owner}${neg}${call}` + this.strengthSuffix(effect);
    }
    if (effect.type === 'retract') {
      const neg = effect.negated ? '-' : '';
      return `not ${neg}${owner}${call}`;
    }
    if (effect.type === 'adjust-numeric') {
      return `${owner}${call} += ${effect.delta}` + this.strengthSuffix(effect);
    }
    if (effect.type === 'set-numeric') {
      return `${owner}${call} = ${effect.value}` + this.strengthSuffix(effect);
    }
    throw new Error(`Cannot serialize rule effect type: "${effect.type}"`);
  }

  // Private-store owner prefix: ?VAR. or entity. (ownerVar already includes '?').
  ownerPrefix(entry) {
    if (entry.ownerVar)    return `${entry.ownerVar}.`;
    if (entry.ownerEntity) return `${entry.ownerEntity}.`;
    return '';
  }

  serializeWorldState(entries) {
    // Reuse serializeRuleEffect so world-state and rule-effect serialization
    // share one code path and cannot drift (it handles assert/retract/adjust/
    // set-numeric, owner prefixes, negation, and strength). Backdating ([at: N])
    // is the only state-only annotation, appended here.
    const lines = ['world'];
    for (const entry of entries) {
      const at = entry.tick !== undefined ? ` [at: ${entry.tick}]` : '';
      lines.push('  ' + this.serializeRuleEffect(entry) + at);
    }
    return lines.join('\n');
  }

  // Strength is metadata on the fact record; emit it only when it differs from
  // the default of 1.0 (retract effects carry no strength).
  strengthSuffix(entry) {
    return entry.strength !== undefined && entry.strength !== 1
      ? ` [strength: ${entry.strength}]`
      : '';
  }
}
