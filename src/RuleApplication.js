// The result of evaluating one rule against one binding.
// predicateResults is an array of { predicate, importance, satisfied }.
export class RuleApplication {
  constructor(rule, binding, predicateResults, truthDegree) {
    this.rule = rule;
    this.binding = binding;
    this.predicateResults = predicateResults;
    this.truthDegree = truthDegree;
  }

  isFullySatisfied() {
    return this.truthDegree === 1.0;
  }

  unsatisfiedPredicates() {
    return this.predicateResults.filter(r => !r.satisfied);
  }
}
