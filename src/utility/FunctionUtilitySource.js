import { applyFunction } from '../numericOps.js';

// Named numeric functions over utility sources: min, max, abs, clamp, pow.
// (min/max here are the two-or-more-argument function form, distinct from the
// bare `min a b` aggregator over a source list — the `(` disambiguates.)
export class FunctionUtilitySource {
  constructor(name, args) {
    this.name = name;
    this.args = args; // utility sources
  }

  _apply(vs) {
    return applyFunction(this.name, vs) ?? 0;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    return this._apply(this.args.map(a => a.evaluate(binding, entityRegistry, evaluationContext)));
  }

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const args = this.args.map(a => a.scoreWithBreakdown(binding, entityRegistry, evaluationContext));
    return { type: 'function', name: this.name, args, score: this._apply(args.map(a => a.score)) };
  }
}
