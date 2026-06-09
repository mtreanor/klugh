import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

export class NumericComparisonPredicate extends Predicate {
  constructor(name, args, operator, threshold) {
    super();
    this.name      = name;
    this.args      = args;
    this.operator  = operator;
    this.threshold = threshold;
  }

  evaluate(binding, evaluationContext) {
    return evaluationContext.getHandler('numeric').evaluateComparison(this, binding, evaluationContext);
  }

  getVariables() {
    return this.args.filter(arg => arg instanceof LogicalVariable);
  }

  describe(binding) {
    return `${this.name}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')}) ${this.operator} ${this.threshold}`;
  }

  toString() {
    return `${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')}) ${this.operator} ${this.threshold}`;
  }
}
