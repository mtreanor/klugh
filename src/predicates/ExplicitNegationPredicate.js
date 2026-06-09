import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

// True when an explicit disbelief (-pred) is actively present in the store.
// Backs the '-pred(args)' LHS syntax.
export class ExplicitNegationPredicate extends Predicate {
  constructor(name, ...args) {
    super();
    this.name = name;
    this.args = args;
  }

  evaluate(binding, evaluationContext) {
    return evaluationContext.getHandler('factStore').evaluateExplicitNegation(this, binding, evaluationContext);
  }

  getVariables() {
    return this.args.filter(arg => arg instanceof LogicalVariable);
  }

  describe(binding) {
    return `-${this.name}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')})`;
  }

  toString() {
    return `-${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')})`;
  }
}
