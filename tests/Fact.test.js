import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Fact } from '../src/Fact.js';

describe('Fact', () => {
  it('stores name and args', () => {
    const fact = new Fact('knows', 'alice', 'bob');
    assert.equal(fact.name, 'knows');
    assert.deepEqual(fact.args, ['alice', 'bob']);
  });

  it('renders as a readable string', () => {
    const fact = new Fact('hasNeed', 'alice', 'companionship');
    assert.equal(fact.toString(), 'hasNeed(alice, companionship)');
  });

  it('handles facts with a single arg', () => {
    const fact = new Fact('hungry', 'alice');
    assert.equal(fact.toString(), 'hungry(alice)');
  });

  it('defaults negated to false', () => {
    const fact = new Fact('knows', 'alice', 'bob');
    assert.strictEqual(fact.negated, false);
    assert.deepEqual(fact.args, ['alice', 'bob']);
  });

  it('accepts { negated: true } as a trailing options object', () => {
    const fact = new Fact('knows', 'alice', 'bob', { negated: true });
    assert.strictEqual(fact.negated, true);
    assert.deepEqual(fact.args, ['alice', 'bob']);
  });

  it('renders a negated fact with a - prefix', () => {
    const fact = new Fact('knows', 'alice', 'bob', { negated: true });
    assert.equal(fact.toString(), '-knows(alice, bob)');
  });

  it('does not treat a non-options object as a negation flag', () => {
    const fact = new Fact('knows', 'alice', 'bob');
    assert.strictEqual(fact.negated, false);
    assert.deepEqual(fact.args, ['alice', 'bob']);
  });
});
