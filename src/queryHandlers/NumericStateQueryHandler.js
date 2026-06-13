import { QueryHandler } from '../QueryHandler.js';
import { Fact } from '../Fact.js';
import { NumericRecord } from '../NumericRecord.js';
import { GivenProvenance } from '../provenance/GivenProvenance.js';

export class NumericStateQueryHandler extends QueryHandler {
  constructor(factStore, schema) {
    super();
    this.factStore = factStore;
    this.schema    = schema;
    this._records  = new Map();
  }

  evaluate(predicate, binding, evaluationContext) {
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const value = this.getValue(predicate.name, resolvedArgs, evaluationContext);
    return this.schema.matchesTier(predicate.name, value, predicate.tier);
  }

  evaluateComparison(predicate, binding, evaluationContext) {
    const resolvedArgs = predicate.args.map(arg => this.toFactArg(binding.resolve(arg)));
    const value = this.getValue(predicate.name, resolvedArgs, evaluationContext);
    if (predicate.operator === '>=') return value >= predicate.threshold;
    if (predicate.operator === '<=') return value <= predicate.threshold;
    if (predicate.operator === '>') return value > predicate.threshold;
    if (predicate.operator === '<') return value < predicate.threshold;
    return value === predicate.threshold;
  }

  getValue(name, args, evaluationContext = null) {
    const factStore = evaluationContext?.getActiveFactStore?.() ?? this.factStore;
    const value = factStore.getCurrentValue(name, args);
    return value !== null ? value : this.schema.getDefault(name);
  }

  // Returns true when the stored value actually changed (clamping can absorb the
  // entire delta). ForwardChainer convergence depends on this signal.
  setValue(name, args, value, evaluationContext = null, provenance = null) {
    const current   = this.getValue(name, args, evaluationContext);
    const factStore = evaluationContext?.getActiveFactStore?.() ?? this.factStore;
    const clamped   = this.schema.clamp(name, value);
    factStore.retract(Fact.withValue(name, args, null));
    factStore.assert(Fact.withValue(name, args, clamped));
    const record = this._getOrCreateRecord(name, args);
    record.addGiven(this.factStore.currentTick, clamped, provenance ?? new GivenProvenance());
    return clamped !== current;
  }

  adjustValue(name, args, delta, evaluationContext = null, provenance = null) {
    const current = this.getValue(name, args, evaluationContext);
    const clamped = this.schema.clamp(name, current + delta);
    const factStore = evaluationContext?.getActiveFactStore?.() ?? this.factStore;
    factStore.retract(Fact.withValue(name, args, null));
    factStore.assert(Fact.withValue(name, args, clamped));
    const record = this._getOrCreateRecord(name, args);
    if (record.events.length === 0) {
      record.addGiven(this.factStore.currentTick, current, new GivenProvenance());
    }
    record.addAdjustment(this.factStore.currentTick, delta, clamped, provenance);
    return clamped !== current;
  }

  getRecord(name, args) {
    return this._records.get(this._recordKey(name, args)) ?? null;
  }

  clearRecords(name) {
    for (const key of this._records.keys()) {
      if (key.startsWith(`${name}(`)) this._records.delete(key);
    }
  }

  _recordKey(name, args) {
    return `${name}(${args.join(',')})`;
  }

  _getOrCreateRecord(name, args) {
    const key = this._recordKey(name, args);
    if (!this._records.has(key)) this._records.set(key, new NumericRecord(name, args));
    return this._records.get(key);
  }

  wasEverInTier(name, args, tier, evaluationContext = null) {
    const factStore = evaluationContext?.getActiveFactStore?.() ?? this.factStore;
    return factStore.getRecords(name, args).some(r =>
      r.fact.value !== null && this.schema.matchesTier(name, r.fact.value, tier)
    );
  }

  wasEverInTierInWindow(name, args, tier, window, currentTick, evaluationContext = null) {
    const factStore = evaluationContext?.getActiveFactStore?.() ?? this.factStore;
    const since = currentTick - window;
    return factStore.getRecords(name, args).some(r =>
      r.assertedAt >= since && r.fact.value !== null && this.schema.matchesTier(name, r.fact.value, tier)
    );
  }

  toFactArg(value) {
    if (value !== null && typeof value === 'object' && 'name' in value) {
      return value.name;
    }
    return value;
  }
}
