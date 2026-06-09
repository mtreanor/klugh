// Everything a predicate needs at evaluation time besides the binding.
// Query handlers answer "is this true?"; tick and entityRegistry are simulation
// infrastructure, not sources of truth.
export class EvaluationContext {
  constructor(queryHandlers, {
    tickTracker     = null,
    entityRegistry  = null,
    privateStores   = null,
    activeStore     = null,
    predicateSchema = null,
  } = {}) {
    this.queryHandlers   = queryHandlers;
    this.tickTracker     = tickTracker;
    this.entityRegistry  = entityRegistry;
    this.privateStores   = privateStores;
    this.activeStore     = activeStore;
    this.predicateSchema = predicateSchema;
  }

  getHandler(name) {
    return this.queryHandlers.getHandler(name);
  }

  get currentTick() {
    return this.tickTracker?.currentTick ?? 0;
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
      tickTracker:     this.tickTracker,
      entityRegistry:  this.entityRegistry,
      privateStores:   this.privateStores,
      activeStore:     store,
      predicateSchema: this.predicateSchema,
    });
  }
}
