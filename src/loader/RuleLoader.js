import { Rule } from '../Rule.js';
import { RuleCycleDetector } from '../RuleCycleDetector.js';
import { StateOperationLoader } from './StateOperationLoader.js';
import { PrivatePredicate } from '../predicates/PrivatePredicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { FactPredicate } from '../predicates/FactPredicate.js';
import { DerivedFactPredicate } from '../predicates/DerivedFactPredicate.js';
import { NegationPredicate } from '../predicates/NegationPredicate.js';
import { ExplicitNegationPredicate } from '../predicates/ExplicitNegationPredicate.js';
import { WeakNegationPredicate } from '../predicates/WeakNegationPredicate.js';
import { NumericTierPredicate } from '../predicates/NumericTierPredicate.js';
import { HistoricalWindowPredicate } from '../predicates/HistoricalWindowPredicate.js';
import { DuringPredicate } from '../predicates/DuringPredicate.js';
import { WhenPredicate } from '../predicates/WhenPredicate.js';
import { TemporalChainPredicate } from '../predicates/TemporalChainPredicate.js';
import { NumericComparisonPredicate } from '../predicates/NumericComparisonPredicate.js';
import { SensorPredicate } from '../predicates/SensorPredicate.js';
import { SensorNumericTierPredicate } from '../predicates/SensorNumericTierPredicate.js';
import { SensorNumericComparisonPredicate } from '../predicates/SensorNumericComparisonPredicate.js';
import { ComparisonPredicate } from '../predicates/ComparisonPredicate.js';
import { AtTickPredicate } from '../predicates/AtTickPredicate.js';
import { AggregatePredicate } from '../predicates/AggregatePredicate.js';

function* walkPredicates(predicate) {
  yield predicate;
  if (predicate.predicate)      yield* walkPredicates(predicate.predicate);
  if (predicate.innerPredicate) yield* walkPredicates(predicate.innerPredicate);
}

function warnUnboundOwners(rule) {
  const boundVars = new Set(rule.collectVariables().map(v => v.name));
  for (const { predicate } of rule.predicateEntries) {
    for (const p of walkPredicates(predicate)) {
      if (p instanceof PrivatePredicate && p.isVariable && !boundVars.has(p.owner.name)) {
        console.warn(
          `Rule "${rule.name}": owner variable ${p.owner} in "${p}" ` +
          `will never be bound — the predicate will always be false. ` +
          `Bind ${p.owner} via a positive predicate earlier in the conjunction, ` +
          `or use a ground entity name.`
        );
      }
    }
  }
}

export class RuleLoader {
  constructor(predicateSchema = null) {
    this.predicateSchema      = predicateSchema;
    this.stateOperationLoader = new StateOperationLoader(predicateSchema);
  }

  load(data) {
    const rules = data.rules.map(r => this.buildRule(r));
    const cycle = new RuleCycleDetector().detect(rules);
    if (cycle) {
      throw new Error(
        `Cyclic rule dependency detected — this rule set may not terminate.\n` +
        `Cycle: ${cycle.join(' → ')}`
      );
    }
    return { rules };
  }

  buildRule(data) {
    const predicateEntries = data.predicates.map(e => this.buildPredicateEntry(e));
    const effects = data.effects.map(e => this.buildStateOperation(e));
    const rule = new Rule(data.name, predicateEntries, effects);
    warnUnboundOwners(rule);
    return rule;
  }

  buildStateOperation(data) {
    return this.stateOperationLoader.buildStateOperation(data);
  }

  buildRuleEffect(data) {
    return this.buildStateOperation(data);
  }

  // A predicate entry is either a plain predicate (has "type") or a weighted
  // wrapper { predicate, importance } (no "type" at the top level).
  buildPredicateEntry(entry) {
    if ('type' in entry) {
      return { predicate: this.buildPredicate(entry), importance: 1.0 };
    }
    return { predicate: this.buildPredicate(entry.predicate), importance: entry.importance };
  }

