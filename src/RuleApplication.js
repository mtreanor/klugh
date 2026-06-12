// The result of evaluating one rule against one binding.
// predicateResults is an array of { predicate, importance, satisfied }.
export class RuleApplication {
  constructor(rule, binding, predicateResults, satisfactionScore) {
    this.rule = rule;
    this.binding = binding;
    this.predicateResults = predicateResults;
    this.satisfactionScore = satisfactionScore;
  }

  isFullySatisfied() {
    return this.satisfactionScore === 1.0;
  }

  unsatisfiedPredicates() {
    return this.predicateResults.filter(r => !r.satisfied);
  }
}
