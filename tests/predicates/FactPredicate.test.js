import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { Fact } from '../../src/Fact.js';

function buildEvaluationContext(facts = []) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers);
}

describe('FactPredicate', () => {
  const X = new LogicalVariable('X');
  const Y = new LogicalVariable('Y');
  const alice = { name: 'alice' };
  const bob   = { name: 'bob' };

  it('evaluates to true when the fact exists', () => {
    const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
    const predicate = new FactPredicate('knows', X, Y);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(predicate.evaluate(binding, evaluationContext));
  });

  it('evaluates to false when the fact does not exist', () => {
    const evaluationContext = buildEvaluationContext([]);
    const predicate = new FactPredicate('knows', X, Y);
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    assert.ok(!predicate.evaluate(binding, evaluationContext));
  });

  it('exposes its logical variables', () => {
    const predicate = new FactPredicate('knows', X, Y);
    const vars = predicate.getVariables();
    assert.equal(vars.length, 2);
    assert.equal(vars[0].name, 'X');
    assert.equal(vars[1].name, 'Y');
  });

  it('does not include concrete args as variables', () => {
    const predicate = new FactPredicate('hasNeed', X, 'companionship');
    const vars = predicate.getVariables();
    assert.equal(vars.length, 1);
    assert.equal(vars[0].name, 'X');
  });
});