  buildPredicate(data) {
    if (data.type === 'private') {
      const inner = this.buildPredicate(data.predicate);
      const owner = data.ownerVar
        ? new LogicalVariable(data.ownerVar.slice(1))
        : data.ownerEntity;
      return new PrivatePredicate(owner, inner, { isVariable: !!data.ownerVar });
    }

    const needsNameLookup = !['negation', 'explicit-negation', 'not-negated', 'weak-negation', 'temporal-chain', 'count', 'private', 'at-tick', 'comparison', 'aggregate', 'pred-aggregate-comparison'].includes(data.type);
    if (this.predicateSchema && needsNameLookup) {
      if (!this.predicateSchema.hasDefinition(data.name)) {
        throw new Error(`Unknown predicate: "${data.name}" is not defined in the predicate schema`);
      }
    }
    switch (data.type) {
      case 'fact':
        return new FactPredicate(data.name, ...this.resolveArgs(data.args));
      case 'historical':
      case 'historical-window':
        return new HistoricalWindowPredicate(data.name, this.resolveArgs(data.args), data.window ?? null, data.tier ?? null);
      case 'during':
        return new DuringPredicate(data.name, this.resolveArgs(data.args), data.window);
      case 'when':
        return new WhenPredicate(data.name, this.resolveArgs(data.args), this.resolveArgs([data.tickVar])[0]);
      case 'derived':
        return new DerivedFactPredicate(data.name, ...this.resolveArgs(data.args));
      case 'negation':
        return new NegationPredicate(this.buildPredicate(data.predicate));
      case 'explicit-negation':
        return this.buildExplicitNegation(data.predicate);
      case 'not-negated':
        return new NegationPredicate(this.buildExplicitNegation(data.predicate));
      case 'weak-negation':
        return this.buildWeakNegation(data.predicate);
      case 'sensor':
        return new SensorPredicate(data.name, this.resolveArgs(data.args));
      case 'numeric-value': {
        const def = this.predicateSchema?.getDefinition(data.name);
        if (def?.type === 'sensor-numeric') {
          return new SensorNumericComparisonPredicate(data.name, this.resolveArgs(data.args), data.operator, data.threshold);
        }
        return new NumericComparisonPredicate(data.name, this.resolveArgs(data.args), data.operator, data.threshold);
      }
      case 'numeric-tier': {
        const def = this.predicateSchema?.getDefinition(data.name);
        if (def?.type === 'sensor-numeric') {
          return new SensorNumericTierPredicate(data.name, this.resolveArgs(data.args), data.tier);
        }
        if (this.predicateSchema && !def?.tiers?.[data.tier]) {
          throw new Error(`Unknown tier "${data.tier}" for predicate "${data.name}"`);
        }
        return new NumericTierPredicate(data.name, this.resolveArgs(data.args), data.tier);
      }
      case 'comparison': {
        const leftKind  = this.comparisonOperandKind(data.left.name);
        const rightKind = this.comparisonOperandKind(data.right.name);
        if (leftKind !== rightKind) {
          throw new Error(`Comparison operands must be the same kind: "${data.left.name}" is ${leftKind}, "${data.right.name}" is ${rightKind}`);
        }
        if (leftKind === 'boolean' && data.operator !== '=' && data.operator !== '!=') {
          throw new Error(`Operator "${data.operator}" is not valid for boolean predicates "${data.left.name}"/"${data.right.name}" — use = or !=`);
        }
        return new ComparisonPredicate(
          leftKind,
          { name: data.left.name,  args: this.resolveArgs(data.left.args) },
          data.operator,
          { name: data.right.name, args: this.resolveArgs(data.right.args) },
        );
      }
      case 'aggregate': {
        const { filterPredicates, valuePred, countingVars, countingVarTypes } = this.buildAggregateInner(data.predicates, data.fn);
        const rhs = this.buildAggregateRhs(data.rhs);
        return new AggregatePredicate(data.fn, filterPredicates, valuePred, countingVars, countingVarTypes, data.operator, rhs);
      }
      case 'pred-aggregate-comparison': {
        if (this.predicateSchema) {
          const def = this.predicateSchema.getDefinition(data.left.name);
          if (!def || (def.type !== 'numeric' && def.type !== 'sensor-numeric')) {
            throw new Error(`Predicate "${data.left.name}" must be numeric to appear on the left side of an aggregate comparison`);
          }
        }
        const { filterPredicates, valuePred, countingVars, countingVarTypes } = this.buildAggregateInner(data.right.predicates, data.right.fn);
        const flippedOp = flipOperator(data.operator);
        const rhs = { kind: 'numeric', name: data.left.name, args: this.resolveArgs(data.left.args) };
        return new AggregatePredicate(data.right.fn, filterPredicates, valuePred, countingVars, countingVarTypes, flippedOp, rhs);
      }
      case 'at-tick':
        return new AtTickPredicate(this.buildPredicate(data.predicate), data.tick, data.relative ?? false);
      case 'temporal-chain': {
        const steps = data.steps.map(step => {
          if (this.predicateSchema && !this.predicateSchema.hasDefinition(step.name)) {
            throw new Error(`Unknown predicate: "${step.name}" is not defined in the predicate schema`);
          }
          return { name: step.name, args: this.resolveArgs(step.args), within: step.within ?? null };
        });
        return new TemporalChainPredicate(steps);
      }
      default:
        throw new Error(`Unknown predicate type: "${data.type}"`);
    }
  }

