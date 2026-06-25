import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { toFactArg } from '../entityValue.js';

// True if the named fact was asserted within the given tick window.
// window = null means ever (no time constraint); window = N means within the last N ticks.
// When tier is set, checks whether a numeric predicate was ever in that tier rather than
// whether a boolean fact was ever true.
export class HistoricalWindowPredicate extends Predicate {
  constructor(name, args, window = null, tier = null) {
    super();
    this.name   = name;
    this.args   = args;
    this.window = window;
    this.tier   = tier;
  }

  evaluate(binding, evaluationContext) {
    const currentTick = evaluationContext.currentTick;

    if (this.tier !== null) {
      const handler = evaluationContext.getHandler('numeric');
      const resolvedArgs = this.args.map(arg => toFactArg(binding.resolve(arg)));
      if (this.window === null) {
        return handler.wasEverInTier(this.name, resolvedArgs, this.tier, evaluationContext);
      }
      return handler.wasEverInTierInWindow(this.name, resolvedArgs, this.tier, this.window, currentTick, evaluationContext);
    }

    const handler = evaluationContext.getHandler('factStore');
    return handler.evaluateHistoricalWindow(this, binding, this.window, currentTick, evaluationContext);
  }

  getVariables() {
    return this.args.filter(a => a instanceof LogicalVariable);
  }

  describe(binding) {
    const argsStr = this.args.map(a => Predicate.renderArg(a, binding)).join(', ');
    const modifier = this.window === null ? '[history]' : `[history: ${this.window}]`;
    const base = this.tier ? `${this.name}.${this.tier}` : this.name;
    return `${base}(${argsStr}) ${modifier}`;
  }

  toString() {
    const argsStr = this.args.map(a => a?.toString() ?? '_').join(', ');
    const modifier = this.window === null ? '[history]' : `[history: ${this.window}]`;
    const base = this.tier ? `${this.name}.${this.tier}` : this.name;
    return `${base}(${argsStr}) ${modifier}`;
  }
}
