import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { WeakNegationPredicate } from '../../src/predicates/WeakNegationPredicate.js';
import { Fact } from '../../src/Fact.js';

describe('WeakNegationPredicate (~)', () => {
  const X = new LogicalVariable('X');
  const alice = { name: 'alice' };

  function buildContext(store) {
    const queryHandlers = new QueryHandlers();
    queryHandlers.register('factStore', new FactStoreQueryHandler(store));
    return new EvaluationContext(queryHandlers);
  }

  it('is true when the positive fact is absent', () => {
    const store = new FactStore();
    const ctx   = buildContext(store);
    const pred  = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    const binding = new Binding().extend(X, alice);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('is false when only a positive fact is present', () => {
    const store = new FactStore();
    store.assert(new Fact('hasNeed', 'alice'));
    const ctx   = buildContext(store);
    const pred  = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    const binding = new Binding().extend(X, alice);
    assert.ok(!pred.evaluate(binding, ctx));
  });

  it('is true when an explicit disbelief is present (even if positive is absent)', () => {
    const store = new FactStore({ contradictionPolicy: 'allow' });
    store.assert(new Fact('hasNeed', 'alice', { negated: true }));
    const ctx   = buildContext(store);
    const pred  = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    const binding = new Binding().extend(X, alice);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('is true when both positive and explicit disbelief coexist (allow policy)', () => {
    const store = new FactStore({ contradictionPolicy: 'allow' });
    store.assert(new Fact('hasNeed', 'alice'));
    store.assert(new Fact('hasNeed', 'alice', { negated: true }));
    const ctx   = buildContext(store);
    const pred  = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    const binding = new Binding().extend(X, alice);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('exposes inner predicate variables', () => {
    const pred = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    assert.deepEqual(pred.getVariables(), [X]);
  });

  it('renders with a ~ prefix', () => {
    const pred = new WeakNegationPredicate(new FactPredicate('hasNeed', X));
    assert.ok(pred.toString().startsWith('~'));
  });
});