  // The owner prefix must wrap the weak negation (not the other way around) so the
  // store is scoped before evaluateWeak runs against a plain fact predicate.
  buildWeakNegation(inner) {
    if (inner.type === 'private') {
      const owner = inner.ownerVar
        ? new LogicalVariable(inner.ownerVar.slice(1))
        : inner.ownerEntity;
      const weak = new WeakNegationPredicate(this.buildPredicate(inner.predicate));
      return new PrivatePredicate(owner, weak, { isVariable: !!inner.ownerVar });
    }
    return new WeakNegationPredicate(this.buildPredicate(inner));
  }

  buildExplicitNegation(inner) {
    if (inner.type === 'private') {
      const owner   = inner.ownerVar
        ? new LogicalVariable(inner.ownerVar.slice(1))
        : inner.ownerEntity;
      const negPred = new ExplicitNegationPredicate(inner.predicate.name, ...this.resolveArgs(inner.predicate.args));
      return new PrivatePredicate(owner, negPred, { isVariable: !!inner.ownerVar });
    }
    return new ExplicitNegationPredicate(inner.name, ...this.resolveArgs(inner.args));
  }

  // Classifies a comparison operand by schema type. Numeric operands ('numeric',
  // 'sensor-numeric') support all operators; boolean operands ('boolean',
  // 'derived', boolean 'sensor') support only = / !=. Derived and sensor operands
  // are total — they resolve to 'true'/'false', never 'unknown'.
  comparisonOperandKind(name) {
    if (this.predicateSchema && !this.predicateSchema.hasDefinition(name)) {
      throw new Error(`Unknown predicate: "${name}" is not defined in the predicate schema`);
    }
    const type = this.predicateSchema?.getDefinition(name)?.type;
    if (type === 'numeric' || type === 'sensor-numeric') return 'numeric';
    if (type === 'boolean' || type === 'derived' || type === 'sensor') return 'boolean';
    throw new Error(`Predicate "${name}" (type ${type ?? 'unknown'}) cannot be used in a comparison`);
  }

  // fn distinguishes two shapes of aggregate:
  //   'count'                — every predicate in the conjunction is a filter;
  //                            the result is how many enumerated combinations
  //                            satisfy all of them. No value predicate — a bare
  //                            numeric predicate reference (not a comparison)
  //                            has no defined meaning as a filter, so it's an
  //                            error, not silently ignored.
  //   'avg'/'sum'/'max'/'min' — exactly one predicate in the conjunction must be
  //                            numeric (the value being aggregated); the rest
  //                            are filters.
  buildAggregateInner(predicates, fn) {
    if (!this.predicateSchema) {
      throw new Error('Aggregate predicates require a predicate schema');
    }
    const { rewrittenPredicates, countingVars, countingVarTypes } = this.rewriteAggregateArgs(predicates);

    if (fn === 'count') {
      const filterPredicates = rewrittenPredicates.map(pred => {
        const effective  = unwrapPrivate(pred);
        const schemaType = this.predicateSchema.getDefinition(effective.name)?.type;
        if (effective.type === 'fact' && (schemaType === 'numeric' || schemaType === 'sensor-numeric')) {
          throw new Error(`count|...| filters on whether predicates hold, not their value — "${effective.name}" is a bare numeric predicate reference with no comparison. Use a comparison (e.g. "${effective.name}(...) > N") instead.`);
        }
        return this.buildPredicate(pred);
      });
      return { filterPredicates, valuePred: null, countingVars, countingVarTypes };
    }

    let valuePred = null;
    const filterPredicates = [];

    for (const pred of rewrittenPredicates) {
      const effective  = unwrapPrivate(pred);
      const schemaType = this.predicateSchema.getDefinition(effective.name)?.type;
      if (schemaType === 'numeric' || schemaType === 'sensor-numeric') {
        if (valuePred !== null) {
          throw new Error(`Aggregate conjunction has more than one numeric predicate: "${valuePred.name}" and "${effective.name}"`);
        }
        if (pred.type === 'private') {
          throw new Error(`Aggregate conjunction's numeric value predicate "${effective.name}" is private-store-owned (?owner.${effective.name}(...)) — aggregating a value out of a private store isn't supported yet. Only filter predicates (count's kind, or additional conjuncts alongside a world-store value predicate) may be private-owned.`);
        }
        valuePred = { name: effective.name, args: this.resolveArgs(effective.args) };
      } else {
        filterPredicates.push(this.buildPredicate(pred));
      }
    }

    if (valuePred === null) {
      throw new Error(`Aggregate conjunction has no numeric predicate — one is required to provide the value being aggregated`);
    }

    return { filterPredicates, valuePred, countingVars, countingVarTypes };
  }

