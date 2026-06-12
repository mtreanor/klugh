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
  } = {}) {
    this.queryHandlers    = queryHandlers;
    this.tickTracker      = tickTracker;
    this.evaluationTick   = evaluationTick;
    this.entityRegistry   = entityRegistry;
    this.entityTypeConfig = entityTypeConfig;
    this.privateStores    = privateStores;
    this.activeStore      = activeStore;
    this.predicateSchema  = predicateSchema;
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
    });
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
    });
  }
}
