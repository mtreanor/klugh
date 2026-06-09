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
    if (pred.type === 'historical') {
      return `${pred.name}(${this.serializeArgs(pred.args)}) [history]`;
    }
    if (pred.type === 'historical-window') {
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
    if (effect.type === 'assert') {
      const prefix = effect.negated ? '-' : '';
      return `${prefix}${effect.name}(${this.serializeArgs(effect.args)})`;
    }
    if (effect.type === 'retract') {
      const negPrefix = effect.negated ? '-' : '';
      return `not ${negPrefix}${effect.name}(${this.serializeArgs(effect.args)})`;
    }
    if (effect.type === 'adjust-numeric') {
      return `${effect.name}(${this.serializeArgs(effect.args)}) += ${effect.delta}`;
    }
    if (effect.type === 'set-numeric') {
      return `${effect.name}(${this.serializeArgs(effect.args)}) = ${effect.value}`;
    }
    throw new Error(`Cannot serialize rule effect type: "${effect.type}"`);
  }

  serializeWorldState(entries) {
    const lines = ['world'];
    for (const entry of entries) {
      if (entry.type === 'assert') {
        const at = entry.tick !== undefined ? ` [at: ${entry.tick}]` : '';
        lines.push(`  ${entry.name}(${this.serializeArgs(entry.args)})${at}`);
      } else if (entry.type === 'set-numeric') {
        lines.push(`  ${entry.name}(${this.serializeArgs(entry.args)}) = ${entry.value}`);
      }
    }
    return lines.join('\n');
  }
}
