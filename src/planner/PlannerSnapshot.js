import { Fact } from '../Fact.js';
import { FactStore } from '../FactStore.js';
import { FactStoreQueryHandler } from '../queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../QueryHandlers.js';
import { EvaluationContext } from '../EvaluationContext.js';

export class PlannerSnapshot {
  constructor(factStore, entityRegistry, schema, privateStores = new Map()) {
    this.factStore      = factStore;
    this.entityRegistry = entityRegistry;
    this.schema         = schema;
    this.privateStores  = privateStores;
  }

  static from(world) {
    const privateStores = new Map();
    for (const [name, store] of world.privateStores) {
      privateStores.set(name, PlannerSnapshot.cloneFactStore(store, world.schema));
    }
    return new PlannerSnapshot(
      PlannerSnapshot.cloneFactStore(world.factStore, world.schema),
      world.entityRegistry,
      world.schema,
      privateStores
    );
  }

  static cloneFactStore(source, schema) {
    const clone = new FactStore({ schema });
    for (const record of source.factHistory) {
      if (record.isCurrentlyActive()) {
        clone.assert(
          new Fact(record.fact.name, ...record.fact.args, { negated: record.fact.negated }),
          record.strength
        );
      }
    }
    return clone;
  }

  buildQueryHandlers() {
    const queryHandlers = new QueryHandlers();
    queryHandlers.register('factStore', new FactStoreQueryHandler(this.factStore, this.schema));
    return queryHandlers;
  }

  createEvaluationContext() {
    return new EvaluationContext(this.buildQueryHandlers(), {
      entityRegistry: this.entityRegistry,
      privateStores:  this.privateStores,
    });
  }

  apply(action, binding) {
    const cloned = PlannerSnapshot.cloneFactStore(this.factStore, this.schema);
    const clonedPrivateStores = new Map();
    for (const [name, store] of this.privateStores) {
      clonedPrivateStores.set(name, PlannerSnapshot.cloneFactStore(store, this.schema));
    }
    const next          = new PlannerSnapshot(cloned, this.entityRegistry, this.schema, clonedPrivateStores);
    const queryHandlers = next.buildQueryHandlers();
    action.execute(binding, queryHandlers, null, { privateStores: clonedPrivateStores });
    return next;
  }

  stateKey() {
    const publicFacts = this.factStore.factHistory
      .filter(r => r.isCurrentlyActive())
      .map(r => `${r.fact.negated ? '-' : ''}${r.fact.name}(${r.fact.args.join(',')})`);

    const privateFacts = [];
    for (const [owner, store] of this.privateStores) {
      for (const record of store.factHistory) {
        if (record.isCurrentlyActive()) {
          privateFacts.push(
            `${owner}.${record.fact.negated ? '-' : ''}${record.fact.name}(${record.fact.args.join(',')})`
          );
        }
      }
    }

    return [...publicFacts, ...privateFacts].sort().join('|');
  }
}
