import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { ComparisonPredicate } from '../../src/predicates/ComparisonPredicate.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { SensorQueryHandler } from '../../src/queryHandlers/SensorQueryHandler.js';
import { DerivedFactQueryHandler } from '../../src/queryHandlers/DerivedFactQueryHandler.js';
import { FactStore } from '../../src/FactStore.js';
import { Fact } from '../../src/Fact.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';

const schema = new PredicateSchema({
  predicates: {
    health:   { type: 'numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    stamina:  { type: 'numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    distance: { type: 'sensor-numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    trusts:   { type: 'boolean', args: ['agent', 'agent'] },
    nearby:   { type: 'sensor', args: ['agent', 'agent'] },
    paired:   { type: 'derived', args: ['agent', 'agent'] },
  },
});

function buildContext({ numeric = {}, sensor = {}, boolSensors = {}, derived = {}, facts = [] } = {}) {
  const factStore     = new FactStore();
  const queryHandlers = new QueryHandlers();

  const numericHandler = new NumericStateQueryHandler(factStore, schema);
  queryHandlers.register('numeric', numericHandler);
  for (const [key, value] of Object.entries(numeric)) {
    const [name, ...args] = key.split('|');
    numericHandler.setValue(name, args, value);
  }

  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore, schema));

  const sensorHandler = new SensorQueryHandler();
  for (const [key, value] of Object.entries(sensor)) {
    sensorHandler.registerNumeric(key, { getValue: () => ({ value }) });
  }
  // Boolean sensors keyed by "name|arg|arg" → boolean result.
  for (const [name, truthByKey] of Object.entries(boolSensors)) {
    sensorHandler.register(name, { evaluate: (args) => ({ result: !!truthByKey[args.join('|')] }) });
  }
  queryHandlers.register('sensor', sensorHandler);

  const derivedHandler = new DerivedFactQueryHandler();
  for (const [name, truthByKey] of Object.entries(derived)) {
    derivedHandler.define(name, (args) => !!truthByKey[args.join('|')]);
  }
  queryHandlers.register('derived', derivedHandler);

  for (const fact of facts) factStore.assert(fact);

  return new EvaluationContext(queryHandlers, { predicateSchema: schema });
}

const num = (name, args) => ({ name, args });

