import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldStateLoader } from '../../src/loader/StateLoader.js';
import { World } from '../../src/World.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';

const schema = new PredicateSchema({
  predicates: {
    knows:      { type: 'boolean', args: ['agent', 'agent'] },
    friendship: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 50, tiers: {} },
  },
});

function buildWorld() {
  const world = new World();
  world.queryHandlers.register('numeric', new NumericStateQueryHandler(world.factStore, schema));
  return world;
}

const loader = new WorldStateLoader();

describe('WorldStateLoader', () => {
  it('asserts a fact into the world for type "assert"', () => {
    const world = buildWorld();
    loader.load([{ type: 'assert', name: 'knows', args: ['alice', 'bob'] }], world);
    assert.ok(world.factStore.contains('knows', 'alice', 'bob'));
  });

  it('asserts a fact at a specific tick for a timed assert', () => {
    const world = buildWorld();
    loader.load([{ type: 'assert', name: 'knows', args: ['alice', 'bob'], tick: 0 }], world);
    const ticks = world.factStore.getAssertionTicks('knows', ['alice', 'bob']);
    assert.deepEqual(ticks, [0]);
  });

  it('asserts a numeric fact into the fact store for type "set-numeric"', () => {
    const world = buildWorld();
    loader.load([{ type: 'set-numeric', name: 'friendship', args: ['alice', 'bob'], value: 85 }], world);
    const handler = world.queryHandlers.getHandler('numeric');
    assert.equal(handler.getValue('friendship', ['alice', 'bob']), 85);
  });

  it('processes a mixed list of assertions in order', () => {
    const world = buildWorld();
    loader.load([
      { type: 'assert',      name: 'knows',      args: ['alice', 'bob'] },
      { type: 'set-numeric', name: 'friendship', args: ['alice', 'bob'], value: 75 },
    ], world);
    assert.ok(world.factStore.contains('knows', 'alice', 'bob'));
    const handler = world.queryHandlers.getHandler('numeric');
    assert.equal(handler.getValue('friendship', ['alice', 'bob']), 75);
  });
});
