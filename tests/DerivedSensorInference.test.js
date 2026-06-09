import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/World.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { QueryHandlers } from '../src/QueryHandlers.js';
import { EvaluationContext } from '../src/EvaluationContext.js';
import { SensorQueryHandler } from '../src/queryHandlers/SensorQueryHandler.js';
import { DerivedFactQueryHandler } from '../src/queryHandlers/DerivedFactQueryHandler.js';
import { RuleParser } from '../src/loader/RuleParser.js';
import { DerivationRuleLoader } from '../src/loader/DerivationRuleLoader.js';
import { Sensor } from '../src/Sensor.js';
import { DerivedFactPredicate } from '../src/predicates/DerivedFactPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { Binding } from '../src/Binding.js';
import { Fact } from '../src/Fact.js';

const schemaData = {
  predicates: {
    near:         { type: 'sensor',  args: ['agent', 'agent'] },
    knows:        { type: 'boolean', args: ['agent', 'agent'] },
    closeContact: { type: 'derived', args: ['agent', 'agent'] },
  },
};

const definitionsDSL = `
define "close contact — near and acquainted"
  near(?X, ?Y)
  ^ knows(?X, ?Y)
  => closeContact(?X, ?Y)
`;

const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };

// Sensor that returns true when the pair is in a provided set.
function sensorFrom(nearPairs) {
  return new class extends Sensor {
    evaluate([a, b]) {
      return { result: nearPairs.has(`${a}:${b}`), detail: `near(${a},${b})` };
    }
  };
}

function buildContext(nearPairs, knownPairs) {
  const schema = new PredicateSchema(schemaData);
  const world  = new World(schema);

  // Assert known-pairs into the fact store.
  for (const [a, b] of knownPairs) {
    world.factStore.assert(new Fact('knows', a, b), 0);
  }

  const sensorHandler = new SensorQueryHandler();
  sensorHandler.register('near', sensorFrom(nearPairs));
  world.queryHandlers.register('sensor', sensorHandler);

  const derivedHandler = new DerivedFactQueryHandler();
  const parser = new RuleParser(schema);
  const { definitions } = new DerivationRuleLoader(schema).load(
    parser.parseDefinitions(definitionsDSL)
  );
  derivedHandler.registerRules(definitions);
  world.queryHandlers.register('derived', derivedHandler);

  const entityRegistry = new Map([['agent', [alice, bob, carol]]]);
  return new EvaluationContext(world.queryHandlers, {
    predicateSchema: schema,
    factStore: world.factStore,
    entityRegistry,
    currentTick: 0,
  });
}

describe('Derived predicate backed by a sensor', () => {
  it('returns true when both sensor and fact predicate are satisfied', () => {
    const ctx  = buildContext(new Set(['alice:bob']), [['alice', 'bob']]);
    const pred = new DerivedFactPredicate('closeContact', alice, bob);
    assert.ok(pred.evaluate(new Binding(), ctx));
  });

  it('returns false when the sensor is false (agents not near)', () => {
    const ctx  = buildContext(new Set(), [['alice', 'bob']]);
    const pred = new DerivedFactPredicate('closeContact', alice, bob);
    assert.ok(!pred.evaluate(new Binding(), ctx));
  });

  it('returns false when the fact predicate is false (agents do not know each other)', () => {
    const ctx  = buildContext(new Set(['alice:bob']), []);
    const pred = new DerivedFactPredicate('closeContact', alice, bob);
    assert.ok(!pred.evaluate(new Binding(), ctx));
  });

  it('enumerates only pairs that satisfy both conditions', () => {
    // alice near bob, alice near carol, but alice only knows bob
    const ctx  = buildContext(new Set(['alice:bob', 'alice:carol']), [['alice', 'bob']]);
    const X    = new LogicalVariable('X');
    const Y    = new LogicalVariable('Y');
    const pred = new DerivedFactPredicate('closeContact', X, Y);
    const derivedHandler = ctx.getHandler('derived');

    const entityList = [alice, bob, carol];
    const results = [];
    for (const a of entityList) {
      for (const b of entityList) {
        if (a === b) continue;
        const binding = new Binding().extend(X, a).extend(Y, b);
        if (pred.evaluate(binding, ctx)) {
          results.push(`${a.name}:${b.name}`);
        }
      }
    }
    assert.deepEqual(results, ['alice:bob']);
  });
});
