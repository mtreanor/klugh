import { LogicalVariable } from '../LogicalVariable.js';

export class PredicateUtilitySource {
  constructor(name, args) {
    this.name = name;
    this.args = args; // array of LogicalVariable | string | number
  }

  evaluate(binding, _entityRegistry, evaluationContext) {
    const numericHandler = evaluationContext.getHandler('numeric');
    if (!numericHandler) return 0;
    const resolvedArgs = this.args.map(arg => {
      const resolved = arg instanceof LogicalVariable ? binding.resolve(arg) : arg;
      return numericHandler.toFactArg(resolved);
    });
    return numericHandler.getValue(this.name, resolvedArgs, evaluationContext);
  }

  scoreWithBreakdown(binding, _entityRegistry, evaluationContext) {
    const numericHandler = evaluationContext.getHandler('numeric');
    if (!numericHandler) return { type: 'predicate', name: this.name, args: [], value: 0, numericRecord: null, score: 0 };
    const resolvedArgs = this.args.map(arg => {
      const resolved = arg instanceof LogicalVariable ? binding.resolve(arg) : arg;
      return numericHandler.toFactArg(resolved);
    });
    const value       = numericHandler.getValue(this.name, resolvedArgs, evaluationContext);
    const numericRecord = numericHandler.getRecord(this.name, resolvedArgs);
    return { type: 'predicate', name: this.name, args: resolvedArgs, value, numericRecord, score: value };
  }
}
