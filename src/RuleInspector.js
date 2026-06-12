import { Binding } from './Binding.js';
import { LogicalVariable } from './LogicalVariable.js';
import { RuleEvaluator } from './RuleEvaluator.js';
import { bindingSatisfiesDistinctArguments } from './DistinctArguments.js';
import { StateOperation } from './stateOperations/StateOperation.js';

export class RuleInspector {
  constructor(ruleEvaluator = new RuleEvaluator()) {
    this.ruleEvaluator = ruleEvaluator;
  }

  // options:
  //   binding            — plain object mapping variable names (without '?') to values.
  //   impulses           — predicate names; restricts to rules whose RHS adjusts any of them.
  //   ruleName           — string or array of strings; restricts to rules with matching names.
  //   minimumSatisfactionScore — default 0, so fully false rules are included.
  //
  // Returns a flat Array<RuleApplication>.
  query(rules, entityRegistry, evaluationContext, schema, options = {}) {
    const {
      binding: partialBindingInput = {},
      impulses = null,
      ruleName = null,
      minimumSatisfactionScore = 0,
    } = options;

    const startingBinding = this.resolveBinding(partialBindingInput, entityRegistry);
    const boundNames = new Set(startingBinding.assignments.keys());

    let filteredRules = rules;
    if (ruleName !== null) {
      const names = Array.isArray(ruleName) ? ruleName : [ruleName];
      filteredRules = filteredRules.filter(r => names.includes(r.name));
    }
    if (impulses !== null && impulses.length > 0) {
      filteredRules = filteredRules.filter(r => {
        const effects = Array.isArray(r.effects) ? r.effects : [r.effects];
        return effects.some(e => e instanceof StateOperation && e.type === 'adjust-numeric' && impulses.includes(e.name));
      });
    }

    const results = [];
    for (const rule of filteredRules) {
      const applications = this.buildApplications(
        rule, entityRegistry, evaluationContext, schema, startingBinding, boundNames, minimumSatisfactionScore
      );
      results.push(...applications);
    }
    return results;
  }

  buildApplications(rule, entityRegistry, evaluationContext, schema, startingBinding, boundNames, minimumSatisfactionScore) {
    const freeVariables = rule.collectVariables().filter(v => !boundNames.has(v.name));
    const variableTypes = this.ruleEvaluator.inferVariableTypes(rule, schema);
    const predicates = rule.predicateEntries.map(e => e.predicate);
    const candidateBindings = this.ruleEvaluator.generateAllBindings(
      freeVariables, variableTypes, entityRegistry, startingBinding
    );
    return candidateBindings
      .filter(binding => bindingSatisfiesDistinctArguments(binding, predicates, schema, entityRegistry, evaluationContext?.entityTypeConfig))
      .map(binding => this.ruleEvaluator.applyRule(rule, binding, evaluationContext))
      .filter(app => app.satisfactionScore >= minimumSatisfactionScore);
  }

  resolveBinding(input, entityRegistry) {
    let binding = new Binding();
    for (const [name, value] of Object.entries(input)) {
      const resolved = typeof value === 'string'
        ? (this.findEntityByName(value, entityRegistry) ?? value)
        : value;
      binding = binding.extend(new LogicalVariable(name), resolved);
    }
    return binding;
  }

  findEntityByName(name, entityRegistry) {
    for (const entities of entityRegistry.values()) {
      const match = entities.find(e => e?.name === name);
      if (match) return match;
    }
    return null;
  }
}
