import { LogicalVariable } from './LogicalVariable.js';
import { Binding } from './Binding.js';
import { RuleEvaluator } from './RuleEvaluator.js';
import { toFactArg } from './entityValue.js';

const MAX_DEPTH = 8;

// Finds proof paths for a target conclusion by backward chaining over a rule set.
// Returns ProofPath[] where each ProofPath is { rule, binding, satisfactionScore }.
// Options:
//   findAll — false returns immediately on first proof (for boolean derived-fact queries)
//   default — true returns all grounded paths
// No assertions are made — side effects belong to the caller.
export class BackwardChainer {
  constructor() {
    this.ruleEvaluator = new RuleEvaluator();
  }

  run(conclusionName, conclusionArgs, rules, evaluationContext, startingBinding = new Binding(), inProgress = new Set(), { findAll = true } = {}) {
    return this.prove(conclusionName, conclusionArgs, rules, evaluationContext, startingBinding, inProgress, 0, findAll);
  }

  prove(conclusionName, conclusionArgs, rules, evaluationContext, startingBinding, inProgress, depth, findAll) {
    if (depth > MAX_DEPTH) return [];

    const key = `${conclusionName}(${conclusionArgs.join(',')})`;
    if (inProgress.has(key)) return [];
    inProgress.add(key);

    const results = [];

    for (const rule of rules) {
      const ruleConclusion = rule.effects?.[0] ?? rule.conclusion;
      if (!ruleConclusion || ruleConclusion.name !== conclusionName) continue;

      const unifiedBinding = this.unifyConclusion(ruleConclusion, conclusionArgs, startingBinding);
      if (!unifiedBinding) continue;

      const applications = this.ruleEvaluator.evaluate(
        [rule],
        evaluationContext.entityRegistry,
        evaluationContext,
        unifiedBinding,
        evaluationContext.predicateSchema
      );

      for (const [, appList] of applications) {
        for (const app of appList) {
          if (!app.isFullySatisfied()) continue;
          results.push({ rule, binding: app.binding, satisfactionScore: app.satisfactionScore });
          if (!findAll) {
            inProgress.delete(key);
            return results;
          }
        }
      }
    }

    inProgress.delete(key);
    return results;
  }

  unifyConclusion(ruleConclusion, goalArgs, startingBinding) {
    if (ruleConclusion.args.length !== goalArgs.length) return null;
    let binding = startingBinding;
    for (let i = 0; i < ruleConclusion.args.length; i++) {
      const ruleArg = ruleConclusion.args[i];
      const goalArg = goalArgs[i];
      if (ruleArg instanceof LogicalVariable) {
        const existing = binding.resolve(ruleArg);
        if (existing !== undefined) {
          if (toFactArg(existing) !== goalArg) return null;
        } else {
          binding = binding.extend(ruleArg, goalArg);
        }
      } else if (toFactArg(ruleArg) !== goalArg) {
        return null;
      }
    }
    return binding;
  }

}
