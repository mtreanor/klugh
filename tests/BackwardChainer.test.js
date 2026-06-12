import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BackwardChainer } from '../src/BackwardChainer.js';
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

describe('BackwardChainer', () => {
  it('returns a proof path when the goal is groundable', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('exploited', 'alice', 'bob'));

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    const paths = new BackwardChainer().run(
      'perceivedThreat', ['alice', 'bob'],
      [rule], world.createEvaluationContext(),
      selfBinding('alice')
    );

    assert.strictEqual(paths.length, 1);
    assert.strictEqual(paths[0].rule, rule);
    assert.strictEqual(paths[0].satisfactionScore, 1.0);
  });

  it('returns empty when no rule can ground the goal', () => {
    const world = makeWorld(['alice', 'bob']);
    // exploited NOT asserted

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    const paths = new BackwardChainer().run(
      'perceivedThreat', ['alice', 'bob'],
      [rule], world.createEvaluationContext(),
      selfBinding('alice')
    );

    assert.strictEqual(paths.length, 0);
  });

  it('find-first mode returns after the first proof', () => {
    const world = makeWorld(['alice', 'bob', 'carol']);
    world.factStore.assert(new Fact('exploited', 'alice', 'bob'));
    world.factStore.assert(new Fact('exploited', 'alice', 'carol'));

    const rule  = makeRule('perceivedThreat', [new FactPredicate('exploited', SELF, OTHER)]);
    const paths = new BackwardChainer().run(
      'perceivedThreat', ['alice', 'bob'],
      [rule], world.createEvaluationContext(),
      selfBinding('alice'),
      new Set(),
      { findAll: false }
    );

    assert.strictEqual(paths.length, 1);
  });

  it('does not enter infinite recursion on a cyclic rule', () => {
    const world = makeWorld(['alice']);

    const rule = makeRule('x', [
      new PrivatePredicate(SELF, new FactPredicate('x', SELF, OTHER)),
    ]);

    world.registerPrivateStore('alice');
    let threw = false;
    try {
      new BackwardChainer().run('x', ['alice', 'alice'], [rule], world.createEvaluationContext(), selfBinding('alice'));
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'cycle detection should prevent infinite recursion');
  });

  it('evaluates personal-store premises via PrivatePredicate', () => {
    const world = makeWorld(['alice', 'bob']);
    world.factStore.assert(new Fact('knows', 'alice', 'bob'));
    world.registerPrivateStore('alice');
    world.getPrivateStore('alice').assert(new Fact('perceivedThreat', 'alice', 'bob'), 0.9);

    const rule = makeRule('vigilant', [
      new PrivatePredicate(SELF, new FactPredicate('perceivedThreat', SELF, OTHER)),
      new FactPredicate('knows', SELF, OTHER),
    ]);

    const paths = new BackwardChainer().run(
      'vigilant', ['alice', 'bob'],
      [rule], world.createEvaluationContext(),
      selfBinding('alice')
    );

    assert.strictEqual(paths.length, 1);
    assert.ok(paths[0].isFullySatisfied ?? paths[0].satisfactionScore === 1.0);
  });
});
