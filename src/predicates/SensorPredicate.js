import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { SensorProvenance } from '../provenance/SensorProvenance.js';

export class SensorPredicate extends Predicate {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
  }

  evaluate(binding, evaluationContext) {
    const handler     = evaluationContext.getHandler('sensor');
    const resolvedArgs = this._resolveArgs(binding);
    return handler.evaluate(this, resolvedArgs, evaluationContext);
  }

  // Returns a SensorProvenance snapshot using the outcome cached by the most
  // recent evaluate() call. Called by RuleEvaluator.applyRule() immediately
  // after evaluate(), so the cache is always current.
  explain() {
    const cached = this._cachedOutcome;
    if (!cached) return null;
    return new SensorProvenance(this.name, cached.resolvedArgs ?? [], cached.result, cached.detail);
  }

  getVariables() {
    return this.args.filter(arg => arg instanceof LogicalVariable);
  }

  describe(binding) {
    return `${this.name}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')})`;
  }

  toString() {
    return `${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')})`;
  }

  _resolveArgs(binding) {
    return this.args.map(arg => {
      if (!(arg instanceof LogicalVariable)) return arg;
      const v = binding.resolve(arg);
      return (v !== null && typeof v === 'object' && 'name' in v) ? v.name : v;
    });
  }
}
