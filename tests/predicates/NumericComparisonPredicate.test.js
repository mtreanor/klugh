import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { NumericComparisonPredicate } from '../../src/predicates/NumericComparisonPredicate.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { FactStore } from '../../src/FactStore.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';

const SELF = new LogicalVariable('SELF');
const Y    = new LogicalVariable('Y');

const schema = new PredicateSchema({
  predicates: {
    friendship: { type: 'numeric', minValue: -100, maxValue: 100, default: 0, tiers: {} },
  },
});

function buildContext(name, args, value) {
  const factStore = new FactStore();
  const queryHandlers = new QueryHandlers();
  const handler = new NumericStateQueryHandler(factStore, schema);
  queryHandlers.register('numeric', handler);
  if (value !== undefined) handler.setValue(name, args, value);
  return new EvaluationContext(queryHandlers);
}

describe('NumericComparisonPredicate', () => {
  describe('operator >', () => {
    it('is true when the value exceeds the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 50);
      const pred    = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '>', 20);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the value equals the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 20);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '>', 20);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the value is below the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], -5);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '>', 0);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('operator <', () => {
    it('is true when the value is below the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], -10);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '<', -3);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the value equals the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], -3);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '<', -3);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('operator =', () => {
    it('is true when the value exactly equals the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 42);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '=', 42);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the value differs', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 41);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '=', 42);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('operator >=', () => {
    it('is true when the value equals the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 40);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '>=', 40);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is true when the value exceeds the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 41);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '>=', 40);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('operator <=', () => {
    it('is true when the value equals the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 30);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '<=', 30);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is true when the value is below the threshold', () => {
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], 29);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '<=', 30);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('logical variable resolution', () => {
    it('resolves agent variables from the binding', () => {
      const alice = { name: 'alice' };
      const bob   = { name: 'bob' };
      const evaluationContext = buildContext('friendship', ['alice', 'bob'], -10);
      const pred  = new NumericComparisonPredicate('friendship', [SELF, Y], '<', -3);
      const binding = new Binding().extend(SELF, alice).extend(Y, bob);
      assert.ok(pred.evaluate(binding, evaluationContext));
    });

    it('uses the schema default when no value has been set', () => {
      const factStore = new FactStore();
      const queryHandlers = new QueryHandlers();
      queryHandlers.register('numeric', new NumericStateQueryHandler(factStore, schema));
      const evaluationContext = new EvaluationContext(queryHandlers);
      const pred = new NumericComparisonPredicate('friendship', ['alice', 'bob'], '=', 0);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('getVariables()', () => {
    it('returns all logical variable args', () => {
      const pred = new NumericComparisonPredicate('friendship', [SELF, Y], '<', -3);
      const vars = pred.getVariables();
      assert.equal(vars.length, 2);
      assert.equal(vars[0].name, 'SELF');
      assert.equal(vars[1].name, 'Y');
    });

    it('excludes concrete args', () => {
      const pred = new NumericComparisonPredicate('friendship', ['alice', Y], '<', -3);
      const vars = pred.getVariables();
      assert.equal(vars.length, 1);
      assert.equal(vars[0].name, 'Y');
    });
  });
});
