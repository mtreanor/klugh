import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PredicateUtilitySource } from '../../src/utility/PredicateUtilitySource.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { Binding } from '../../src/Binding.js';
import { Fact } from '../../src/Fact.js';
import { FactStore } from '../../src/FactStore.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';

const schema = new PredicateSchema({
  predicates: {
    friendship: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 0, tiers: {} },
    rapport:    { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 0, tiers: {} },
  },
});

const SELF  = new LogicalVariable('SELF');
const Y     = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };

function buildContext({ privateStores = null } = {}) {
  const factStore      = new FactStore();
  const numericHandler = new NumericStateQueryHandler(factStore, schema);
  numericHandler.setValue('friendship', ['alice', 'bob'], 75);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('numeric', numericHandler);
  return new EvaluationContext(queryHandlers, { privateStores });
}

function buildContextWithPrivateStore() {
  // Private store holds alice's subjective rapport value.
  const privateStore = new FactStore();
  privateStore.assert(Fact.withValue('rapport', ['alice', 'bob'], 90));

  // World store holds a different value to prove the private store is used.
  const worldStore   = new FactStore();
  worldStore.assert(Fact.withValue('rapport', ['alice', 'bob'], 10));
  const worldHandler = new NumericStateQueryHandler(worldStore, schema);

  const queryHandlers = new QueryHandlers();
  queryHandlers.register('numeric', worldHandler);

  const privateStores = new Map([['alice', privateStore]]);
  return new EvaluationContext(queryHandlers, { privateStores });
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

  describe('private store owner', () => {
    it('reads from the named entity private store when owner is a bound variable', () => {
      const ctx   = buildContextWithPrivateStore();
      const owner = new LogicalVariable('SELF');
      const src   = new PredicateUtilitySource('rapport', [SELF, Y], owner);
      const b     = new Binding().extend(SELF, alice).extend(Y, bob).extend(owner, alice);
      assert.equal(src.evaluate(b, new Map(), ctx), 90);
    });

    it('reads from the named entity private store when owner is a literal string', () => {
      const ctx = buildContextWithPrivateStore();
      const src = new PredicateUtilitySource('rapport', ['alice', 'bob'], 'alice');
      assert.equal(src.evaluate(new Binding(), new Map(), ctx), 90);
    });

    it('falls back to world store when the owner has no private store', () => {
      const ctx   = buildContextWithPrivateStore();
      const owner = new LogicalVariable('SELF');
      const src   = new PredicateUtilitySource('rapport', [SELF, Y], owner);
      // carol has no private store
      const b     = new Binding().extend(SELF, carol).extend(Y, bob).extend(owner, carol);
      assert.equal(src.evaluate(b, new Map(), ctx), 0); // schema default
    });

    it('falls back to world store when owner resolves to null', () => {
      const ctx   = buildContextWithPrivateStore();
      const owner = new LogicalVariable('SELF');
      const src   = new PredicateUtilitySource('rapport', ['alice', 'bob'], owner);
      // owner variable is unbound
      assert.equal(src.evaluate(new Binding(), new Map(), ctx), 10); // world value
    });

    it('scoreWithBreakdown also reads from the private store', () => {
      const ctx   = buildContextWithPrivateStore();
      const owner = new LogicalVariable('SELF');
      const src   = new PredicateUtilitySource('rapport', [SELF, Y], owner);
      const b     = new Binding().extend(SELF, alice).extend(Y, bob).extend(owner, alice);
      const result = src.scoreWithBreakdown(b, new Map(), ctx);
      assert.equal(result.value, 90);
      assert.equal(result.score, 90);
    });
  });
});
