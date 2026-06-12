import { FactRecord } from './FactRecord.js';
import { GivenProvenance } from './provenance/GivenProvenance.js';

export class FactStore {
  constructor({ contradictionPolicy = 'lastWins', schema = null } = {}) {
    this._canonicalRecords   = new Map();
    this._provenanceHook     = null;
    this.currentTick         = 0;
    this.contradictionPolicy = contradictionPolicy;
    this.schema              = schema;
  }

  // Register a provenance hook called when assert/retract has no explicit provenance.
  useProvenance(hook) {
    this._provenanceHook = hook;
  }

  // All canonical records as an array — one per unique (name, args, polarity[, value]).
  get factHistory() {
    return Array.from(this._canonicalRecords.values());
  }

  assert(fact, strength = 1.0, provenance = null) {
    if (this.contradictionPolicy !== 'allow') {
      const opposing = this.findOpposingRecords(fact);
      if (opposing.length > 0) {
        if (this.contradictionPolicy === 'block') return;
        for (const r of opposing) {
          r.addEvent({ type: 'retracted', tick: this.currentTick, provenance: new GivenProvenance() });
        }
      }
    }
    const record = this._getOrCreateCanonicalRecord(fact);
    record.addEvent({
      type: 'asserted',
      tick: this.currentTick,
      strength,
      provenance: this._resolveProvenance(fact, provenance),
    });
  }

  findOpposingRecords(fact) {
    const symmetric = this.schema?.isSymmetric(fact.name) && fact.args.length === 2;
    return this.factHistory.filter(r => {
      if (!r.isCurrentlyActive()) return false;
      if (r.fact.name !== fact.name) return false;
      if (r.fact.negated === fact.negated) return false;
      if (r.fact.args.length !== fact.args.length) return false;
      if (r.fact.args.every((a, i) => a === fact.args[i])) return true;
      return symmetric && r.fact.args[0] === fact.args[1] && r.fact.args[1] === fact.args[0];
    });
  }

  // Assert a fact as having been true at a specific past tick.
  assertAt(fact, tick, retractedAt = null, strength = 1.0) {
    const record = this._getOrCreateCanonicalRecord(fact);
    record.addEvent({ type: 'asserted', tick, strength, provenance: new GivenProvenance() });
    if (retractedAt !== null) {
      record.addEvent({ type: 'retracted', tick: retractedAt, provenance: new GivenProvenance() });
    }
  }

  retract(fact, provenance = null) {
    const negated  = fact.negated ?? false;
    const provObj  = this._resolveProvenance(fact, provenance);

    for (const record of this._canonicalRecords.values()) {
      if (!record.isCurrentlyActive()) continue;
      if (record.fact.name    !== fact.name)    continue;
      if (record.fact.negated !== negated)       continue;
      if (record.fact.args.length !== fact.args.length) continue;
      if (!record.fact.args.every((a, i) => a === fact.args[i])) continue;
      // null value acts as wildcard; non-null value must match exactly
      if (fact.value !== null && record.fact.value !== fact.value) continue;
      record.addEvent({ type: 'retracted', tick: this.currentTick, provenance: provObj });
    }

    if (this.schema?.isSymmetric(fact.name) && fact.args.length === 2) {
      const rev = [fact.args[1], fact.args[0]];
      for (const record of this._canonicalRecords.values()) {
        if (!record.isCurrentlyActive()) continue;
        if (record.fact.name    !== fact.name)    continue;
        if (record.fact.negated !== negated)       continue;
        if (record.fact.args.length !== rev.length) continue;
        if (!record.fact.args.every((a, i) => a === rev[i])) continue;
        if (fact.value !== null && record.fact.value !== fact.value) continue;
        record.addEvent({ type: 'retracted', tick: this.currentTick, provenance: provObj });
      }
    }
  }

  // null in any arg position acts as a wildcard
  query(name, ...args) {
    return this.factHistory
      .filter(r => r.isCurrentlyActive() && this.factMatches(r.fact, name, args))
      .map(r => r.fact);
  }

