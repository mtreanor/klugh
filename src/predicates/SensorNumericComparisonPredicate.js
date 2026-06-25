import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { SensorProvenance } from '../provenance/SensorProvenance.js';
import { toFactArg } from '../entityValue.js';

export class SensorNumericComparisonPredicate extends Predicate {
  constructor(name, args, operator, threshold) {
    super();
    this.name      = name;
    this.args      = args;
    this.operator  = operator;
    this.threshold = threshold;
  }

  evaluate(binding, evaluationContext) {
    const handler     = evaluationContext.getHandler('sensor');
    const resolvedArgs = this._resolveArgs(binding);
    return handler.evaluateComparison(this, resolvedArgs, evaluationContext);
  }

  explain() {
    const c = this._cachedOutcome;
    if (!c) return null;
    return new SensorProvenance(this.name, c.resolvedArgs, c.result, c.detail, c.value);
  }

  getVariables() {
    return this.args.filter(a => a instanceof LogicalVariable);
  }

  describe(binding) {
    return `${this.name}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')}) ${this.operator} ${this.threshold}`;
  }

  toString() {
    return `${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')}) ${this.operator} ${this.threshold}`;
  }

  _resolveArgs(binding) {
    return this.args.map(arg => {
      if (!(arg instanceof LogicalVariable)) return arg;
      return toFactArg(binding.resolve(arg));
    });
  }
}
