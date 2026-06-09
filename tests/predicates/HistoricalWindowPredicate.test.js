import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { HistoricalWindowPredicate } from '../../src/predicates/HistoricalWindowPredicate.js';
import { Fact } from '../../src/Fact.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');

function buildContext(assertionsByTick, currentTick = 10) {
  const factStore = new FactStore();
  for (const [tick, fact] of assertionsByTick) factStore.assertAt(fact, tick);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers, { tickTracker: { currentTick } });
}

describe('HistoricalWindowPredicate', () => {
  describe('window = null (ever)', () => {
    it('is true when the fact was asserted at any past tick', () => {
      const evaluationContext = buildContext([[1, new Fact('knows', 'alice', 'bob')]]);
      const pred = new HistoricalWindowPredicate('knows', ['alice', 'bob'], null);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the fact was never asserted', () => {
      const evaluationContext = buildContext([]);
      const pred = new HistoricalWindowPredicate('knows', ['alice', 'bob'], null);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('window = N (recent ticks)', () => {
    it('is true when the fact was asserted within the window', () => {
      // currentTick=10, window=5 → since=5; assertedAt=7 >= 5
      const evaluationContext = buildContext([[7, new Fact('knows', 'alice', 'bob')]]);
      const pred = new HistoricalWindowPredicate('knows', ['alice', 'bob'], 5);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the fact was asserted before the window', () => {
      // currentTick=10, window=5 → since=5; assertedAt=2 < 5
      const evaluationContext = buildContext([[2, new Fact('knows', 'alice', 'bob')]]);
      const pred = new HistoricalWindowPredicate('knows', ['alice', 'bob'], 5);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });

    it('includes the boundary tick (assertedAt == currentTick - window)', () => {
      // currentTick=10, window=5 → since=5; assertedAt=5 >= 5
      const evaluationContext = buildContext([[5, new Fact('knows', 'alice', 'bob')]]);
      const pred = new HistoricalWindowPredicate('knows', ['alice', 'bob'], 5);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });
  });

  it('resolves logical variables from the binding', () => {
    const evaluationContext = buildContext([[3, new Fact('knows', 'alice', 'bob')]]);
    const pred    = new HistoricalWindowPredicate('knows', [X, Y], null);
    const binding = new Binding().extend(X, { name: 'alice' }).extend(Y, { name: 'bob' });
    assert.ok(pred.evaluate(binding, evaluationContext));
  });

  it('exposes its logical variables', () => {
    const pred = new HistoricalWindowPredicate('knows', [X, Y], null);
    assert.deepEqual(pred.getVariables(), [X, Y]);
  });

  it('does not include concrete args as variables', () => {
    const pred = new HistoricalWindowPredicate('knows', ['alice', Y], null);
    assert.deepEqual(pred.getVariables(), [Y]);
  });
});