  queryAt(tick, name, ...args) {
    return this.factHistory
      .filter(r => r.isActiveAt(tick) && this.factMatches(r.fact, name, args))
      .map(r => r.fact);
  }

  wasEverTrue(name, ...args) {
    return this.factHistory.some(r => this.factMatches(r.fact, name, args));
  }

  wasEverTrueAtOrBefore(name, args, currentTick) {
    return this.factHistory.some(r =>
      this.factMatches(r.fact, name, args) &&
      r.events.some(e => e.type === 'asserted' && e.tick <= currentTick)
    );
  }

  wasEverTrueInWindow(name, args, window, currentTick) {
    const since = currentTick - window;
    return this.factHistory.some(r =>
      this.factMatches(r.fact, name, args) &&
      r.events.some(e => e.type === 'asserted' && e.tick >= since && e.tick <= currentTick)
    );
  }

  // All ticks at which the fact was asserted across its full event log.
  getAssertionTicks(name, args) {
    return this.factHistory
      .filter(r => this.factMatches(r.fact, name, args))
      .flatMap(r => r.events.filter(e => e.type === 'asserted').map(e => e.tick));
  }

  retractAll(name) {
    for (const record of this._canonicalRecords.values()) {
      if (record.isCurrentlyActive() && record.fact.name === name) {
        record.addEvent({ type: 'retracted', tick: this.currentTick, provenance: new GivenProvenance() });
      }
    }
  }

  getCurrentValue(name, args) {
    const record = this.factHistory.findLast(r =>
      r.isCurrentlyActive() && this.factMatches(r.fact, name, args)
    );
    return record ? record.fact.value : null;
  }

  // Returns all canonical records whose fact matches name and args.
  getRecords(name, args) {
    return this.factHistory.filter(r => this.factMatches(r.fact, name, args));
  }

  contains(name, ...args) {
    return this.query(name, ...args).length > 0;
  }

  containsNegated(name, ...args) {
    return this.factHistory.some(r =>
      r.isCurrentlyActive() && this.factMatches(r.fact, name, args, true)
    );
  }

  getStrength(name, args, negated = false) {
    const record = this.factHistory.findLast(r =>
      r.isCurrentlyActive() && this.factMatches(r.fact, name, args, negated)
    );
    return record ? record.strength : 0.0;
  }

  setStrength(name, args, newStrength, negated = false) {
    const record = this.factHistory.findLast(r =>
      r.isCurrentlyActive() && this.factMatches(r.fact, name, args, negated)
    );
    if (record) record.strength = newStrength;
  }

  containedAt(tick, name, ...args) {
    return this.queryAt(tick, name, ...args).length > 0;
  }

  containsNegatedAt(tick, name, ...args) {
    return this.factHistory.some(r =>
      r.isActiveAt(tick) && this.factMatches(r.fact, name, args, true)
    );
  }

  // Internal: returns the canonical record for fact, or null if not present.
  _getCanonicalRecord(fact) {
    return this._canonicalRecords.get(this._canonicalKey(fact)) ?? null;
  }

  _getOrCreateCanonicalRecord(fact) {
    const key = this._canonicalKey(fact);
    if (!this._canonicalRecords.has(key)) {
      this._canonicalRecords.set(key, new FactRecord(fact));
    }
    return this._canonicalRecords.get(key);
  }

  _canonicalKey(fact) {
    const polarity = fact.negated ? '~' : '+';
    const value    = fact.value !== null ? `:${fact.value}` : '';
    return `${polarity}:${fact.name}(${fact.args.join(',')})${value}`;
  }

  _resolveProvenance(fact, explicit) {
    if (explicit !== null) return explicit;
    if (this._provenanceHook !== null) return this._provenanceHook(fact, this.currentTick);
    return new GivenProvenance();
  }

  factMatches(fact, name, args, negated = false) {
    if (fact.name !== name) return false;
    if (fact.negated !== negated) return false;
    if (fact.args.length !== args.length) return false;
    return args.every((arg, i) => arg === null || arg === fact.args[i]);
  }
}
