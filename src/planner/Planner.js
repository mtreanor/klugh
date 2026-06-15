import { Binding } from '../Binding.js';
import { RuleEvaluator } from '../RuleEvaluator.js';
import { inferVariableTypes } from '../inferVariableTypes.js';

export class Planner {
  constructor(actions, schema) {
    this.actions       = actions;
    this.schema        = schema;
    this.ruleEvaluator = new RuleEvaluator();
  }

  findPlan(goalPredicates, initialSnapshot) {
    const queue   = [{ snapshot: initialSnapshot, steps: [] }];
    const visited = new Set([initialSnapshot.stateKey()]);

    while (queue.length > 0) {
      const { snapshot, steps } = queue.shift();
      const evalCtx = snapshot.createEvaluationContext();

      if (this.isGoalSatisfied(goalPredicates, evalCtx)) return steps;

      for (const action of this.actions) {
        const variableTypes = inferVariableTypes(action.preconditions, this.schema);
        const bindings = this.ruleEvaluator.generateAllBindings(
          action.collectVariables(),
          variableTypes,
          snapshot.entityRegistry,
          new Binding(),
          evalCtx,
          action.preconditions
        );

        for (const binding of bindings) {
          if (!action.arePreconditionsMet(binding, evalCtx)) continue;
          const next = snapshot.apply(action, binding);
          const key  = next.stateKey();
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push({ snapshot: next, steps: [...steps, { action, binding }] });
        }
      }
    }

    return null;
  }

  isGoalSatisfied(goalPredicates, evaluationContext) {
    const emptyBinding = new Binding();
    return goalPredicates.every(p => p.evaluate(emptyBinding, evaluationContext));
  }
}
