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
}
