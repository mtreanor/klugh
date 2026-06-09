import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { Fact } from '../../src/Fact.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { applyStateChange } from '../../src/stateOperations/applyStateChange.js';
import { StateChangeQueue } from '../../src/stateOperations/StateChangeQueue.js';

const schema = new PredicateSchema({
  predicates: {
    friendship: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 50, tiers: {} },
  },
});

const SELF = new LogicalVariable('SELF');
const Y    = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };

function buildQueryHandlers(facts = []) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  queryHandlers.register('numeric', new NumericStateQueryHandler(factStore, schema));
  return queryHandlers;
}

function bindingFor(self, y) {
  return new Binding().extend(SELF, self).extend(Y, y);
}

describe('StateOperation — assert', () => {
  it('asserts the resolved fact into the fact store', () => {
    const queryHandlers = buildQueryHandlers();
    const binding   = bindingFor(alice, bob);
    const operation = new StateOperation('assert', 'exploited', [SELF, Y]);

    applyStateChange(operation, binding, queryHandlers);

    assert.ok(queryHandlers.getHandler('factStore').factStore.contains('exploited', 'alice', 'bob'));
  });

  it('describes itself with resolved args', () => {
    const operation = new StateOperation('assert', 'exploited', [SELF, Y]);
    assert.equal(operation.describe(bindingFor(alice, bob)), '+exploited(alice, bob)');
  });
});

describe('StateOperation — retract', () => {
  it('retracts the resolved fact from the fact store', () => {
    const queryHandlers        = buildQueryHandlers([new Fact('knows', 'alice', 'bob')]);
    const binding   = bindingFor(alice, bob);
    const operation = new StateOperation('retract', 'knows', [SELF, Y]);

    applyStateChange(operation, binding, queryHandlers);

    assert.ok(!queryHandlers.getHandler('factStore').factStore.contains('knows', 'alice', 'bob'));
  });
});

describe('StateOperation — set-numeric', () => {
  it('sets the numeric value for the resolved args', () => {
    const queryHandlers        = buildQueryHandlers();
    const binding   = bindingFor(alice, bob);
    const operation = new StateOperation('set-numeric', 'friendship', [SELF, Y], { value: 75 });

    applyStateChange(operation, binding, queryHandlers);

    assert.equal(queryHandlers.getHandler('numeric').getValue('friendship', ['alice', 'bob']), 75);
  });
});

describe('StateOperation — adjust-numeric', () => {
  it('increases the value by delta', () => {
    const queryHandlers = buildQueryHandlers();
    queryHandlers.getHandler('numeric').setValue('friendship', ['alice', 'bob'], 50);

    applyStateChange(
      new StateOperation('adjust-numeric', 'friendship', [SELF, Y], { delta: 10 }),
      bindingFor(alice, bob),
      queryHandlers
    );

    assert.equal(queryHandlers.getHandler('numeric').getValue('friendship', ['alice', 'bob']), 60);
  });
});

describe('StateChangeQueue', () => {
  it('sums numeric adjustments on deliberation flush', () => {
    const queryHandlers    = buildQueryHandlers();
    const queue = new StateChangeQueue();
    const op    = new StateOperation('adjust-numeric', 'friendship', [SELF, Y], { delta: 5 });

    queue.enqueue(op, bindingFor(alice, bob), queryHandlers, { flush: 'deliberation' });
    queue.enqueue(op, bindingFor(alice, bob), queryHandlers, { flush: 'deliberation' });
    queue.flush('deliberation', queryHandlers);

    assert.equal(queryHandlers.getHandler('numeric').getValue('friendship', ['alice', 'bob']), 60);
  });

  it('clears a queue without applying', () => {
    const queryHandlers    = buildQueryHandlers();
    const queue = new StateChangeQueue();
    const op    = new StateOperation('adjust-numeric', 'friendship', [SELF, Y], { delta: 5 });

    queue.enqueue(op, bindingFor(alice, bob), queryHandlers, { flush: 'tickEnd' });
    queue.clear('tickEnd');
    queue.flush('tickEnd', queryHandlers);

    assert.equal(queryHandlers.getHandler('numeric').getValue('friendship', ['alice', 'bob']), 50);
  });

  it('applies immediately without enqueueing', () => {
    const queryHandlers = buildQueryHandlers();
    const op = new StateOperation('assert', 'flagged', [SELF]);

    new StateChangeQueue().apply(op, new Binding().extend(SELF, alice), queryHandlers);
    assert.ok(queryHandlers.getHandler('factStore').factStore.contains('flagged', 'alice'));
  });
});
