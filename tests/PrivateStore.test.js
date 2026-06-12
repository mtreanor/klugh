import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Interpreter } from '../src/Interpreter.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { EntityNameValidator } from '../src/EntityNameValidator.js';
import { PredicateSchema } from '../src/PredicateSchema.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../data/demo');

describe('Private stores in logic', () => {
  it('loads private state from the state file', () => {
    const interp = new Interpreter(dataDir);
    assert.ok(interp.world.getPrivateStore('alice').contains('perceivedThreat', 'carol', 'alice'));
    assert.equal(
      interp.world.getPrivateStore('alice').getStrength('perceivedThreat', ['carol', 'alice']),
      1.0
    );
  });

  it('answers ground queries against a private store', () => {
    const interp = new Interpreter(dataDir);
    assert.equal(interp.query('alice.friendship.strong(bob, alice)').length, 1);
    assert.deepEqual(interp.query('alice.friendship.strong(carol, alice)'), []);
  });

  it('answers variable private-store queries', () => {
    const interp = new Interpreter(dataDir);
    const result = interp.query('?X.friendship.strong(bob, ?X)', { X: 'alice' });
    assert.equal(result.length, 1);
  });

  it('returns false when the owner variable is unbound', () => {
    const interp = new Interpreter(dataDir);
    assert.deepEqual(interp.query('?OWNER.perceivedThreat(carol, alice)'), []);
  });

  it('returns false when the owner has no private store', () => {
    const interp = new Interpreter(dataDir);
    assert.deepEqual(interp.query('karate.friendship.strong(bob, karate)'), []);
  });

  it('keeps world and private friendship values separate', () => {
    const interp = new Interpreter(dataDir);
    assert.equal(interp.query('friendship.cold(alice, ?Y)').length, 1);
    assert.equal(interp.query('alice.friendship.strong(bob, alice)').length, 1);
  });

  it('rejects predicate names that collide with entity names', () => {
    const schema = new PredicateSchema({
      predicates: { alice: { type: 'boolean', args: ['agent'] } },
    });
    assert.throws(
      () => EntityNameValidator.validate({ agent: { alice: {} } }, schema),
      /conflicts with entity name "alice"/
    );
  });
});
