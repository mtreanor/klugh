import { RuleLoader } from './RuleLoader.js';
import { Action } from '../Action.js';
import { ConstantUtilitySource } from '../utility/ConstantUtilitySource.js';
import { PredicateUtilitySource } from '../utility/PredicateUtilitySource.js';
import { AggregateUtilitySource } from '../utility/AggregateUtilitySource.js';
import { RuleUtilitySource } from '../utility/RuleUtilitySource.js';
import { RandomUtilitySource } from '../utility/RandomUtilitySource.js';
import { PredicateAggregateUtilitySource } from '../utility/PredicateAggregateUtilitySource.js';
import { TextContentItem } from '../content/TextContentItem.js';
import { LogicalVariable } from '../LogicalVariable.js';

// Yields every string leaf in a parsed AST fragment — used to catch
// ?this_occurrence anywhere it is not allowed, regardless of nesting.
function* deepStrings(node) {
  if (typeof node === 'string') { yield node; return; }
  if (Array.isArray(node)) { for (const item of node) yield* deepStrings(item); return; }
  if (node && typeof node === 'object') { for (const value of Object.values(node)) yield* deepStrings(value); return; }
}

export class ActionLoader {
  constructor(predicateSchema = null) {
    this.predicateSchema = predicateSchema;
    this.ruleLoader      = new RuleLoader(predicateSchema);
  }

  load(data) {
    return { actions: data.actions.map(a => this.buildAction(a)) };
  }

  buildAction(data) {
    // ?this_occurrence refers to the recorded occurrence, which exists only at
    // execution time — so it is valid only in effects. Reject it anywhere else.
    for (const section of ['info', 'preconditions', 'utilitySources']) {
      for (const str of deepStrings(data[section])) {
        if (str === '?this_occurrence') {
          throw new Error(
            `Action "${data.name}": ?this_occurrence is only valid in an effects: block — ` +
            `it refers to the recorded occurrence, which exists only at execution time.`
          );
        }
      }
    }

    const preconditions  = (data.preconditions  ?? []).map(e => this.ruleLoader.buildPredicateEntry(e));
    const effects        = data.effects.map(e => this.ruleLoader.buildStateOperation(e));
    const utilitySources = (data.utilitySources ?? []).map(s => this.buildUtilitySource(s));
    const content        = data.content ? this.buildContent(data.content) : null;
    return new Action(data.name, {
      roles: data.roles ?? [],
      info:  data.info  ?? [],
      preconditions,
      effects,
      utilitySources,
      content,
    });
  }

  buildUtilitySource(data) {
    switch (data.type) {
      case 'constant':
        return new ConstantUtilitySource(data.value);
      case 'random':
        return new RandomUtilitySource(data.min, data.max);
      case 'predicate': {
        const owner = data.owner != null
          ? (typeof data.owner === 'string' && data.owner.startsWith('?')
              ? new LogicalVariable(data.owner.slice(1))
              : data.owner)
          : null;
        return new PredicateUtilitySource(data.name, this.resolveArgs(data.args), owner);
      }
      case 'predicate-aggregate': {
        const { filterPredicates, valuePred, countingVars, countingVarTypes } = this.ruleLoader.buildAggregateInner(data.predicates);
        return new PredicateAggregateUtilitySource(data.fn, filterPredicates, valuePred, countingVars, countingVarTypes);
      }
      case 'aggregate':
        return new AggregateUtilitySource(data.aggregator, data.sources.map(s => this.buildUtilitySource(s)));
      case 'rule': {
        const predicateEntries = data.predicates.map(e => this.ruleLoader.buildPredicateEntry(e));
        return new RuleUtilitySource(data.name, predicateEntries, data.weight);
      }
      default:
        throw new Error(`Unknown utility source type: "${data.type}"`);
    }
  }

  buildContent(data) {
    if (data.type === 'text') return new TextContentItem(data.template);
    throw new Error(`Unknown content type: "${data.type}"`);
  }

  resolveArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('?')) return new LogicalVariable(arg.slice(1));
      return arg;
    });
  }
}