  // Rewrites `_` wildcards in an aggregate conjunction to counting variables.
  // One variable is created per unique entity type, shared across all predicates,
  // so `_` positions of the same entity type are implicitly joined — including
  // between a private-owned predicate and a world/derived one, e.g.
  // count|?SELF.embarrassedThemselves(_) ^ sameGroup(?SELF, _)| joins on the
  // same candidate agent in both conjuncts even though they're owned differently.
  rewriteAggregateArgs(predicates) {
    const typeToVar      = new Map();
    const countingVarTypes = new Map();
    let varIdx = 0;

    const rewriteOne = (pred) => {
      if (pred.type === 'private') {
        return { ...pred, predicate: rewriteOne(pred.predicate) };
      }

      const argTypes = (pred.name && this.predicateSchema?.hasDefinition(pred.name))
        ? (this.predicateSchema.getDefinition(pred.name).args ?? [])
        : [];

      const rewrittenArgs = (pred.args ?? []).map((arg, i) => {
        if (arg !== null) return arg;
        const entityType = argTypes[i] ?? 'agent';
        if (!typeToVar.has(entityType)) {
          const varName = `__agg_${varIdx++}__`;
          typeToVar.set(entityType, new LogicalVariable(varName));
          countingVarTypes.set(varName, entityType);
        }
        return `?${typeToVar.get(entityType).name}`;
      });

      return { ...pred, args: rewrittenArgs };
    };

    const rewrittenPredicates = predicates.map(rewriteOne);
    return { rewrittenPredicates, countingVars: [...typeToVar.values()], countingVarTypes };
  }

  buildAggregateRhs(rhs) {
    if (rhs.kind === 'literal') return { kind: 'literal', value: rhs.value };
    if (rhs.kind === 'predicate') {
      if (this.predicateSchema) {
        const def = this.predicateSchema.getDefinition(rhs.name);
        if (!def || (def.type !== 'numeric' && def.type !== 'sensor-numeric')) {
          throw new Error(`Aggregate comparison RHS "${rhs.name}" must be a numeric predicate`);
        }
      }
      return { kind: 'numeric', name: rhs.name, args: this.resolveArgs(rhs.args) };
    }
    // kind === 'aggregate' — a bare aggregate expression used as a value source
    const { filterPredicates, valuePred, countingVars, countingVarTypes } = this.buildAggregateInner(rhs.predicates, rhs.fn);
    const innerPredicate = new AggregatePredicate(rhs.fn, filterPredicates, valuePred, countingVars, countingVarTypes, null, null);
    return { kind: 'aggregate', predicate: innerPredicate };
  }

  resolveArgs(args) {
    return this.stateOperationLoader.resolveArgs(args);
  }
}

function flipOperator(op) {
  switch (op) {
    case '>':  return '<';
    case '<':  return '>';
    case '>=': return '<=';
    case '<=': return '>=';
    default:   return op; // '=' and '!=' are symmetric
  }
}

// Strips a private-owner wrapper to reach the underlying fact/tier predicate's
// name and args, for schema lookups that need to classify what's being
// referenced regardless of which store it's read from.
function unwrapPrivate(pred) {
  return pred.type === 'private' ? pred.predicate : pred;
}
