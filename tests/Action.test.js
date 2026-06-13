import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Action } from '../src/Action.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { Binding } from '../src/Binding.js';
import { FactStore } from '../src/FactStore.js';
import { FactStoreQueryHandler } from '../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../src/QueryHandlers.js';
import { EvaluationContext } from '../src/EvaluationContext.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { StateChangeQueue } from '../src/stateOperations/StateChangeQueue.js';
import { ConstantUtilitySource } from '../src/utility/ConstantUtilitySource.js';
import { Fact } from '../src/Fact.js';

const SELF  = new LogicalVariable('SELF');
const Y     = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };

function buildContext(facts = []) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return { factStore, queryHandlers, ctx: new EvaluationContext(queryHandlers) };
}

function binding() {
  return new Binding().extend(SELF, alice).extend(Y, bob);
}

describe('Action', () => {
  describe('collectVariables()', () => {
    it('collects variables from preconditions', () => {
      const action = new Action('greet', {
        preconditions: [{ predicate: new FactPredicate('knows', SELF, Y) }],
        effects: [],
      });
      const vars = action.collectVariables();
      assert.ok(vars.some(v => v.name === 'SELF'));
      assert.ok(vars.some(v => v.name === 'Y'));
    });

    it('collects variables from effects', () => {
      const action = new Action('flag', {
        preconditions: [],
        effects: [new StateOperation('assert', 'flagged', [SELF])],
      });
      assert.ok(action.collectVariables().some(v => v.name === 'SELF'));
    });

    it('deduplicates variables appearing in both preconditions and effects', () => {
      const action = new Action('greet', {
        preconditions: [{ predicate: new FactPredicate('knows', SELF, Y) }],
        effects: [new StateOperation('assert', 'met', [SELF, Y])],
      });
      const vars = action.collectVariables();
      assert.equal(vars.filter(v => v.name === 'SELF').length, 1);
      assert.equal(vars.filter(v => v.name === 'Y').length, 1);
    });

    it('returns empty array when there are no variables', () => {
      const action = new Action('noop', { preconditions: [], effects: [] });
      assert.deepEqual(action.collectVariables(), []);
    });
  });

  describe('arePreconditionsMet()', () => {
    it('returns true when all preconditions hold', () => {
      const action = new Action('approach', {
        preconditions: [{ predicate: new FactPredicate('knows', SELF, Y) }],
      });
      const { ctx } = buildContext([new Fact('knows', 'alice', 'bob')]);
      assert.ok(action.arePreconditionsMet(binding(), ctx));
    });

    it('returns false when any precondition fails', () => {
      const action = new Action('approach', {
        preconditions: [{ predicate: new FactPredicate('knows', SELF, Y) }],
      });
      const { ctx } = buildContext([]);
      assert.ok(!action.arePreconditionsMet(binding(), ctx));
    });

    it('returns false when the first precondition holds but a later one fails', () => {
      const action = new Action('bond', {
        preconditions: [
          { predicate: new FactPredicate('knows', SELF, Y) },
          { predicate: new FactPredicate('trusts', SELF, Y) },
        ],
      });
      const { ctx } = buildContext([new Fact('knows', 'alice', 'bob')]);
      assert.ok(!action.arePreconditionsMet(binding(), ctx));
    });

    it('returns true when there are no preconditions', () => {
      const action = new Action('rest', { preconditions: [] });
      const { ctx } = buildContext();
      assert.ok(action.arePreconditionsMet(new Binding(), ctx));
    });
  });

  describe('score()', () => {
    it('returns 0 when there are no utility sources', () => {
      const action = new Action('noop', { utilitySources: [] });
      const { ctx } = buildContext();
      assert.equal(action.score(new Binding(), new Map(), ctx), 0);
    });

    it('sums the values of all utility sources', () => {
      const action = new Action('multi', {
        utilitySources: [
          new ConstantUtilitySource(3),
          new ConstantUtilitySource(7),
        ],
      });
      const { ctx } = buildContext();
      assert.equal(action.score(new Binding(), new Map(), ctx), 10);
    });

    it('works with a single utility source', () => {
      const action = new Action('simple', {
        utilitySources: [new ConstantUtilitySource(5)],
      });
      const { ctx } = buildContext();
      assert.equal(action.score(new Binding(), new Map(), ctx), 5);
    });
  });

  describe('execute()', () => {
    it('applies effects immediately when no queue is provided', () => {
      const { factStore, queryHandlers } = buildContext();
      const action = new Action('flag', {
        effects: [new StateOperation('assert', 'flagged', [SELF])],
      });
      action.execute(binding(), queryHandlers);
      assert.ok(factStore.contains('flagged', 'alice'));
    });

    it('applies multiple effects immediately', () => {
      const { factStore, queryHandlers } = buildContext();
      const action = new Action('bond', {
        effects: [
          new StateOperation('assert', 'knows', [SELF, Y]),
          new StateOperation('assert', 'trusts', [SELF, Y]),
        ],
      });
      action.execute(binding(), queryHandlers);
      assert.ok(factStore.contains('knows', 'alice', 'bob'));
      assert.ok(factStore.contains('trusts', 'alice', 'bob'));
    });

    it('enqueues effects at tickEnd when a queue is provided', () => {
      const { factStore, queryHandlers } = buildContext();
      const action = new Action('flag', {
        effects: [new StateOperation('assert', 'flagged', [SELF])],
      });
      const queue = new StateChangeQueue();
      action.execute(binding(), queryHandlers, queue);

      assert.ok(!factStore.contains('flagged', 'alice'), 'effect must not apply before flush');

      queue.flush('tickEnd', queryHandlers);
      assert.ok(factStore.contains('flagged', 'alice'), 'effect must apply after flush');
    });
  });

  describe('toString()', () => {
    it('returns the action name', () => {
      assert.equal(new Action('greet').toString(), 'greet');
    });
  });
});
