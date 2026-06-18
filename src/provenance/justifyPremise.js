import { Fact } from '../Fact.js';
import { FactPredicate } from '../predicates/FactPredicate.js';
import { DerivedFactPredicate } from '../predicates/DerivedFactPredicate.js';
import { NumericTierPredicate } from '../predicates/NumericTierPredicate.js';
import { NumericComparisonPredicate } from '../predicates/NumericComparisonPredicate.js';
import { ExplicitNegationPredicate } from '../predicates/ExplicitNegationPredicate.js';
import { NegationPredicate } from '../predicates/NegationPredicate.js';
import { WeakNegationPredicate } from '../predicates/WeakNegationPredicate.js';
import { CountPredicate } from '../predicates/CountPredicate.js';
import { TemporalChainPredicate } from '../predicates/TemporalChainPredicate.js';
import { HistoricalWindowPredicate } from '../predicates/HistoricalWindowPredicate.js';
import { PrivatePredicate } from '../predicates/PrivatePredicate.js';
import { AtTickPredicate } from '../predicates/AtTickPredicate.js';

// A Justification records *what supported a single rule/define premise* at the
// moment it was satisfied — the other half of provenance. It is attached to a
// RuleEffectProvenance/DerivedFactProvenance as a parallel array to the rule's
// premises, so a conclusion can be walked back through its support to the leaves.
//
// kind:
//   'fact'              — a positive boolean fact          → record
//   'numeric'           — a numeric tier/comparison        → record (NumericRecord), value
//   'derived'           — a define-derived premise         → subProvenance (a sub-tree)
//   'explicit-negation' — a present -pred disbelief        → record
//   'absence'           — held because something is ABSENT → present:false, no record
//   'count'             — |pred| satisfied                 → records (the counted facts)
//   'temporal'          — a `then` chain                   → records (one per step)
//   'historical'        — a [history] check                → record
//   'sensor' / 'unknown'— computed elsewhere / unmodelled  → no record
export class Justification {
  constructor(predicate, kind, {
    description   = '',
    present       = true,
    record        = null,
    records       = null,
    subProvenance = null,
    value         = null,
    tick          = null,
  } = {}) {
    this.predicate     = predicate;
    this.kind          = kind;
    this.description   = description;
    this.present       = present;
    this.record        = record;
    this.records       = records;
    this.subProvenance = subProvenance;
    this.value         = value;
    this.tick          = tick;
  }
}

// Builds the parallel justification array for a rule/define's premises. Defensive
// by construction: a failure to justify one premise yields an 'unknown'
// justification rather than throwing — recording must never break rule firing.
export function buildPremiseJustifications(predicateEntries, binding, evaluationContext) {
  return predicateEntries.map(entry => justifyPremise(entry.predicate, binding, evaluationContext));
}

export function justifyPremise(predicate, binding, evaluationContext) {
  try {
    return justify(predicate, binding, evaluationContext);
  } catch {
    return new Justification(predicate, 'unknown', { description: safeDescribe(predicate, binding) });
  }
}

