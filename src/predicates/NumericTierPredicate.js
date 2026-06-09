import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

export class NumericTierPredicate extends Predicate {
  constructor(name, args, tier) {
    super();
    this.name = name;
    this.args = args;
    this.tier = tier;
  }

  evaluate(binding, evaluationContext) {
    return evaluationContext.getHandler('numeric').evaluate(this, binding, evaluationContext);
  }

  getVariables() {
    return this.args.filter(arg => arg instanceof LogicalVariable);
  }

  describe(binding) {
    return `${this.name}.${this.tier}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')})`;
  }

  toString() {
    return `${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')}) is ${this.tier}`;
  }
}
