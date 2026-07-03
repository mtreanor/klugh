import { Predicate } from '../Predicate.js';

// Evaluates its inner predicate as of a fixed tick, regardless of the
// evaluation context's current tick. Lets a single rule body reason across
// multiple points in time.
//
// `relative: false` (`[tick: N]`) evaluates at the absolute tick N.
// `relative: true`  (`[ago: N]`)  evaluates at currentTick − N, resolved per
// evaluation since currentTick is only known then.
export class AtTickPredicate extends Predicate {
  constructor(inner, tick, relative = false) {
    super();
    this.inner    = inner;
    this.tick     = tick;
    this.relative = relative;
  }

  effectiveTick(evaluationContext) {
    return this.relative ? evaluationContext.currentTick - this.tick : this.tick;
  }

  evaluate(binding, evaluationContext) {
    return this.inner.evaluate(binding, evaluationContext.withTick(this.effectiveTick(evaluationContext)));
  }

  getVariables() {
    return this.inner.getVariables();
  }

  getBindingVariables() {
    return this.inner.getBindingVariables();
  }

  getRequiredBoundVariables() {
    return this.inner.getRequiredBoundVariables();
  }

  modifier() {
    return this.relative ? `[ago: ${this.tick}]` : `[tick: ${this.tick}]`;
  }

  describe(binding) {
    return `${this.inner.describe(binding)} ${this.modifier()}`;
  }

  toString() {
    return `${this.inner.toString()} ${this.modifier()}`;
  }
}
