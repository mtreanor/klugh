import { Predicate } from './Predicate.js';
import { LogicalVariable } from './LogicalVariable.js';

export class Rule {
  constructor(name, predicates, effects) {
    this.name = name;
    // Each entry is normalised to { predicate, importance }.
    // Bare predicates are accepted and given a default importance of 1.0.
    // We use instanceof rather than property presence because some predicates
    // (e.g. NegationPredicate) have a 'predicate' property of their own.
    this.predicateEntries = predicates.map(p =>
      p instanceof Predicate ? { predicate: p, importance: 1.0 } : p
    );
    this.effects = effects;
  }

  collectVariables() {
    const seen = new Set();
    const variables = [];
    const add = v => { if (!seen.has(v.name)) { seen.add(v.name); variables.push(v); } };

    for (const { predicate } of this.predicateEntries) {
      for (const v of predicate.getVariables()) add(v);
    }
    // Effects may introduce variables (e.g. ?Y) not present in any predicate
    // — happens when removes all predicates from a rule. Without this,
    // generateAllBindings never discovers those variables and the effect can't fire.
    for (const effect of (Array.isArray(this.effects) ? this.effects : [])) {
      for (const arg of effect.args ?? []) {
        if (arg instanceof LogicalVariable) add(arg);
      }
    }
    return variables;
  }
}

// Helper for specifying predicate importance inline within a rule definition.
// Usage: weighted(new FactPredicate('knows', SELF, Y), 2.0)
export function weighted(predicate, importance) {
  return { predicate, importance };
}
