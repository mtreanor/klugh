import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { SensorQueryHandler } from '../../src/queryHandlers/SensorQueryHandler.js';
import { SensorPredicate } from '../../src/predicates/SensorPredicate.js';
import { SensorProvenance } from '../../src/provenance/SensorProvenance.js';
import { Sensor } from '../../src/Sensor.js';
import { RuleEvaluator } from '../../src/RuleEvaluator.js';
import { Rule } from '../../src/Rule.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };

const mockEffect = new StateOperation('adjust-numeric', 'test-tag', [], { delta: 1.0 });

// Builds a Sensor instance from a plain function for test convenience.
function sensorFrom(fn) {
  return new class extends Sensor {
    evaluate(args, ctx) { return fn(args, ctx); }
  };
}

function buildContext(sensors = {}) {
  const handler = new SensorQueryHandler();
  for (const [name, fn] of Object.entries(sensors)) {
    handler.register(name, sensorFrom(fn));
  }
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('sensor', handler);
  return new EvaluationContext(queryHandlers);
}

describe('SensorPredicate', () => {
  describe('evaluate', () => {
    it('returns true when the sensor returns { result: true }', () => {
      const ctx = buildContext({
        near: ([a, b]) => ({ result: a !== b, detail: `${a} near ${b}` }),
      });
      const pred    = new SensorPredicate('near', [X, Y]);
      const binding = new Binding().extend(X, alice).extend(Y, bob);
      assert.ok(pred.evaluate(binding, ctx));
    });

    it('returns false when the sensor returns { result: false }', () => {
      const ctx = buildContext({
        near: () => ({ result: false, detail: 'too far' }),
      });
      const pred    = new SensorPredicate('near', [X, Y]);
      const binding = new Binding().extend(X, alice).extend(Y, bob);
      assert.ok(!pred.evaluate(binding, ctx));
    });

    it('resolves entity object args to their name strings before passing to the sensor', () => {
      let capturedArgs;
      const ctx = buildContext({
        near: (args) => { capturedArgs = args; return { result: true, detail: '' }; },
      });
      const pred    = new SensorPredicate('near', [X, Y]);
      const binding = new Binding().extend(X, alice).extend(Y, bob);
      pred.evaluate(binding, ctx);
      assert.deepEqual(capturedArgs, ['alice', 'bob']);
    });

    it('throws when no sensor is registered for the predicate name', () => {
      const ctx = buildContext({});
      const pred    = new SensorPredicate('near', [X, Y]);
      const binding = new Binding().extend(X, alice).extend(Y, bob);
      assert.throws(() => pred.evaluate(binding, ctx), /No sensor registered for "near"/);
    });
  });

  describe('explain', () => {
    it('returns a SensorProvenance snapshot after evaluate', () => {
      const ctx = buildContext({
        near: ([a, b]) => ({ result: true, detail: `distance(${a},${b})=2` }),
      });
      const pred    = new SensorPredicate('near', [X, Y]);
      const binding = new Binding().extend(X, alice).extend(Y, bob);
      pred.evaluate(binding, ctx);
      const prov = pred.explain();
      assert.ok(prov instanceof SensorProvenance);
      assert.equal(prov.type, 'sensor');
      assert.equal(prov.sensorName, 'near');
      assert.deepEqual(prov.resolvedArgs, ['alice', 'bob']);
      assert.equal(prov.result, true);
      assert.equal(prov.detail, 'distance(alice,bob)=2');
    });

    it('returns null when called before evaluate', () => {
      const pred = new SensorPredicate('near', [X, Y]);
      assert.equal(pred.explain(), null);
    });
  });

  describe('getVariables', () => {
    it('returns all logical variable args', () => {
      const pred = new SensorPredicate('near', [X, Y]);
      assert.deepEqual(pred.getVariables().map(v => v.name), ['X', 'Y']);
    });

    it('does not include concrete string args as variables', () => {
      const pred = new SensorPredicate('near', [X, 'alice']);
      assert.equal(pred.getVariables().length, 1);
      assert.equal(pred.getVariables()[0].name, 'X');
    });
  });

  describe('binding generation via RuleEvaluator', () => {
    it('generates bindings for all pairs where the sensor is true', () => {
      const ctx = buildContext({
        near: ([a, b]) => ({ result: a !== b, detail: '' }),
      });
      const rule      = new Rule('R', [new SensorPredicate('near', [X, Y])], [mockEffect]);
      const evaluator = new RuleEvaluator();
      const registry  = new Map([['agent', [alice, bob, carol]]]);
      const results   = evaluator.evaluate([rule], registry, ctx);

      assert.ok(results.has(rule));
      // All ordered pairs where a !== b
      assert.equal(results.get(rule).length, 6);
    });

    it('snapshots sensor provenance into predicateResults at evaluation time', () => {
      const ctx = buildContext({
        near: ([a, b]) => ({ result: a === 'alice' && b === 'bob', detail: `dist(${a},${b})=1` }),
      });
      const rule      = new Rule('R', [new SensorPredicate('near', [X, Y])], [mockEffect]);
      const evaluator = new RuleEvaluator();
      const registry  = new Map([['agent', [alice, bob]]]);
      const results   = evaluator.evaluate([rule], registry, ctx);

      const app  = results.get(rule)[0];
      const prov = app.predicateResults[0].provenance;
      assert.ok(prov instanceof SensorProvenance);
      assert.equal(prov.sensorName, 'near');
      assert.deepEqual(prov.resolvedArgs, ['alice', 'bob']);
      assert.equal(prov.result, true);
      assert.equal(prov.detail, 'dist(alice,bob)=1');
    });
  });
});
