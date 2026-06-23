import { AggregatePredicate } from '../predicates/AggregatePredicate.js';

// Utility source that computes a predicate aggregate (avg, sum, max, min) over
// enumerated entities and returns the raw numeric result as a score.
//
// DSL syntax:  avg|warmth(_, ?SELF)|
//              avg|warmth(_, ?SELF) ^ knows(_, ?SELF)|
//
// Unlike AggregateUtilitySource (which aggregates over a list of other utility
// sources), this enumerates entity combinations from the world, collects the
// named numeric predicate's value for each combination that passes the filter,
// and reduces with the aggregate function. Returns 0 when no entities match.
export class PredicateAggregateUtilitySource {
  constructor(fn, filterPredicates, valuePred, countingVars, countingVarTypes) {
    this._pred = new AggregatePredicate(fn, filterPredicates, valuePred, countingVars, countingVarTypes, null, null);
  }

  evaluate(binding, _entityRegistry, evaluationContext) {
    return this._pred.computeValue(binding, evaluationContext) ?? 0;
  }

  scoreWithBreakdown(binding, _entityRegistry, evaluationContext) {
    const score = this.evaluate(binding, _entityRegistry, evaluationContext);
    return { type: 'predicate-aggregate', fn: this._pred.fn, score };
  }
}
