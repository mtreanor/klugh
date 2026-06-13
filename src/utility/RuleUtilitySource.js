import { RuleEvaluator } from '../RuleEvaluator.js';
import { inferVariableTypes } from '../inferVariableTypes.js';

export class RuleUtilitySource {
  constructor(name, predicateEntries, weight) {
    this.name             = name;
    this.predicateEntries = predicateEntries;
    this.weight           = weight;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    const freeVariables = this.collectFreeVariables(binding);
    const variableTypes = inferVariableTypes(this.predicateEntries, evaluationContext.predicateSchema);
    const ruleEvaluator = new RuleEvaluator();
    const bindings      = ruleEvaluator.generateAllBindings(
      freeVariables, variableTypes, entityRegistry, binding, evaluationContext, this.predicateEntries
    );
    let total = 0;
    for (const b of bindings) {
      if (this.predicateEntries.every(({ predicate }) => predicate.evaluate(b, evaluationContext))) {
        total += this.weight;
      }
    }
    return total;
  }

  collectFreeVariables(binding) {
    const seen      = new Set();
    const variables = [];
    for (const { predicate } of this.predicateEntries) {
      for (const v of predicate.getVariables()) {
        if (!seen.has(v.name) && !binding.isBound(v)) {
          seen.add(v.name);
          variables.push(v);
        }
      }
    }
    return variables;
  }
}
