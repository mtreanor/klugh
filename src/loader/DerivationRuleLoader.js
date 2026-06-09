import { DerivationRule } from '../DerivationRule.js';
import { RuleLoader } from './RuleLoader.js';
import { LogicalVariable } from '../LogicalVariable.js';

export class DerivationRuleLoader {
  constructor(predicateSchema = null) {
    this.ruleLoader = new RuleLoader(predicateSchema);
  }

  load(data) {
    return {
      definitions: data.definitions.map(entry => this.buildDeriveRule(entry)),
    };
  }

  buildDeriveRule(data) {
    const premiseEntries = data.predicates.map(entry => this.ruleLoader.buildPredicateEntry(entry));

    let conclusionNode   = data.conclusion;
    let conclusionOwnerVar = null;

    if (conclusionNode.type === 'private') {
      if (conclusionNode.ownerVar) {
        conclusionOwnerVar = new LogicalVariable(conclusionNode.ownerVar.slice(1));
      }
      conclusionNode = conclusionNode.predicate;
    }

    if (this.ruleLoader.predicateSchema) {
      const definition = this.ruleLoader.predicateSchema.getDefinition(conclusionNode.name);
      if (!definition) {
        throw new Error(
          `Derive rule "${data.name}": unknown conclusion predicate "${conclusionNode.name}"`
        );
      }
      if (definition.type !== 'derived') {
        throw new Error(
          `Derive rule "${data.name}": conclusion "${conclusionNode.name}" must have schema type "derived"`
        );
      }
    }

    const conclusion = this.ruleLoader.buildPredicate({ ...conclusionNode, type: 'derived' });
    return new DerivationRule(data.name, premiseEntries, conclusion, conclusionOwnerVar);
  }
}
