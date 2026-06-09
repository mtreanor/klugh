import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { ExplicitNegationPredicate } from '../../src/predicates/ExplicitNegationPredicate.js';
import { Fact } from '../../src/Fact.js';

describe('ExplicitNegationPredicate', () => {
  const X = new LogicalVariable('X');
  const alice = { name: 'alice' };

  function buildContext(facts = []) {
    const store = new FactStore();
    facts.forEach(f => store.assert(f));
    const queryHandlers = new QueryHandlers();
    queryHandlers.register('factStore', new FactStoreQueryHandler(store));
    return new EvaluationContext(queryHandlers);
  }

  it('is false when the store is empty', () => {
    const ctx = buildContext([]);
    const pred = new ExplicitNegationPredicate('hasNeed', X);
    const binding = new Binding().extend(X, alice);
    assert.ok(!pred.evaluate(binding, ctx));
  });

  it('is false when only a positive fact is present', () => {
    const ctx = buildContext([new Fact('hasNeed', 'alice')]);
    const pred = new ExplicitNegationPredicate('hasNeed', X);
    const binding = new Binding().extend(X, alice);
    assert.ok(!pred.evaluate(binding, ctx));
  });

  it('is true when an explicit disbelief (-pred) is present', () => {
    const ctx = buildContext([new Fact('hasNeed', 'alice', { negated: true })]);
    const pred = new ExplicitNegationPredicate('hasNeed', X);
    const binding = new Binding().extend(X, alice);
    assert.ok(pred.evaluate(binding, ctx));
  });

  it('exposes the predicate name in its variables', () => {
    const pred = new ExplicitNegationPredicate('hasNeed', X);
    assert.deepEqual(pred.getVariables(), [X]);
  });

  it('renders with a - prefix', () => {
    const pred = new ExplicitNegationPredicate('hasNeed', X);
    assert.ok(pred.toString().startsWith('-'));
  });
});
