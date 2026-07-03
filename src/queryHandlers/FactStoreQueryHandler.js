import { QueryHandler } from '../QueryHandler.js';
import { toFactArg } from '../entityValue.js';

export class FactStoreQueryHandler extends QueryHandler {
  constructor(factStore, schema = null) {
    super();
    this.factStore = factStore;
    this.schema    = schema;
  }

  evaluate(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const tick         = evaluationContext?.currentTick ?? factStore.currentTick;
    const resolvedArgs = predicate.args.map(arg => toFactArg(binding.resolve(arg)));
    if (factStore.containedAt(tick, predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.containedAt(tick, predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  evaluateHistoricalWindow(predicate, binding, window, currentTick, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => toFactArg(binding.resolve(arg)));
    const check = (args) => window === null
      ? factStore.wasEverTrueAtOrBefore(predicate.name, args, currentTick)
      : factStore.wasEverTrueInWindow(predicate.name, args, window, currentTick);
    if (check(resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return check([resolvedArgs[1], resolvedArgs[0]]);
    }
    return false;
  }

  evaluateDuring(predicate, binding, window, currentTick, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => toFactArg(binding.resolve(arg)));
    const check = (args) => factStore.wasActiveInWindow(predicate.name, args, window, currentTick);
    if (check(resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return check([resolvedArgs[1], resolvedArgs[0]]);
    }
    return false;
  }

  evaluateExplicitNegation(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const tick         = evaluationContext?.currentTick ?? factStore.currentTick;
    const resolvedArgs = predicate.args.map(arg => toFactArg(binding.resolve(arg)));
    if (factStore.containsNegatedAt(tick, predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.containsNegatedAt(tick, predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  // ~pred: true when positive belief is absent OR explicit disbelief is present
  evaluateWeak(innerPredicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const tick         = evaluationContext?.currentTick ?? factStore.currentTick;
    const resolvedArgs = innerPredicate.args.map(arg => toFactArg(binding.resolve(arg)));
    const symmetric    = this.schema?.isSymmetric(innerPredicate.name) && resolvedArgs.length === 2;
    const reversed     = symmetric ? [resolvedArgs[1], resolvedArgs[0]] : null;

    const positivePresent =
      factStore.containedAt(tick, innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.containedAt(tick, innerPredicate.name, ...reversed));
    if (!positivePresent) return true;

    return factStore.containsNegatedAt(tick, innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.containsNegatedAt(tick, innerPredicate.name, ...reversed));
  }

  // Three-valued state of a boolean fact: 'true' (positive belief present),
  // 'false' (explicit disbelief present), or 'unknown' (neither). Positive belief
  // wins if both somehow coexist (e.g. an 'allow' private store), mirroring the
  // positive-first check in evaluateWeak.
  resolveState(name, resolvedArgs, evaluationContext) {
    const factStore = this.resolveFactStore(evaluationContext);
    const tick      = evaluationContext?.currentTick ?? factStore.currentTick;
    const symmetric = this.schema?.isSymmetric(name) && resolvedArgs.length === 2;
    const reversed  = symmetric ? [resolvedArgs[1], resolvedArgs[0]] : null;

    if (factStore.containedAt(tick, name, ...resolvedArgs) ||
        (symmetric && factStore.containedAt(tick, name, ...reversed))) return 'true';
    if (factStore.containsNegatedAt(tick, name, ...resolvedArgs) ||
        (symmetric && factStore.containsNegatedAt(tick, name, ...reversed))) return 'false';
    return 'unknown';
  }

  getAssertionTicks(name, resolvedArgs, evaluationContext) {
    const ticks = this.resolveFactStore(evaluationContext).getAssertionTicks(name, resolvedArgs);
    if (evaluationContext?.evaluationTick == null) return ticks;
    const tick = evaluationContext.currentTick;
    return ticks.filter(t => t <= tick);
  }

  resolveFactStore(evaluationContext) {
    return evaluationContext?.getActiveFactStore?.() ?? this.factStore;
  }

}
