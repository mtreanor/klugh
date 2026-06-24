import { QueryHandlers } from './QueryHandlers.js';
import { EvaluationContext } from './EvaluationContext.js';
import { FactStore } from './FactStore.js';
import { FactStoreQueryHandler } from './queryHandlers/FactStoreQueryHandler.js';
import { ExternalAPIQueryHandler } from './queryHandlers/ExternalAPIQueryHandler.js';
import { DerivedFactQueryHandler } from './queryHandlers/DerivedFactQueryHandler.js';
import { ForwardChainer } from './ForwardChainer.js';
import { applyStateChange } from './stateOperations/applyStateChange.js';
import { Binding } from './Binding.js';
import { RuleEffectProvenance } from './provenance/RuleEffectProvenance.js';
import { buildPremiseJustifications } from './provenance/justifyPremise.js';

export class World {
  constructor(schema = null) {
    this.schema           = schema;
    this.entityRegistry   = new Map();
    this.entityTypeConfig = new Map();
    this.entityNames      = new Set();
    this.factStore        = new FactStore({ schema });
    this.privateStores    = new Map();
    this.contradictionPolicy = 'lastWins';
    this.queryHandlers    = new QueryHandlers();
    this.tickTracker      = { currentTick: 0 };
    // Injectable RNG for random utility sources; reassign to seed reproducible runs.
    this.random           = Math.random;
    this.actionLog        = [];
    this.planLog          = [];
    this.occurrenceSeq    = 0;   // monotonic id source for reified action occurrences

    this.queryHandlers.register('factStore', new FactStoreQueryHandler(this.factStore, schema));
    this.queryHandlers.register('externalAPI', new ExternalAPIQueryHandler());
    this.queryHandlers.register('derived', new DerivedFactQueryHandler());
  }

  createEvaluationContext() {
    return new EvaluationContext(this.queryHandlers, {
      tickTracker:      this.tickTracker,
      entityRegistry:   this.entityRegistry,
      entityTypeConfig: this.entityTypeConfig,
      privateStores:    this.privateStores,
      predicateSchema:  this.schema,
      random:           this.random,
    });
  }

  setEntityTypeConfig(typeName, config) {
    this.entityTypeConfig.set(typeName, config);
  }

  setContradictionPolicy(policy) {
    this.contradictionPolicy = policy;
    this.factStore.contradictionPolicy = policy;
  }

