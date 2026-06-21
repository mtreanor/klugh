import { LogicalVariable } from '../LogicalVariable.js';

export class PredicateUtilitySource {
  constructor(name, args, owner = null) {
    this.name  = name;
    this.args  = args; // array of LogicalVariable | string | number
    this.owner = owner; // LogicalVariable | string | null
  }

  _resolveContext(binding, evaluationContext) {
    if (!this.owner) return evaluationContext;
    const resolved = this.owner instanceof LogicalVariable
      ? binding.resolve(this.owner)
      : this.owner;
    if (resolved == null) return evaluationContext;
    const ownerName = (typeof resolved === 'object' && 'name' in resolved) ? resolved.name : resolved;
    const store = evaluationContext.privateStores?.get(ownerName);
    if (!store) return evaluationContext;
    return evaluationContext.scopedToStore(store);
  }

  evaluate(binding, _entityRegistry, evaluationContext) {
    const numericHandler = evaluationContext.getHandler('numeric');
    if (!numericHandler) return 0;
    const resolvedArgs = this.args.map(arg => {
      const resolved = arg instanceof LogicalVariable ? binding.resolve(arg) : arg;
      return numericHandler.toFactArg(resolved);
    });
    const ctx = this._resolveContext(binding, evaluationContext);
    return numericHandler.getValue(this.name, resolvedArgs, ctx);
  }

  scoreWithBreakdown(binding, _entityRegistry, evaluationContext) {
    const numericHandler = evaluationContext.getHandler('numeric');
    if (!numericHandler) return { type: 'predicate', name: this.name, args: [], value: 0, numericRecord: null, score: 0 };
    const resolvedArgs = this.args.map(arg => {
      const resolved = arg instanceof LogicalVariable ? binding.resolve(arg) : arg;
      return numericHandler.toFactArg(resolved);
    });
    const ctx = this._resolveContext(binding, evaluationContext);
    const value       = numericHandler.getValue(this.name, resolvedArgs, ctx);
    const numericRecord = numericHandler.getRecord(this.name, resolvedArgs);
    return { type: 'predicate', name: this.name, args: resolvedArgs, value, numericRecord, score: value };
  }
}
