import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../../src/predicates/NegationPredicate.js';
import { Fact } from '../../src/Fact.js';

describe('NegationPredicate', () => {
  const X = new LogicalVariable('X');
  const alice = { name: 'alice' };

  function buildEvaluationContext(facts = []) {
    const factStore = new FactStore();
    facts.forEach(f => factStore.assert(f));
    const queryHandlers = new QueryHandlers();
    queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
    return new EvaluationContext(queryHandlers);
  }

  it('is true when the wrapped predicate is false', () => {
    const evaluationContext = buildEvaluationContext([]);
    const predicate = new NegationPredicate(new FactPredicate('hasNeed', X, null));
    const binding = new Binding().extend(X, alice);
    assert.ok(predicate.evaluate(binding, evaluationContext));
  });

  it('is false when the wrapped predicate is true', () => {
    const evaluationContext = buildEvaluationContext([new Fact('hasNeed', 'alice', 'companionship')]);
    const predicate = new NegationPredicate(new FactPredicate('hasNeed', X, null));
    const binding = new Binding().extend(X, alice);
    assert.ok(!predicate.evaluate(binding, evaluationContext));
  });

  it('contributes no variables to the binding search', () => {
    const predicate = new NegationPredicate(new FactPredicate('hasNeed', X, null));
    assert.deepEqual(predicate.getVariables(), []);
  });
});
