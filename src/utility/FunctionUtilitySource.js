// Named numeric functions over utility sources: min, max, abs, clamp, pow.
// (min/max here are the two-or-more-argument function form, distinct from the
// bare `min a b` aggregator over a source list — the `(` disambiguates.)
export class FunctionUtilitySource {
  constructor(name, args) {
    this.name = name;
    this.args = args; // utility sources
  }

  _apply(vs) {
    switch (this.name) {
      case 'min':   return Math.min(...vs);
      case 'max':   return Math.max(...vs);
      case 'abs':   return Math.abs(vs[0]);
      case 'pow':   return Math.pow(vs[0], vs[1]);
      case 'clamp': return Math.min(Math.max(vs[0], vs[1]), vs[2]);
    }
    return 0;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    return this._apply(this.args.map(a => a.evaluate(binding, entityRegistry, evaluationContext)));
  }

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const args = this.args.map(a => a.scoreWithBreakdown(binding, entityRegistry, evaluationContext));
    return { type: 'function', name: this.name, args, score: this._apply(args.map(a => a.score)) };
  }
}
