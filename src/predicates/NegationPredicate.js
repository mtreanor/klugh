import { Predicate } from '../Predicate.js';

export class NegationPredicate extends Predicate {
  predicateIsNegation = true;

  constructor(predicate) {
    super();
    this.predicate = predicate;
  }

  evaluate(binding, evaluationContext) {
    return !this.predicate.evaluate(binding, evaluationContext);
  }

  // Variables inside a negation are not enumerated by the RuleEvaluator —
  // they should already be bound by positive predicates in the same rule,
  // or be wildcards (null). New variables introduced only inside a negation
  // would lead to unbound resolution, which is not meaningful.
  getVariables() {
    return [];
  }

  getBindingVariables() {
    return [];
  }

  getRequiredBoundVariables() {
    return this.predicate.getVariables();
  }

  describe(binding) {
    return `not ${this.predicate.describe(binding)}`;
  }

  toString() {
    return `NOT ${this.predicate.toString()}`;
  }
}
