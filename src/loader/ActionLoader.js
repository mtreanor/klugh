import { RuleLoader } from './RuleLoader.js';
import { Action } from '../Action.js';
import { ConstantUtilitySource } from '../utility/ConstantUtilitySource.js';
import { PredicateUtilitySource } from '../utility/PredicateUtilitySource.js';
import { AggregateUtilitySource } from '../utility/AggregateUtilitySource.js';
import { RuleUtilitySource } from '../utility/RuleUtilitySource.js';
import { TextContentItem } from '../content/TextContentItem.js';
import { LogicalVariable } from '../LogicalVariable.js';

export class ActionLoader {
  constructor(predicateSchema = null) {
    this.predicateSchema = predicateSchema;
    this.ruleLoader      = new RuleLoader(predicateSchema);
  }

  load(data) {
    return { actions: data.actions.map(a => this.buildAction(a)) };
  }

  buildAction(data) {
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
      case 'predicate':
        return new PredicateUtilitySource(data.name, this.resolveArgs(data.args));
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
