import { RuleEvaluator } from './RuleEvaluator.js';

// Runs rules to fixpoint, calling onApplication for each fired rule application.
// onApplication(ruleApplication) returns true if a conclusion was committed,
// triggering another pass. Returns false to skip without committing.
// No assertions are made here — side effects belong to the caller.
export class ForwardChainer {
  constructor() {
    this.ruleEvaluator = new RuleEvaluator();
  }

  run(rules, evaluationContext, startingBinding, onApplication) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of rules) {
        const applications = this.ruleEvaluator.evaluate(
          [rule],
          evaluationContext.entityRegistry,
          evaluationContext,
          startingBinding,
          evaluationContext.predicateSchema
        );
        for (const [, appList] of applications) {
          for (const app of appList) {
            if (onApplication(app)) changed = true;
          }
        }
      }
    }
  }
}
