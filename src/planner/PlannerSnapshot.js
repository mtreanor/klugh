import { Fact } from '../Fact.js';
import { FactStore } from '../FactStore.js';
import { FactStoreQueryHandler } from '../queryHandlers/FactStoreQueryHandler.js';
import { NumericStateQueryHandler } from '../queryHandlers/NumericStateQueryHandler.js';
import { DerivedFactQueryHandler } from '../queryHandlers/DerivedFactQueryHandler.js';
import { QueryHandlers } from '../QueryHandlers.js';
import { EvaluationContext } from '../EvaluationContext.js';

export class PlannerSnapshot {
  constructor(factStore, entityRegistry, schema, privateStores = new Map(), {
    derivationRules = [],
    derivations     = new Map(),
  } = {}) {
    this.factStore       = factStore;
    this.entityRegistry  = entityRegistry;
    this.schema          = schema;
    this.privateStores   = privateStores;
    this.derivationRules = derivationRules;  // define-block rules, replicated per snapshot
    this.derivations     = derivations;      // imperative derivations registered via define(fn)
  }

  static from(world) {
    const privateStores = new Map();
    for (const [name, store] of world.privateStores) {
      privateStores.set(name, PlannerSnapshot.cloneFactStore(store, world.schema));
    }

    // Carry the world's derivations so derived predicates resolve against the
    // simulated state during planning, exactly as they do against the live world.
    const derivedHandler  = world.queryHandlers.getHandler?.('derived');
    const derivationRules = derivedHandler ? derivedHandler.getRegisteredRules() : [];
    const derivations     = derivedHandler ? derivedHandler.derivations : new Map();

    return new PlannerSnapshot(
      PlannerSnapshot.cloneFactStore(world.factStore, world.schema),
      world.entityRegistry,
      world.schema,
      privateStores,
      { derivationRules, derivations }
    );
  }

  static cloneFactStore(source, schema) {
    const clone = new FactStore({ schema });
    for (const record of source.factHistory) {
      if (record.isCurrentlyActive()) {
        // Preserve numeric values; boolean facts have value === null.
        const fact = record.fact.value !== null
          ? Fact.withValue(record.fact.name, record.fact.args, record.fact.value)
          : new Fact(record.fact.name, ...record.fact.args, { negated: record.fact.negated });
        clone.assert(fact, record.strength);
      }
    }
    return clone;
  }

  buildQueryHandlers() {
    const queryHandlers = new QueryHandlers();
    queryHandlers.register('factStore', new FactStoreQueryHandler(this.factStore, this.schema));
    queryHandlers.register('numeric',   new NumericStateQueryHandler(this.factStore, this.schema));

    // Fresh derived handler per snapshot: it holds the same rules but its own
    // per-tick proof cache, so one hypothetical state never reads another's results.
    const derived = new DerivedFactQueryHandler();
    derived.registerRules(this.derivationRules);
    for (const [name, fn] of this.derivations) derived.define(name, fn);
    queryHandlers.register('derived', derived);

    return queryHandlers;
  }

  createEvaluationContext() {
    return new EvaluationContext(this.buildQueryHandlers(), {
      entityRegistry:  this.entityRegistry,
      privateStores:   this.privateStores,
      predicateSchema: this.schema,
    });
  }

  apply(action, binding) {
    const cloned = PlannerSnapshot.cloneFactStore(this.factStore, this.schema);
    const clonedPrivateStores = new Map();
    for (const [name, store] of this.privateStores) {
      clonedPrivateStores.set(name, PlannerSnapshot.cloneFactStore(store, this.schema));
    }
    const next = new PlannerSnapshot(
      cloned, this.entityRegistry, this.schema, clonedPrivateStores,
      { derivationRules: this.derivationRules, derivations: this.derivations }
    );
    const queryHandlers = next.buildQueryHandlers();
    action.execute(binding, queryHandlers, null, { privateStores: clonedPrivateStores });
    return next;
  }

  stateKey() {
    const publicFacts = this.factStore.factHistory
      .filter(r => r.isCurrentlyActive())
      .map(r => `${r.fact.negated ? '-' : ''}${r.fact.name}(${r.fact.args.join(',')})${r.fact.value !== null ? ':' + r.fact.value : ''}`);

    const privateFacts = [];
    for (const [owner, store] of this.privateStores) {
      for (const record of store.factHistory) {
        if (record.isCurrentlyActive()) {
          privateFacts.push(
            `${owner}.${record.fact.negated ? '-' : ''}${record.fact.name}(${record.fact.args.join(',')})${record.fact.value !== null ? ':' + record.fact.value : ''}`
          );
        }
      }
    }

    return [...publicFacts, ...privateFacts].sort().join('|');
  }
}
