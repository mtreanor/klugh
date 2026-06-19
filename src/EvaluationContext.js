import { Binding } from './Binding.js';

const EMPTY_BINDING = new Binding();

// Everything a predicate needs at evaluation time besides the binding.
// Query handlers answer "is this true?"; tick and entityRegistry are simulation
// infrastructure, not sources of truth.
export class EvaluationContext {
  constructor(queryHandlers, {
    tickTracker      = null,
    evaluationTick   = null,
    entityRegistry   = null,
    entityTypeConfig = null,
    privateStores    = null,
    activeStore      = null,
    predicateSchema  = null,
    random           = Math.random,
  } = {}) {
    this.queryHandlers    = queryHandlers;
    this.tickTracker      = tickTracker;
    this.evaluationTick   = evaluationTick;
    this.entityRegistry   = entityRegistry;
    this.entityTypeConfig = entityTypeConfig;
    this.privateStores    = privateStores;
    this.activeStore      = activeStore;
    this.predicateSchema  = predicateSchema;
    // Injectable RNG for random utility sources; seed it for reproducible runs.
    this.random           = random;
  }

  getHandler(name) {
    return this.queryHandlers.getHandler(name);
  }

  get currentTick() {
    return this.evaluationTick ?? this.tickTracker?.currentTick ?? 0;
  }

  // Returns a new context that evaluates facts as of the given tick.
  withTick(tick) {
    return new EvaluationContext(this.queryHandlers, {
      tickTracker:      this.tickTracker,
      evaluationTick:   tick,
      entityRegistry:   this.entityRegistry,
      entityTypeConfig: this.entityTypeConfig,
      privateStores:    this.privateStores,
      activeStore:      this.activeStore,
      predicateSchema:  this.predicateSchema,
      random:           this.random,
    });
  }

  // Resolves the current numeric value of a predicate (stored `numeric` or
  // computed `sensor-numeric`). Used by ComparisonPredicate to compare two
  // numeric operands against each other rather than against a literal.
  resolveNumericValue(name, resolvedArgs) {
    const def = this.predicateSchema?.getDefinition(name);
    if (def?.type === 'sensor-numeric') {
      return this.getHandler('sensor').getNumericValue(name, resolvedArgs, this);
    }
    return this.getHandler('numeric').getValue(name, resolvedArgs, this);
  }

  // Resolves the three-valued state of a boolean operand: 'true' | 'false' |
  // 'unknown'. Used by ComparisonPredicate for == / !=. Stored booleans carry the
  // full three-valued distinction; `derived` and boolean `sensor` predicates are
  // total functions and only ever resolve to 'true' or 'false'.
  //
  // NOTE: a `derived` operand runs a full backward-chaining proof per evaluation,
  // and a comparison enumerates over entity combinations — an unanchored
  // comparison with a derived operand can be costly. Anchor it with a cheap
  // positive premise where possible.
  resolveBooleanState(name, resolvedArgs) {
    const type = this.predicateSchema?.getDefinition(name)?.type;
    if (type === 'derived') {
      return this.getHandler('derived').evaluate({ name, args: resolvedArgs }, EMPTY_BINDING, this) ? 'true' : 'false';
    }
    if (type === 'sensor') {
      return this.getHandler('sensor').evaluate({ name, args: resolvedArgs }, resolvedArgs, this) ? 'true' : 'false';
    }
    return this.getHandler('factStore').resolveState(name, resolvedArgs, this);
  }

  getActiveFactStore() {
    if (this.activeStore) return this.activeStore;
    const factHandler = this.getHandler('factStore');
    if (factHandler) return factHandler.factStore;
    const numericHandler = this.getHandler('numeric');
    if (numericHandler) return numericHandler.factStore;
    throw new Error('No fact store available in evaluation context');
  }

  scopedToStore(store) {
    return new EvaluationContext(this.queryHandlers, {
      tickTracker:      this.tickTracker,
      evaluationTick:   this.evaluationTick,
      entityRegistry:   this.entityRegistry,
      entityTypeConfig: this.entityTypeConfig,
      privateStores:    this.privateStores,
      activeStore:      store,
      predicateSchema:  this.predicateSchema,
      random:           this.random,
    });
  }
}
