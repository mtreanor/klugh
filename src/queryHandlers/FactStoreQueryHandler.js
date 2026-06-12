import { QueryHandler } from '../QueryHandler.js';

export class FactStoreQueryHandler extends QueryHandler {
  constructor(factStore, schema = null) {
    super();
    this.factStore = factStore;
    this.schema    = schema;
  }

  evaluate(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const tick         = evaluationContext?.currentTick ?? factStore.currentTick;
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    if (factStore.containedAt(tick, predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.containedAt(tick, predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  evaluateHistoricalWindow(predicate, binding, window, currentTick, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const check = (args) => window === null
      ? factStore.wasEverTrueAtOrBefore(predicate.name, args, currentTick)
      : factStore.wasEverTrueInWindow(predicate.name, args, window, currentTick);
    if (check(resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return check([resolvedArgs[1], resolvedArgs[0]]);
    }
    return false;
  }

  evaluateExplicitNegation(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const tick         = evaluationContext?.currentTick ?? factStore.currentTick;
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
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
    const resolvedArgs = innerPredicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const symmetric    = this.schema?.isSymmetric(innerPredicate.name) && resolvedArgs.length === 2;
    const reversed     = symmetric ? [resolvedArgs[1], resolvedArgs[0]] : null;

    const positivePresent =
      factStore.containedAt(tick, innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.containedAt(tick, innerPredicate.name, ...reversed));
    if (!positivePresent) return true;

    return factStore.containsNegatedAt(tick, innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.containsNegatedAt(tick, innerPredicate.name, ...reversed));
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

  // Entity objects are identified by name in the fact store
  toFactArg(value) {
    if (value !== null && typeof value === 'object' && 'name' in value) {
      return value.name;
    }
    return value;
  }
}
