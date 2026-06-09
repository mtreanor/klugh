import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { SensorQueryHandler } from '../../src/queryHandlers/SensorQueryHandler.js';
import { SensorNumericTierPredicate } from '../../src/predicates/SensorNumericTierPredicate.js';
import { SensorNumericComparisonPredicate } from '../../src/predicates/SensorNumericComparisonPredicate.js';
import { SensorProvenance } from '../../src/provenance/SensorProvenance.js';
import { NumericSensor } from '../../src/NumericSensor.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { RuleEvaluator } from '../../src/RuleEvaluator.js';
import { Rule } from '../../src/Rule.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };

const mockEffect = new StateOperation('adjust-numeric', 'test-tag', [], { delta: 1.0 });

const schemaData = {
  predicates: {
    distance: {
      type: 'sensor-numeric',
      args: ['agent', 'agent'],
      minValue: 0, maxValue: 999, default: 0,
      tiers: { near: [0, 4], far: [4, 999] },
    },
  },
};

// Builds a NumericSensor from a plain function for test convenience.
function numericSensorFrom(fn) {
  return new class extends NumericSensor {
    getValue(args, ctx) { return fn(args, ctx); }
  };
}

function buildContext(numericSensors = {}) {
  const handler = new SensorQueryHandler();
  for (const [name, fn] of Object.entries(numericSensors)) {
    handler.registerNumeric(name, numericSensorFrom(fn));
  }
  const schema = new PredicateSchema(schemaData);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('sensor', handler);
  return new EvaluationContext(queryHandlers, { predicateSchema: schema });
}

describe('SensorNumericTierPredicate', () => {
  it('returns true when the sensor value falls in the named tier', () => {
    const ctx     = buildContext({ distance: ([a, b]) => ({ value: 2, detail: `${a}↔${b}=2` }) });
    const pred    = new SensorNumericTierPredicate('distance', [X, Y], 'near');
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('returns false when the sensor value is outside the named tier', () => {
    const ctx     = buildContext({ distance: () => ({ value: 8, detail: 'far apart' }) });
    const pred    = new SensorNumericTierPredicate('distance', [X, Y], 'near');
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(!pred.evaluate(binding, ctx));
  });

  it('snapshots value and result into SensorProvenance after evaluate', () => {
    const ctx     = buildContext({ distance: () => ({ value: 2, detail: 'dist=2' }) });
    const pred    = new SensorNumericTierPredicate('distance', [X, Y], 'near');
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    pred.evaluate(binding, ctx);
    const prov = pred.explain();
    assert.ok(prov instanceof SensorProvenance);
    assert.equal(prov.sensorName, 'distance');
    assert.equal(prov.value, 2);
    assert.equal(prov.result, true);
    assert.equal(prov.detail, 'dist=2');
    assert.deepEqual(prov.resolvedArgs, ['alice', 'bob']);
  });

  it('returns null from explain when called before evaluate', () => {
    const pred = new SensorNumericTierPredicate('distance', [X, Y], 'near');
    assert.equal(pred.explain(), null);
  });

  it('throws when no numeric sensor is registered for the name', () => {
    const ctx     = buildContext({});
    const pred    = new SensorNumericTierPredicate('distance', [X, Y], 'near');
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.throws(() => pred.evaluate(binding, ctx), /No numeric sensor registered for "distance"/);
  });
});

describe('SensorNumericComparisonPredicate', () => {
  it('evaluates >= correctly', () => {
    const ctx     = buildContext({ distance: () => ({ value: 5, detail: '' }) });
    const pred    = new SensorNumericComparisonPredicate('distance', [X, Y], '>=', 3);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('evaluates < correctly', () => {
    const ctx     = buildContext({ distance: () => ({ value: 2, detail: '' }) });
    const pred    = new SensorNumericComparisonPredicate('distance', [X, Y], '<', 4);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('returns false when the comparison fails', () => {
    const ctx     = buildContext({ distance: () => ({ value: 10, detail: '' }) });
    const pred    = new SensorNumericComparisonPredicate('distance', [X, Y], '<', 4);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(!pred.evaluate(binding, ctx));
  });

  it('snapshots value and result into SensorProvenance after evaluate', () => {
    const ctx     = buildContext({ distance: () => ({ value: 10, detail: 'dist=10' }) });
    const pred    = new SensorNumericComparisonPredicate('distance', [X, Y], '<', 4);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    pred.evaluate(binding, ctx);
    const prov = pred.explain();
    assert.ok(prov instanceof SensorProvenance);
    assert.equal(prov.value, 10);
    assert.equal(prov.result, false);
    assert.equal(prov.detail, 'dist=10');
  });

  it('generates bindings for pairs satisfying the comparison', () => {
    const distances = {
      'alice:bob': 2, 'bob:alice': 2,
      'alice:carol': 8, 'carol:alice': 8,
      'bob:carol': 8, 'carol:bob': 8,
    };
    const ctx = buildContext({
      distance: ([a, b]) => ({ value: distances[`${a}:${b}`] ?? 0, detail: '' }),
    });
    const carol = { name: 'carol' };
    const pred      = new SensorNumericComparisonPredicate('distance', [X, Y], '<', 5);
    const rule      = new Rule('R', [pred], [mockEffect]);
    const evaluator = new RuleEvaluator();
    const registry  = new Map([['agent', [alice, bob, carol]]]);
    const results   = evaluator.evaluate([rule], registry, ctx);
    assert.ok(results.has(rule));
    assert.equal(results.get(rule).length, 2); // alice↔bob and bob↔alice
  });
});

describe('NumericSensor base class', () => {
  it('throws when getValue is not implemented', () => {
    const sensor = new NumericSensor();
    assert.throws(() => sensor.getValue([], null), /must implement getValue/);
  });
});