function justify(predicate, binding, ctx) {
  const description = safeDescribe(predicate, binding);
  const mk = (kind, fields = {}) => new Justification(predicate, kind, { description, ...fields });

  if (predicate instanceof FactPredicate) {
    const args = resolveArgs(predicate.args, binding);
    return mk('fact', { record: lookupRecord(ctx, predicate.name, args, false), tick: ctx.currentTick });
  }

  if (predicate instanceof DerivedFactPredicate) {
    const args    = resolveArgs(predicate.args, binding);
    const derived = ctx.getHandler('derived');
    const sub     = derived?.buildProvenance?.(predicate.name, args, ctx, ctx.getActiveFactStore()) ?? null;
    return mk('derived', { subProvenance: sub });
  }

  if (predicate instanceof NumericTierPredicate || predicate instanceof NumericComparisonPredicate) {
    const args    = resolveArgs(predicate.args, binding);
    const numeric = ctx.getHandler('numeric');
    return mk('numeric', {
      record: numeric?.getRecord?.(predicate.name, args) ?? null,
      value:  numeric?.getValue?.(predicate.name, args, ctx) ?? null,
    });
  }

  if (predicate instanceof ExplicitNegationPredicate) {
    const args = resolveArgs(predicate.args, binding);
    return mk('explicit-negation', { record: lookupRecord(ctx, predicate.name, args, true) });
  }

  // not pred — held because the positive belief is absent.
  if (predicate instanceof NegationPredicate) {
    return mk('absence', { present: false });
  }

  // ~pred — absent OR explicitly disbelieved. Point at the disbelief if present.
  if (predicate instanceof WeakNegationPredicate) {
    const inner = predicate.innerPredicate;
    if (inner instanceof FactPredicate) {
      const args      = resolveArgs(inner.args, binding);
      const disbelief = lookupRecord(ctx, inner.name, args, true);
      if (disbelief?.isCurrentlyActive()) return mk('explicit-negation', { record: disbelief, present: false });
    }
    return mk('absence', { present: false });
  }

  if (predicate instanceof CountPredicate) {
    return mk('count', { records: collectCountRecords(predicate, binding, ctx) });
  }

  if (predicate instanceof TemporalChainPredicate) {
    return mk('temporal', { records: collectChainRecords(predicate, binding, ctx) });
  }

  if (predicate instanceof HistoricalWindowPredicate) {
    const args = resolveArgs(predicate.args, binding);
    if (predicate.tier !== null) {
      return mk('historical', { record: ctx.getHandler('numeric')?.getRecord?.(predicate.name, args) ?? null });
    }
    return mk('historical', { record: lookupRecord(ctx, predicate.name, args, false) });
  }

  // ?owner.pred — justify the inner predicate against the owner's private store.
  if (predicate instanceof PrivatePredicate) {
    const ownerName = predicate.resolveOwnerName(binding);
    const store     = ownerName != null ? ctx.privateStores?.get(ownerName) : null;
    if (store) return rewrap(predicate, description, justify(predicate.innerPredicate, binding, ctx.scopedToStore(store)));
    return mk('private');
  }

  // pred [at: N] — justify the inner predicate as of that tick.
  if (predicate instanceof AtTickPredicate) {
    const j = justify(predicate.inner, binding, ctx.withTick(predicate.tick));
    return rewrap(predicate, description, j, predicate.tick);
  }

  // Sensors and anything not modelled above: described, but no stored support.
  return mk('unknown');
}

// Re-label a nested justification with the wrapping predicate's description,
// carrying its support through (for PrivatePredicate / AtTickPredicate).
function rewrap(predicate, description, inner, tick = null) {
  return new Justification(predicate, inner.kind, {
    description,
    present:       inner.present,
    record:        inner.record,
    records:       inner.records,
    subProvenance: inner.subProvenance,
    value:         inner.value,
    tick:          tick ?? inner.tick,
  });
}

function collectCountRecords(predicate, binding, ctx) {
  const registry = ctx.entityRegistry;
  const lists = predicate.countingVars.map(v =>
    registry?.get(predicate.countingVarTypes.get(v.name) ?? 'agent') ?? []
  );
  const records = [];
  for (const combination of cartesian(lists)) {
    let extended = binding;
    predicate.countingVars.forEach((v, i) => { extended = extended.extend(v, combination[i]); });
    if (!predicate.innerPredicate.evaluate(extended, ctx)) continue;
    const j = justify(predicate.innerPredicate, extended, ctx);
    if (j.record) records.push(j.record);
    else if (j.records) records.push(...j.records);
  }
  return records;
}

function collectChainRecords(predicate, binding, ctx) {
  return predicate.steps
    .map(step => lookupRecord(ctx, step.name, resolveArgs(step.args, binding), false))
    .filter(Boolean);
}

function* cartesian(lists) {
  if (lists.length === 0) { yield []; return; }
  const [head, ...tail] = lists;
  for (const item of head) {
    for (const rest of cartesian(tail)) yield [item, ...rest];
  }
}

function lookupRecord(ctx, name, args, negated) {
  if (args.some(a => a == null)) return null;
  return ctx.getActiveFactStore()._getCanonicalRecord(new Fact(name, ...args, { negated }));
}

function resolveArgs(args, binding) {
  return args.map(a => toFactArg(binding.resolve(a)));
}

function toFactArg(value) {
  return (value !== null && typeof value === 'object' && 'name' in value) ? value.name : value;
}

function safeDescribe(predicate, binding) {
  try { return predicate.describe(binding); }
  catch { return predicate.toString?.() ?? String(predicate); }
}
