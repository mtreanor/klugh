import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { bindingSatisfiesDistinctArguments } from '../src/DistinctArguments.js';

const schema = new PredicateSchema({
  predicates: {
    knows:        { type: 'boolean', args: ['agent', 'agent'] },
    hasKnowledge: { type: 'boolean', args: ['agent', 'knowledge'] },
    hasNeed:      { type: 'boolean', args: ['agent', 'string'] },
  },
});

const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const karate = { name: 'karate' };
const entityRegistry = new Map([
  ['agent', [alice, bob]],
  ['knowledge', [karate]],
]);

describe('bindingSatisfiesDistinctArguments', () => {
  it('rejects the same agent in two agent slots of one predicate', () => {
    const binding = new Binding().extend(new LogicalVariable('Y'), alice);
    const pred = new FactPredicate('knows', 'alice', new LogicalVariable('Y'));
    assert.equal(
      bindingSatisfiesDistinctArguments(binding, [pred], schema, entityRegistry),
      false
    );
  });

  it('allows the same agent across predicates with different literal subjects', () => {
    const binding = new Binding().extend(new LogicalVariable('Y'), bob);
    const preds = [
      new FactPredicate('knows', 'alice', new LogicalVariable('Y')),
      new FactPredicate('hasKnowledge', new LogicalVariable('Y'), karate),
    ];
    assert.equal(
      bindingSatisfiesDistinctArguments(binding, preds, schema, entityRegistry),
      true
    );
  });

  it('does not constrain agent and string slots', () => {
    const binding = new Binding();
    const pred = new FactPredicate('hasNeed', alice, 'companionship');
    assert.equal(
      bindingSatisfiesDistinctArguments(binding, [pred], schema, entityRegistry),
      true
    );
  });
});
