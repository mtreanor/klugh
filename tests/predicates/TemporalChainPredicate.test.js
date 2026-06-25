import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { TemporalChainPredicate } from '../../src/predicates/TemporalChainPredicate.js';
import { Fact } from '../../src/Fact.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');

function buildContext(assertionsByTick) {
  const factStore = new FactStore();
  for (const [tick, fact] of assertionsByTick) factStore.assertAt(fact, tick);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers);
}

describe('TemporalChainPredicate', () => {
  describe('two-step chain (no window)', () => {
    it('is true when A was asserted before B', () => {
      const evaluationContext = buildContext([
        [1, new Fact('knows',       'alice', 'bob')],
        [5, new Fact('hadConflict', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: null },
      ]);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when A was asserted after B', () => {
      const evaluationContext = buildContext([
        [5, new Fact('knows',       'alice', 'bob')],
        [1, new Fact('hadConflict', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: null },
      ]);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when only the first step is asserted', () => {
      const evaluationContext = buildContext([
        [1, new Fact('knows', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: null },
      ]);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('two-step chain with within constraint', () => {
    it('is true when B was asserted within the gap', () => {
      // A at tick 2, B at tick 5 — gap is 3, within is 5
      const evaluationContext = buildContext([
        [2, new Fact('knows',       'alice', 'bob')],
        [5, new Fact('hadConflict', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: 5 },
      ]);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when B was asserted after the gap expires', () => {
      // A at tick 2, B at tick 10 — gap is 8, within is 5
      const evaluationContext = buildContext([
        [2, new Fact('knows',       'alice', 'bob')],
        [10, new Fact('hadConflict', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: 5 },
      ]);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });

    it('counts the gap from the immediately preceding assertion, not any arbitrary one', () => {
      // Two assertions of A: tick 1 and tick 8. B at tick 10. within=5.
      // A@1 → gap to B@10 is 9 (fails). A@8 → gap to B@10 is 2 (passes).
      const evaluationContext = buildContext([
        [1,  new Fact('knows',       'alice', 'bob')],
        [8,  new Fact('knows',       'alice', 'bob')],
        [10, new Fact('hadConflict', 'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: 5 },
      ]);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });
  });

  describe('three-step chain', () => {
    it('is true when all steps are in order within their gaps', () => {
      const evaluationContext = buildContext([
        [1, new Fact('knows',       'alice', 'bob')],
        [3, new Fact('hadConflict', 'alice', 'bob')],
        [5, new Fact('madeUp',      'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: 5 },
        { name: 'madeUp',      args: ['alice', 'bob'], within: 5 },
      ]);
      assert.ok(pred.evaluate(new Binding(), evaluationContext));
    });

    it('is false when the third step exceeds its gap', () => {
      const evaluationContext = buildContext([
        [1,  new Fact('knows',       'alice', 'bob')],
        [3,  new Fact('hadConflict', 'alice', 'bob')],
        [20, new Fact('madeUp',      'alice', 'bob')],
      ]);
      const pred = new TemporalChainPredicate([
        { name: 'knows',       args: ['alice', 'bob'] },
        { name: 'hadConflict', args: ['alice', 'bob'], within: 5 },
        { name: 'madeUp',      args: ['alice', 'bob'], within: 5 },
      ]);
      assert.ok(!pred.evaluate(new Binding(), evaluationContext));
    });
  });

  it('resolves logical variables from the binding', () => {
    const evaluationContext = buildContext([
      [1, new Fact('knows',       'alice', 'bob')],
      [5, new Fact('hadConflict', 'alice', 'bob')],
    ]);
    const pred = new TemporalChainPredicate([
      { name: 'knows',       args: [X, Y] },
      { name: 'hadConflict', args: [X, Y], within: null },
    ]);
    const binding = new Binding().extend(X, { name: 'alice' }).extend(Y, { name: 'bob' });
    assert.ok(pred.evaluate(binding, evaluationContext));
  });

  describe('bounded first step (history window on step 0)', () => {
    function buildContextAtTick(assertionsByTick, currentTick) {
      const factStore = new FactStore();
      for (const [tick, fact] of assertionsByTick) factStore.assertAt(fact, tick);
      const queryHandlers = new QueryHandlers();
      queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
      return new EvaluationContext(queryHandlers, { tickTracker: { currentTick } });
    }

    it('matches when the first step is within the window', () => {
      const ctx = buildContextAtTick([
        [12, new Fact('challenged', 'alice', 'bob')],
        [14, new Fact('madeUp',     'alice', 'bob')],
      ], 15);
      const pred = new TemporalChainPredicate([
        { name: 'challenged', args: ['alice', 'bob'], within: 5 },
        { name: 'madeUp',     args: ['alice', 'bob'], within: null },
      ]);
      assert.ok(pred.evaluate(new Binding(), ctx));
    });

    it('fails when the first step is outside the window', () => {
      const ctx = buildContextAtTick([
        [5,  new Fact('challenged', 'alice', 'bob')],
        [14, new Fact('madeUp',     'alice', 'bob')],
      ], 15);
      const pred = new TemporalChainPredicate([
        { name: 'challenged', args: ['alice', 'bob'], within: 5 },
        { name: 'madeUp',     args: ['alice', 'bob'], within: null },
      ]);
      assert.ok(!pred.evaluate(new Binding(), ctx));
    });

    it('combines a bounded first step with a bounded second step', () => {
      const ctx = buildContextAtTick([
        [12, new Fact('challenged', 'alice', 'bob')],
        [14, new Fact('madeUp',     'alice', 'bob')],
      ], 15);
      const pred = new TemporalChainPredicate([
        { name: 'challenged', args: ['alice', 'bob'], within: 5 },
        { name: 'madeUp',     args: ['alice', 'bob'], within: 3 },
      ]);
      assert.ok(pred.evaluate(new Binding(), ctx));
    });

    it('fails when the second step exceeds its gap even if first is in window', () => {
      const ctx = buildContextAtTick([
        [12, new Fact('challenged', 'alice', 'bob')],
        [20, new Fact('madeUp',     'alice', 'bob')],
      ], 22);
      const pred = new TemporalChainPredicate([
        { name: 'challenged', args: ['alice', 'bob'], within: 15 },
        { name: 'madeUp',     args: ['alice', 'bob'], within: 3 },
      ]);
      assert.ok(!pred.evaluate(new Binding(), ctx));
    });
  });

  it('exposes all unique logical variables across all steps', () => {
    const pred = new TemporalChainPredicate([
      { name: 'knows',       args: [X, Y] },
      { name: 'hadConflict', args: [X, Y], within: null },
    ]);
    assert.deepEqual(pred.getVariables(), [X, Y]);
  });
});
