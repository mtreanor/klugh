import { Predicate } from '../Predicate.js';

// ~pred: true when positive belief is absent OR explicit disbelief is present.
// Backs the '~pred(args)' LHS syntax. Under lastWins policy, equivalent to NAF; under
// allow policy, '~pred' and 'not pred' can diverge when both P and -P coexist.
export class WeakNegationPredicate extends Predicate {
  constructor(innerPredicate) {
    super();
    this.innerPredicate = innerPredicate;
  }

  evaluate(binding, evaluationContext) {
    return evaluationContext.getHandler('factStore').evaluateWeak(this.innerPredicate, binding, evaluationContext);
  }

  getVariables() {
    return this.innerPredicate.getVariables();
  }

  describe(binding) {
    return `~${this.innerPredicate.describe(binding)}`;
  }

  toString() {
    return `~${this.innerPredicate.toString()}`;
  }
}
