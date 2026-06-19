import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/Engine.js';
import { Fact } from '../src/Fact.js';

const bindings = (rs) => rs.map(b => {
  const m = b.assignments instanceof Map ? b.assignments : new Map(Object.entries(b.assignments ?? {}));
  return Object.fromEntries([...m].map(([k, v]) => [k?.name ?? k, v?.name ?? v]));
});

describe('Engine — inline config (no files)', () => {
  it('builds from inline predicates + entities, with state omitted', () => {
    const engine = new Engine({
      predicates: { predicates: { knows: { type: 'boolean', args: ['agent', 'agent'] } } },
      entities:   { agent: { alice: {}, bob: {} } },
      // no state, no definitions — assert facts directly
    });
    engine.world.assert(new Fact('knows', 'alice', 'bob'));

    const r = engine.query('knows(alice, ?y)');
    assert.deepEqual(bindings(r), [{ y: 'bob' }]);
  });

  it('supports entities minted at runtime via world.addEntity', () => {
    const engine = new Engine({
      predicates: { predicates: { likes: { type: 'boolean', args: ['thing', 'thing'] } } },
      entities:   { thing: {} }, // declared type, no members — minted below
    });
    engine.world.addEntity('thing', { name: 'cat' });
    engine.world.addEntity('thing', { name: 'fish' });
    engine.world.assert(new Fact('likes', 'cat', 'fish'));

    // a fully-variable query enumerates the live registry
    assert.deepEqual(bindings(engine.query('likes(?x, ?y)')), [{ x: 'cat', y: 'fish' }]);
  });

  it('loads inline numeric predicates and supports set/compare', () => {
    const engine = new Engine({
      predicates: { predicates: { mood: { type: 'numeric', args: ['agent'], minValue: 0, maxValue: 100, default: 50 } } },
      entities:   { agent: { alice: {} } },
    });
    engine.world.assert(Fact.withValue('mood', ['alice'], 80));
    assert.equal(bindings(engine.query('mood(alice) > 70')).length, 1);
    assert.equal(bindings(engine.query('mood(alice) > 90')).length, 0);
  });
});
