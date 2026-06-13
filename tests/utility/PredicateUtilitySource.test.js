import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PredicateUtilitySource } from '../../src/utility/PredicateUtilitySource.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { Binding } from '../../src/Binding.js';
import { FactStore } from '../../src/FactStore.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';

const schema = new PredicateSchema({
  predicates: {
    friendship: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 0, tiers: {} },
  },
});

const SELF  = new LogicalVariable('SELF');
const Y     = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };

function buildContext() {
  const factStore      = new FactStore();
  const numericHandler = new NumericStateQueryHandler(factStore, schema);
  numericHandler.setValue('friendship', ['alice', 'bob'], 75);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('numeric', numericHandler);
  return new EvaluationContext(queryHandlers);
}

describe('PredicateUtilitySource', () => {
  it('reads the current numeric value for the resolved binding args', () => {
    const ctx = buildContext();
    const src = new PredicateUtilitySource('friendship', [SELF, Y]);
    const b   = new Binding().extend(SELF, alice).extend(Y, bob);
    assert.equal(src.evaluate(b, new Map(), ctx), 75);
  });

  it('returns the schema default when no fact has been asserted for the given pair', () => {
    const ctx = buildContext();
    const src = new PredicateUtilitySource('friendship', [SELF, Y]);
    const b   = new Binding().extend(SELF, alice).extend(Y, carol);
    assert.equal(src.evaluate(b, new Map(), ctx), 0);
  });

  it('returns 0 when no numeric handler is registered', () => {
    const queryHandlers = new QueryHandlers();
    const ctx = new EvaluationContext(queryHandlers);
    const src = new PredicateUtilitySource('friendship', [SELF, Y]);
    const b   = new Binding().extend(SELF, alice).extend(Y, bob);
    assert.equal(src.evaluate(b, new Map(), ctx), 0);
  });

  it('accepts ground (non-variable) string args', () => {
    const ctx = buildContext();
    const src = new PredicateUtilitySource('friendship', ['alice', 'bob']);
    assert.equal(src.evaluate(new Binding(), new Map(), ctx), 75);
  });
});
