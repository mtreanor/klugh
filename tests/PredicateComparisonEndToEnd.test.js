import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForwardChainer } from '../src/ForwardChainer.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { NumericStateQueryHandler } from '../src/queryHandlers/NumericStateQueryHandler.js';
import { World } from '../src/World.js';
import { Rule } from '../src/Rule.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { ComparisonPredicate } from '../src/predicates/ComparisonPredicate.js';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');

const schema = new PredicateSchema({
  predicates: {
    health:   { type: 'numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    stronger: { type: 'boolean', args: ['agent', 'agent'] },
  },
});

function makeWorld(healthByAgent) {
  const world = new World(schema);
  world.entityRegistry.set('agent', Object.keys(healthByAgent).map(n => ({ name: n })));
  const numericHandler = new NumericStateQueryHandler(world.factStore, schema);
  world.queryHandlers.register('numeric', numericHandler);
  for (const [agent, value] of Object.entries(healthByAgent)) {
    numericHandler.setValue('health', [agent], value);
  }
  return world;
}

describe('predicate comparison — forward chaining', () => {
  it('enumerates both operands and fires only on satisfying pairs', () => {
    const world = makeWorld({ alice: 80, bob: 20, carol: 50 });

    const rule = new Rule(
      'stronger',
      [{ predicate: new ComparisonPredicate('numeric', { name: 'health', args: [X] }, '>', { name: 'health', args: [Y] }), importance: 1.0 }],
      [new StateOperation('assert', 'stronger', [X, Y])],
    );

    const fired = [];
    new ForwardChainer().run(
      [rule],
      world.createEvaluationContext(),
      new Binding(),
      (app) => { if (app.isFullySatisfied()) fired.push(app); return false; },
    );

    const name  = (v) => (v && typeof v === 'object' && 'name' in v) ? v.name : v;
    const pairs = fired.map(a => `${name(a.binding.resolve(X))}>${name(a.binding.resolve(Y))}`).sort();
    assert.deepEqual(pairs, ['alice>bob', 'alice>carol', 'carol>bob']);
  });
});
