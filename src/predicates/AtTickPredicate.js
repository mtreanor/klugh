import { Predicate } from '../Predicate.js';

// Evaluates its inner predicate as of a fixed tick, regardless of the
// evaluation context's current tick. Lets a single rule body reason across
// multiple points in time.
export class AtTickPredicate extends Predicate {
  constructor(inner, tick) {
    super();
    this.inner = inner;
    this.tick  = tick;
  }

  evaluate(binding, evaluationContext) {
    return this.inner.evaluate(binding, evaluationContext.withTick(this.tick));
  }

  getVariables() {
    return this.inner.getVariables();
  }

  describe(binding) {
    return `${this.inner.describe(binding)} [at: ${this.tick}]`;
  }

  toString() {
    return `${this.inner.toString()} [at: ${this.tick}]`;
  }
}
