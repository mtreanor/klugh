import { Rule } from '../Rule.js';
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
import { TemporalChainPredicate } from '../predicates/TemporalChainPredicate.js';
import { CountPredicate } from '../predicates/CountPredicate.js';
import { NumericComparisonPredicate } from '../predicates/NumericComparisonPredicate.js';
import { SensorPredicate } from '../predicates/SensorPredicate.js';
import { SensorNumericTierPredicate } from '../predicates/SensorNumericTierPredicate.js';
import { SensorNumericComparisonPredicate } from '../predicates/SensorNumericComparisonPredicate.js';

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
    return {
      rules: data.rules.map(r => this.buildRule(r)),
    };
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

    const needsNameLookup = !['negation', 'explicit-negation', 'not-negated', 'weak-negation', 'temporal-chain', 'count', 'private'].includes(data.type);
    if (this.predicateSchema && needsNameLookup) {
      if (!this.predicateSchema.hasDefinition(data.name)) {
        throw new Error(`Unknown predicate: "${data.name}" is not defined in the predicate schema`);
      }
    }
    switch (data.type) {
      case 'fact':
        return new FactPredicate(data.name, ...this.resolveArgs(data.args));
      case 'historical-window':
        return new HistoricalWindowPredicate(data.name, this.resolveArgs(data.args), data.window ?? null, data.tier ?? null);
      case 'derived':
        return new DerivedFactPredicate(data.name, ...this.resolveArgs(data.args));
      case 'negation':
        return new NegationPredicate(this.buildPredicate(data.predicate));
      case 'explicit-negation':
        return this.buildExplicitNegation(data.predicate);
      case 'not-negated':
        return new NegationPredicate(this.buildExplicitNegation(data.predicate));
      case 'weak-negation':
        return new WeakNegationPredicate(this.buildPredicate(data.predicate));
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
      case 'count': {
        const { innerData, countingVars, countingVarTypes } = this.rewriteCountArgs(data.predicate);
        const innerPredicate = this.buildPredicate(innerData);
        return new CountPredicate(innerPredicate, countingVars, countingVarTypes, data.operator, data.threshold);
      }
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

  rewriteCountArgs(innerData) {
    let countIdx = 0;
    const countingVars     = [];
    const countingVarTypes = new Map();

    const predicateName = innerData.name;
    const argTypes = (predicateName && this.predicateSchema?.hasDefinition(predicateName))
      ? (this.predicateSchema.getDefinition(predicateName).args ?? [])
      : [];

    const rewrittenArgs = (innerData.args ?? []).map((arg, i) => {
      if (arg === null) {
        const varName = `__count_${countIdx++}__`;
        countingVars.push(new LogicalVariable(varName));
        countingVarTypes.set(varName, argTypes[i] ?? 'agent');
        return `?${varName}`;
      }
      return arg;
    });

    return { innerData: { ...innerData, args: rewrittenArgs }, countingVars, countingVarTypes };
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

  resolveArgs(args) {
    return this.stateOperationLoader.resolveArgs(args);
  }
}
