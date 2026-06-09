import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { SensorProvenance } from '../provenance/SensorProvenance.js';

export class SensorNumericTierPredicate extends Predicate {
  constructor(name, args, tier) {
    super();
    this.name = name;
    this.args = args;
    this.tier = tier;
  }

  evaluate(binding, evaluationContext) {
    const handler     = evaluationContext.getHandler('sensor');
    const resolvedArgs = this._resolveArgs(binding);
    return handler.evaluateTier(this, resolvedArgs, evaluationContext);
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
    return `${this.name}(${this.args.map(a => Predicate.renderArg(a, binding)).join(', ')}) [${this.tier}]`;
  }

  toString() {
    return `${this.name}(${this.args.map(a => a?.toString?.() ?? a).join(', ')}) [${this.tier}]`;
  }

  _resolveArgs(binding) {
    return this.args.map(arg => {
      if (!(arg instanceof LogicalVariable)) return arg;
      const v = binding.resolve(arg);
      return (v !== null && typeof v === 'object' && 'name' in v) ? v.name : v;
    });
  }
}
