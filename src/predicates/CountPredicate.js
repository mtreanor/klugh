import { Predicate } from '../Predicate.js';

export class CountPredicate extends Predicate {
  constructor(innerPredicate, countingVars, countingVarTypes, operator, threshold) {
    super();
    this.innerPredicate   = innerPredicate;
    this.countingVars     = countingVars;
    this.countingVarTypes = countingVarTypes;
    this.operator         = operator;
    this.threshold        = threshold;
  }

  evaluate(binding, evaluationContext) {
    const entityRegistry = evaluationContext.entityRegistry;
    const entityLists    = this.countingVars.map(v => {
      const type = this.countingVarTypes.get(v.name) ?? 'agent';
      return entityRegistry.get(type) ?? [];
    });

    let count = 0;
    for (const combination of this.cartesian(entityLists)) {
      let extendedBinding = binding;
      for (let i = 0; i < this.countingVars.length; i++) {
        extendedBinding = extendedBinding.extend(this.countingVars[i], combination[i]);
      }
      if (this.innerPredicate.evaluate(extendedBinding, evaluationContext)) count++;
    }

    if (this.operator === '>')  return count > this.threshold;
    if (this.operator === '<')  return count < this.threshold;
    if (this.operator === '>=') return count >= this.threshold;
    if (this.operator === '<=') return count <= this.threshold;
    return count === this.threshold;
  }

  getVariables() {
    const countingNames = new Set(this.countingVars.map(v => v.name));
    return this.innerPredicate.getVariables().filter(v => !countingNames.has(v.name));
  }

  *cartesian(entityLists) {
    if (entityLists.length === 0) { yield []; return; }
    const [head, ...tail] = entityLists;
    for (const entity of head) {
      for (const rest of this.cartesian(tail)) {
        yield [entity, ...rest];
      }
    }
  }

  describe(binding) {
    return `|${this.innerPredicate.describe(binding)}| ${this.operator} ${this.threshold}`;
  }

  toString() {
    return `|${this.innerPredicate}| ${this.operator} ${this.threshold}`;
  }
}
