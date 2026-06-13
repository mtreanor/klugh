import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForwardChainer } from '../src/ForwardChainer.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { StateOperationLoader } from '../src/loader/StateOperationLoader.js';
import { NumericStateQueryHandler } from '../src/queryHandlers/NumericStateQueryHandler.js';
import { Rule } from '../src/Rule.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { PrivatePredicate } from '../src/predicates/PrivatePredicate.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { World } from '../src/World.js';
import { Fact } from '../src/Fact.js';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';

const SELF  = new LogicalVariable('SELF');
const OTHER = new LogicalVariable('OTHER');

function makeWorld(agentNames) {
  const world = new World();
  world.entityRegistry.set('agent', agentNames.map(n => ({ name: n })));
  return world;
}

function makeRule(conclusionName, premisePredicates) {
  return new Rule(
    conclusionName,
    premisePredicates,
    [new StateOperation('assert', conclusionName, [SELF, OTHER])]
  );
}

function selfBinding(agentName) {
  return new Binding().extend(SELF, agentName);
}

describe('ForwardChainer', () => {
  it('calls onApplication for each satisfied rule application', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('exploited', 'alice', 'bob'));

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    const fired = [];

    new ForwardChainer().run(
      [rule],
      world.createEvaluationContext(),
      selfBinding('alice'),
      (app) => { fired.push(app); return false; }
    );

    assert.strictEqual(fired.length, 1);
    assert.ok(fired[0].isFullySatisfied());
  });

  it('continues looping while onApplication returns true', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('exploited', 'alice', 'bob'));

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    let calls   = 0;

    new ForwardChainer().run(
      [rule],
      world.createEvaluationContext(),
      selfBinding('alice'),
      () => { calls++; return calls < 3; }
    );

    assert.ok(calls >= 3);
  });

  it('stops when onApplication always returns false', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('exploited', 'alice', 'bob'));

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    let passes  = 0;
    let appCalls = 0;

    new ForwardChainer().run(
      [rule],
      world.createEvaluationContext(),
      selfBinding('alice'),
      () => { appCalls++; return false; }
    );

    // Should fire exactly once — first pass fires the rule, second pass fires it again,
    // callback returns false both times, so loop exits after one pass.
    assert.strictEqual(appCalls, 1);
  });

  describe('fixpoint convergence with numeric effects', () => {
    const schema = new PredicateSchema({
      predicates: {
        knows:   { type: 'boolean', args: ['agent', 'agent'] },
        tension: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 0 },
      },
    });

    function makeNumericWorld() {
      const world = new World(schema);
      world.entityRegistry.set('agent', [{ name: 'alice' }, { name: 'bob' }]);
      world.queryHandlers.register('numeric', new NumericStateQueryHandler(world.factStore, schema));
      world.factStore.assert(new Fact('knows', 'alice', 'bob'));
      return world;
    }

    const adjustRule = new Rule(
      'tension builds',
      [new FactPredicate('knows', SELF, OTHER)],
      [new StateOperationLoader(schema).buildStateOperation(
        { type: 'adjust-numeric', name: 'tension', args: ['?SELF', '?OTHER'], delta: 10 }
      )]
    );

    it('apply() terminates once clamping absorbs further adjustments', () => {
      const world = makeNumericWorld();
      world.apply([adjustRule]);
      assert.equal(
        world.queryHandlers.getHandler('numeric').getValue('tension', ['alice', 'bob']),
        100
      );
    });

    it('applyOnce() applies a single pass of numeric adjustments', () => {
      const world = makeNumericWorld();
      world.applyOnce([adjustRule]);
      assert.equal(
        world.queryHandlers.getHandler('numeric').getValue('tension', ['alice', 'bob']),
        10
      );
    });
  });

  it('exposes PrivatePredicate premises via evaluationContext privateStores', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('knows', 'alice', 'bob'));
    world.registerPrivateStore('alice');
    world.getPrivateStore('alice').assert(new Fact('perceivedThreat', 'alice', 'bob'), 0.8);

    const rule = makeRule('vigilant', [
      new PrivatePredicate(SELF, new FactPredicate('perceivedThreat', SELF, OTHER)),
      new FactPredicate('knows', SELF, OTHER),
    ]);

    const fired = [];
    new ForwardChainer().run(
      [rule],
      world.createEvaluationContext(),
      selfBinding('alice'),
      (app) => { fired.push(app); return false; }
    );

    assert.strictEqual(fired.length, 1);
    assert.ok(fired[0].isFullySatisfied());
  });
});