describe('ComparisonPredicate', () => {
  describe('numeric vs numeric', () => {
    it('is true when the left value exceeds the right', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 50, 'stamina|alice': 20 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '>', num('stamina', ['alice']));
      assert.ok(pred.evaluate(new Binding(), ctx));
    });

    it('is false when the left value is below the right', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 10, 'stamina|alice': 20 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '>', num('stamina', ['alice']));
      assert.ok(!pred.evaluate(new Binding(), ctx));
    });

    it('compares across different argument tuples', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 30, 'health|bob': 70 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '<', num('health', ['bob']));
      assert.ok(pred.evaluate(new Binding(), ctx));
    });

    it('supports != between two values', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 30, 'stamina|alice': 30 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '!=', num('stamina', ['alice']));
      assert.ok(!pred.evaluate(new Binding(), ctx));
    });

    it('falls back to the schema default for an unset value', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 5 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '>', num('stamina', ['alice']));
      assert.ok(pred.evaluate(new Binding(), ctx)); // 5 > 0 (default)
    });

    it('resolves a sensor-numeric operand', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 40 }, sensor: { distance: 25 } });
      const pred = new ComparisonPredicate('numeric', num('health', ['alice']), '>', num('distance', ['alice', 'bob']));
      assert.ok(pred.evaluate(new Binding(), ctx)); // 40 > 25
    });

    it('resolves logical variables on both sides', () => {
      const ctx  = buildContext({ numeric: { 'health|alice': 80, 'health|bob': 20 } });
      const X    = new LogicalVariable('X');
      const Y    = new LogicalVariable('Y');
      const pred = new ComparisonPredicate('numeric', num('health', [X]), '>', num('health', [Y]));
      const binding = new Binding().extend(X, 'alice').extend(Y, 'bob');
      assert.ok(pred.evaluate(binding, ctx));
    });
  });

  describe('boolean vs boolean (three-valued state equality)', () => {
    const both = (a, b) => new ComparisonPredicate('boolean', num('trusts', ['alice', 'bob']), '=', num('trusts', ['carol', 'dave']));

    it('true = true is satisfied with =', () => {
      const ctx  = buildContext({ facts: [new Fact('trusts', 'alice', 'bob'), new Fact('trusts', 'carol', 'dave')] });
      assert.ok(both().evaluate(new Binding(), ctx));
    });

    it('unknown = unknown is satisfied with = (state equality)', () => {
      const ctx = buildContext();
      assert.ok(both().evaluate(new Binding(), ctx));
    });

    it('false = false is satisfied with =', () => {
      const ctx = buildContext({ facts: [
        new Fact('trusts', 'alice', 'bob', { negated: true }),
        new Fact('trusts', 'carol', 'dave', { negated: true }),
      ] });
      assert.ok(both().evaluate(new Binding(), ctx));
    });

    it('true = unknown is not satisfied', () => {
      const ctx  = buildContext({ facts: [new Fact('trusts', 'alice', 'bob')] });
      assert.ok(!both().evaluate(new Binding(), ctx));
    });

    it('true = false is not satisfied', () => {
      const ctx = buildContext({ facts: [
        new Fact('trusts', 'alice', 'bob'),
        new Fact('trusts', 'carol', 'dave', { negated: true }),
      ] });
      assert.ok(!both().evaluate(new Binding(), ctx));
    });

    it('!= is satisfied when states differ', () => {
      const ctx  = buildContext({ facts: [new Fact('trusts', 'alice', 'bob')] });
      const pred = new ComparisonPredicate('boolean', num('trusts', ['alice', 'bob']), '!=', num('trusts', ['carol', 'dave']));
      assert.ok(pred.evaluate(new Binding(), ctx)); // true != unknown
    });

    it('!= is not satisfied when states match', () => {
      const ctx  = buildContext({ facts: [new Fact('trusts', 'alice', 'bob'), new Fact('trusts', 'carol', 'dave')] });
      const pred = new ComparisonPredicate('boolean', num('trusts', ['alice', 'bob']), '!=', num('trusts', ['carol', 'dave']));
      assert.ok(!pred.evaluate(new Binding(), ctx)); // true != true → false
    });
  });

  describe('boolean operands from derived and sensor predicates', () => {
    it('compares a derived operand (true) against a stored boolean (true)', () => {
      const ctx = buildContext({
        derived: { paired: { 'alice|bob': true } },
        facts: [new Fact('trusts', 'alice', 'bob')],
      });
      const pred = new ComparisonPredicate('boolean', num('paired', ['alice', 'bob']), '=', num('trusts', ['alice', 'bob']));
      assert.ok(pred.evaluate(new Binding(), ctx)); // true = true
    });

    it('derived false reads as false, not unknown', () => {
      const ctx  = buildContext({ derived: { paired: {} } }); // paired(alice,bob) → false
      const pred = new ComparisonPredicate('boolean', num('paired', ['alice', 'bob']), '=', num('trusts', ['alice', 'bob']));
      // paired = false, trusts = unknown → not equal
      assert.ok(!pred.evaluate(new Binding(), ctx));
      const negated = new ComparisonPredicate('boolean', num('paired', ['alice', 'bob']), '!=', num('trusts', ['alice', 'bob']));
      assert.ok(negated.evaluate(new Binding(), ctx)); // false != unknown
    });

    it('compares a boolean sensor operand', () => {
      const ctx  = buildContext({
        boolSensors: { nearby: { 'alice|bob': true } },
        facts: [new Fact('trusts', 'alice', 'bob')],
      });
      const pred = new ComparisonPredicate('boolean', num('nearby', ['alice', 'bob']), '=', num('trusts', ['alice', 'bob']));
      assert.ok(pred.evaluate(new Binding(), ctx)); // true = true
    });
  });

  describe('getVariables()', () => {
    it('collects logical variables from both operands', () => {
      const X = new LogicalVariable('X');
      const Y = new LogicalVariable('Y');
      const pred = new ComparisonPredicate('numeric', num('health', [X, 'bob']), '>', num('stamina', [Y]));
      const names = pred.getVariables().map(v => v.name).sort();
      assert.deepEqual(names, ['X', 'Y']);
    });
  });
});