  registerPrivateStore(entityName, { contradictionPolicy = 'lastWins' } = {}) {
    if (!this.privateStores.has(entityName)) {
      const store = new FactStore({ contradictionPolicy, schema: this.schema });
      store.currentTick = this.tickTracker.currentTick;
      this.privateStores.set(entityName, store);
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

  removeEntity(type, entityName) {
    const entities = this.entityRegistry.get(type);
    if (!entities) return false;
    const idx = entities.findIndex(e => e.name === entityName);
    if (idx < 0) return false;
    entities.splice(idx, 1);
    return true;
  }

  assert(fact) {
    this.factStore.assert(fact);
    return this;
  }

  assertAt(fact, tick, retractedAt = null) {
    this.factStore.assertAt(fact, tick, retractedAt);
    return this;
  }

  advanceTick(amount = 1) {
    this.tickTracker.currentTick += amount;
    this._syncStoreTicks();
    return this;
  }

  // Runs rules to fixpoint, committing all effects to the world.
  // With advanceTick: true, increments the canonical tick before running —
  // all effects land at the new tick.
  apply(rules, { advanceTick = false, minimumSatisfactionScore = 0 } = {}) {
    if (advanceTick) {
      this.advanceTick();
    }

    const evaluationContext = this.createEvaluationContext();

    new ForwardChainer().run(rules, evaluationContext, new Binding(), (app) => {
      if (app.satisfactionScore < minimumSatisfactionScore) return false;
      const provenance = new RuleEffectProvenance(
        app.rule, app.binding,
        buildPremiseJustifications(app.rule.predicateEntries, app.binding, evaluationContext)
      );
      const effects = Array.isArray(app.rule.effects) ? app.rule.effects : [];
      let changed = false;
      for (const effect of effects) {
        if (this._commitEffect(effect, app.binding, app.satisfactionScore, provenance)) changed = true;
      }
      return changed;
    });

    return this;
  }

  // Runs rules exactly once (no fixpoint iteration), committing all effects to the world.
  applyOnce(rules, { advanceTick = false, minimumSatisfactionScore = 0, scaleDelta = (d, s) => d * s } = {}) {
    if (advanceTick) {
      this.advanceTick();
    }

    const evaluationContext = this.createEvaluationContext();

    new ForwardChainer().runOnce(rules, evaluationContext, new Binding(), (app) => {
      if (app.satisfactionScore < minimumSatisfactionScore) return false;
      const provenance = new RuleEffectProvenance(
        app.rule, app.binding,
        buildPremiseJustifications(app.rule.predicateEntries, app.binding, evaluationContext)
      );
      const effects = Array.isArray(app.rule.effects) ? app.rule.effects : [];
      let changed = false;
      for (const effect of effects) {
        if (this._commitEffect(effect, app.binding, app.satisfactionScore, provenance, scaleDelta)) changed = true;
      }
      return changed;
    });

    return this;
  }

  _commitEffect(operation, binding, satisfactionScore, provenance = null, scaleDelta = (d, s) => d * s) {
    if (operation.type === 'actuate' || operation.type === 'actuate-numeric') {
      applyStateChange(operation, binding, this.queryHandlers, { privateStores: this.privateStores });
      return true;
    }

    // Numeric effects report convergence: "changed" only when the clamped value
    // actually moved, so fixpoint apply() terminates at clamp boundaries.
    if (operation.type === 'adjust-numeric') {
      return applyStateChange(operation, binding, this.queryHandlers, {
        deltaOverride: scaleDelta(operation.delta, satisfactionScore),
        privateStores: this.privateStores,
        provenance,
      }) === true;
    }

    if (operation.type === 'set-numeric') {
      return applyStateChange(operation, binding, this.queryHandlers, {
        privateStores: this.privateStores,
        provenance,
      }) === true;
    }

    // assert / retract: only commit if the world actually changes (convergence)
    const resolvedArgs = operation.resolveArgs(binding);
    const negated = operation.negated ?? false;
    const targetStore = this._resolveTargetStore(operation, binding);
    if (!targetStore) return false;

    const tick = this.tickTracker.currentTick;
    const isActive = negated
      ? targetStore.containsNegatedAt(tick, operation.name, ...resolvedArgs)
      : targetStore.containedAt(tick, operation.name, ...resolvedArgs);

    if (operation.type === 'assert') {
      if (isActive) return false;
      applyStateChange(operation, binding, this.queryHandlers, {
        privateStores: this.privateStores,
        targetFactStore: targetStore,
        provenance,
      });
      return true;
    }

    if (operation.type === 'retract') {
      if (!isActive) return false;
      applyStateChange(operation, binding, this.queryHandlers, {
        privateStores: this.privateStores,
        targetFactStore: targetStore,
        provenance,
      });
      return true;
    }

    return false;
  }

  _resolveTargetStore(operation, binding) {
    if (!operation.owner) return this.factStore;
    if (!operation.ownerIsVariable) return this.privateStores.get(operation.owner) ?? null;
    const resolved = binding.resolve(operation.owner);
    const ownerName = (resolved !== null && typeof resolved === 'object' && 'name' in resolved)
      ? resolved.name : resolved;
    return this.privateStores.get(ownerName) ?? null;
  }

  _syncStoreTicks() {
    const tick = this.tickTracker.currentTick;
    this.factStore.currentTick = tick;
    for (const store of this.privateStores.values()) {
      store.currentTick = tick;
    }
  }
}
