import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyStateChange } from '../../src/stateOperations/applyStateChange.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { World } from '../../src/World.js';
import { Binding } from '../../src/Binding.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';

const schema = new PredicateSchema({
  predicates: {
    suspects: { type: 'boolean', args: ['agent', 'agent'] },
    trust:    { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 50, tiers: {} },
  },
});

function buildWorld() {
  const world = new World();
  world.queryHandlers.register('factStore', new FactStoreQueryHandler(world.factStore));
  world.queryHandlers.register('numeric', new NumericStateQueryHandler(world.factStore, schema));
  return world;
}

// Guards the "every mechanism that produces state also produces the record"
// invariant: strength supplied to an operation must reach the stored record.
describe('applyStateChange — strength reaches the record', () => {
  it('carries strength onto an asserted boolean fact', () => {
    const world = buildWorld();
    const op = new StateOperation('assert', 'suspects', ['alice', 'bob'], { strength: 0.6 });
    applyStateChange(op, new Binding(), world.queryHandlers, {});
    assert.equal(world.factStore.getStrength('suspects', ['alice', 'bob']), 0.6);
  });

  it('carries strength onto a set-numeric fact', () => {
    const world = buildWorld();
    const op = new StateOperation('set-numeric', 'trust', ['alice', 'bob'], { value: 70, strength: 0.8 });
    applyStateChange(op, new Binding(), world.queryHandlers, {});
    assert.equal(world.queryHandlers.getHandler('numeric').getValue('trust', ['alice', 'bob']), 70);
    assert.equal(world.factStore.getStrength('trust', ['alice', 'bob']), 0.8);
  });
});
