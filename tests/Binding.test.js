import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';

describe('Binding', () => {
  const X = new LogicalVariable('X');
  const Y = new LogicalVariable('Y');
  const alice = { name: 'alice' };
  const bob   = { name: 'bob' };

  it('resolves a bound variable to its value', () => {
    const binding = new Binding().extend(X, alice);
    assert.equal(binding.resolve(X), alice);
  });

  it('resolves a concrete term to itself', () => {
    const binding = new Binding();
    assert.equal(binding.resolve('companionship'), 'companionship');
  });

  it('returns undefined for an unbound variable', () => {
    const binding = new Binding();
    assert.equal(binding.resolve(X), undefined);
  });

  it('extending a binding does not mutate the original', () => {
    const original = new Binding().extend(X, alice);
    const extended = original.extend(Y, bob);
    assert.equal(original.resolve(Y), undefined);
    assert.equal(extended.resolve(Y), bob);
  });

  it('reports whether a variable is bound', () => {
    const binding = new Binding().extend(X, alice);
    assert.ok(binding.isBound(X));
    assert.ok(!binding.isBound(Y));
  });
});
