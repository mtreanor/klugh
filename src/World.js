import { QueryHandlers } from './QueryHandlers.js';
import { EvaluationContext } from './EvaluationContext.js';
import { FactStore } from './FactStore.js';
import { FactStoreQueryHandler } from './queryHandlers/FactStoreQueryHandler.js';
import { ExternalAPIQueryHandler } from './queryHandlers/ExternalAPIQueryHandler.js';
import { DerivedFactQueryHandler } from './queryHandlers/DerivedFactQueryHandler.js';

export class World {
  constructor(schema = null) {
    this.schema         = schema;
    this.entityRegistry = new Map();
    this.entityNames    = new Set();
    this.factStore      = new FactStore({ schema });
    this.privateStores  = new Map();
    this.contradictionPolicy = 'lastWins';
    this.queryHandlers  = new QueryHandlers();
    this.tickTracker    = { currentTick: 0 };

    this.queryHandlers.register('factStore', new FactStoreQueryHandler(this.factStore, schema));
    this.queryHandlers.register('externalAPI', new ExternalAPIQueryHandler());
    this.queryHandlers.register('derived', new DerivedFactQueryHandler());
  }

  createEvaluationContext() {
    return new EvaluationContext(this.queryHandlers, {
      tickTracker:     this.tickTracker,
      entityRegistry:  this.entityRegistry,
      privateStores:   this.privateStores,
      predicateSchema: this.schema,
    });
  }

  setContradictionPolicy(policy) {
    this.contradictionPolicy = policy;
    this.factStore.contradictionPolicy = policy;
  }

  registerPrivateStore(entityName, { contradictionPolicy = 'lastWins' } = {}) {
    if (!this.privateStores.has(entityName)) {
      this.privateStores.set(entityName, new FactStore({ contradictionPolicy, schema: this.schema }));
    }
    return this.privateStores.get(entityName);
  }

  getPrivateStore(entityName) {
    return this.privateStores.get(entityName) ?? null;
  }

  hasPrivateStore(entityName) {
    return this.privateStores.has(entityName);
  }

  addEntity(type, entity) {
    if (!this.entityRegistry.has(type)) {
      this.entityRegistry.set(type, []);
    }
    this.entityRegistry.get(type).push(entity);
    return this;
  }

  assert(fact) {
    this.factStore.assert(fact);
    return this;
  }

  assertAt(fact, tick, retractedAt = null) {
    this.factStore.assertAt(fact, tick, retractedAt);
    return this;
  }
}
