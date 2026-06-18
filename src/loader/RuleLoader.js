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
import { TemporalChainPredicate } from '../predicates/TemporalChainPredicate.js';
import { CountPredicate } from '../predicates/CountPredicate.js';
import { NumericComparisonPredicate } from '../predicates/NumericComparisonPredicate.js';
import { SensorPredicate } from '../predicates/SensorPredicate.js';
import { SensorNumericTierPredicate } from '../predicates/SensorNumericTierPredicate.js';
import { SensorNumericComparisonPredicate } from '../predicates/SensorNumericComparisonPredicate.js';
import { ComparisonPredicate } from '../predicates/ComparisonPredicate.js';
import { AtTickPredicate } from '../predicates/AtTickPredicate.js';

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

    const needsNameLookup = !['negation', 'explicit-negation', 'not-negated', 'weak-negation', 'temporal-chain', 'count', 'private', 'at-tick', 'comparison'].includes(data.type);
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
      case 'count': {
        const { innerData, countingVars, countingVarTypes } = this.rewriteCountArgs(data.predicate);
        const innerPredicate = this.buildPredicate(innerData);
        return new CountPredicate(innerPredicate, countingVars, countingVarTypes, data.operator, data.threshold);
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
      case 'at-tick':
        return new AtTickPredicate(this.buildPredicate(data.predicate), data.tick);
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

  resolveArgs(args) {
    return this.stateOperationLoader.resolveArgs(args);
  }
}
