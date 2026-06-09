import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { Fact } from '../../src/Fact.js';

describe('FactStoreQueryHandler', () => {
  const alice = { name: 'alice' };
  const bob   = { name: 'bob' };
  const X = new LogicalVariable('X');
  const Y = new LogicalVariable('Y');

  function setup() {
    const factStore = new FactStore();
    const handler = new FactStoreQueryHandler(factStore);
    return { factStore, handler };
  }

  it('evaluates a predicate with concrete string args', () => {
    const { factStore, handler } = setup();
    factStore.assert(new Fact('knows', 'alice', 'bob'));
    const predicate = { name: 'knows', args: ['alice', 'bob'] };
    const result = handler.evaluate(predicate, new Binding(), null);
    assert.ok(result);
  });

  it('evaluates a predicate with bound logical variables', () => {
    const { factStore, handler } = setup();
    factStore.assert(new Fact('knows', 'alice', 'bob'));
    const binding = new Binding().extend(X, alice).extend(Y, bob);
    const predicate = { name: 'knows', args: [X, Y] };
    assert.ok(handler.evaluate(predicate, binding, null));
  });

  it('returns false when no matching fact exists', () => {
    const { handler } = setup();
    const predicate = { name: 'knows', args: ['alice', 'bob'] };
    assert.ok(!handler.evaluate(predicate, new Binding(), null));
  });

  it('converts agent objects to their names when querying', () => {
    const { factStore, handler } = setup();
    factStore.assert(new Fact('likes', 'alice', 'bob'));
    const binding = new Binding().extend(X, alice);
    const predicate = { name: 'likes', args: [X, 'bob'] };
    assert.ok(handler.evaluate(predicate, binding, null));
  });
});
