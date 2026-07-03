import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

// State-range check: true if the fact was *true* (active) at any point within
// the last `window` ticks, regardless of when it was asserted.
//
// Distinct from HistoricalWindowPredicate ([asserted-during: N]), which checks
// for an assertion *event* in the window: a fact asserted long ago and never
// retracted satisfies [during: N] (it has been continuously true) but not
// [asserted-during: N] (no assertion event falls inside the window).
export class DuringPredicate extends Predicate {
  constructor(name, args, window) {
    super();
    this.name   = name;
    this.args   = args;
    this.window = window;
  }

  evaluate(binding, evaluationContext) {
    const handler = evaluationContext.getHandler('factStore');
    return handler.evaluateDuring(this, binding, this.window, evaluationContext.currentTick, evaluationContext);
  }

  getVariables() {
    return this.args.filter(a => a instanceof LogicalVariable);
  }

  describe(binding) {
    const argsStr = this.args.map(a => Predicate.renderArg(a, binding)).join(', ');
    return `${this.name}(${argsStr}) [during: ${this.window}]`;
  }

  toString() {
    const argsStr = this.args.map(a => a?.toString() ?? '_').join(', ');
    return `${this.name}(${argsStr}) [during: ${this.window}]`;
  }
}
