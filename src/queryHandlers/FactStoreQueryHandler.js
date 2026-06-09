import { QueryHandler } from '../QueryHandler.js';

export class FactStoreQueryHandler extends QueryHandler {
  constructor(factStore, schema = null) {
    super();
    this.factStore = factStore;
    this.schema    = schema;
  }

  evaluate(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    if (factStore.contains(predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.contains(predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  evaluateHistorical(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    if (factStore.wasEverTrue(predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.wasEverTrue(predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  evaluateHistoricalWindow(predicate, binding, window, currentTick, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const check = (args) => window === null
      ? factStore.wasEverTrue(predicate.name, ...args)
      : factStore.wasEverTrueInWindow(predicate.name, args, window, currentTick);
    if (check(resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return check([resolvedArgs[1], resolvedArgs[0]]);
    }
    return false;
  }

  evaluateExplicitNegation(predicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    if (factStore.containsNegated(predicate.name, ...resolvedArgs)) return true;
    if (this.schema?.isSymmetric(predicate.name) && resolvedArgs.length === 2) {
      return factStore.containsNegated(predicate.name, resolvedArgs[1], resolvedArgs[0]);
    }
    return false;
  }

  // ~ sugar: true when positive belief is absent OR explicit disbelief is present
  evaluateWeak(innerPredicate, binding, evaluationContext) {
    const factStore    = this.resolveFactStore(evaluationContext);
    const resolvedArgs = innerPredicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const symmetric    = this.schema?.isSymmetric(innerPredicate.name) && resolvedArgs.length === 2;
    const reversed     = symmetric ? [resolvedArgs[1], resolvedArgs[0]] : null;

    const positivePresent =
      factStore.contains(innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.contains(innerPredicate.name, ...reversed));
    if (!positivePresent) return true;

    return factStore.containsNegated(innerPredicate.name, ...resolvedArgs) ||
      (symmetric && factStore.containsNegated(innerPredicate.name, ...reversed));
  }

  getAssertionTicks(name, resolvedArgs, evaluationContext) {
    return this.resolveFactStore(evaluationContext).getAssertionTicks(name, resolvedArgs);
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
