import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../src/FactStore.js';
import { Fact } from '../src/Fact.js';
import { PredicateSchema } from '../src/PredicateSchema.js';

const schema = new PredicateSchema({
  predicates: {
    // value slot = arg 2; key = (component, paramName)
    param: { type: 'boolean', args: ['component', 'paramName', 'value'], singleValued: [2] },
    // ordinary ternary boolean — no single-valued semantics
    plain: { type: 'boolean', args: ['component', 'paramName', 'value'] },
  },
});

const pos = (...a) => new Fact('param', ...a);
const neg = (...a) => new Fact('param', ...a, { negated: true });

describe('single-valued predicates', () => {
  it('a positive assert supersedes another positive value at the same key', () => {
    const store = new FactStore({ schema });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(pos('c0', 'speed', 'slow'));

    assert.ok(store.contains('param', 'c0', 'speed', 'slow'));
    assert.ok(!store.contains('param', 'c0', 'speed', 'fast'));
    assert.equal(store.query('param', 'c0', 'speed', null).length, 1);
  });

  it('keys are independent (component and paramName)', () => {
    const store = new FactStore({ schema });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(pos('c0', 'jump', 'high'));   // different paramName
    store.assert(pos('c1', 'speed', 'fast'));  // different component
    store.assert(pos('c0', 'speed', 'slow'));  // supersedes only c0/speed

    assert.ok(store.contains('param', 'c0', 'speed', 'slow'));
    assert.ok(!store.contains('param', 'c0', 'speed', 'fast'));
    assert.ok(store.contains('param', 'c0', 'jump', 'high'));
    assert.ok(store.contains('param', 'c1', 'speed', 'fast'));
  });

  it('negatives accumulate, then a positive value sweeps them all', () => {
    const store = new FactStore({ schema });
    store.assert(neg('c0', 'speed', 'fast'));
    store.assert(neg('c0', 'speed', 'slow'));
    store.assert(neg('c0', 'speed', 'medium'));

    assert.ok(store.containsNegated('param', 'c0', 'speed', 'fast'));
    assert.ok(store.containsNegated('param', 'c0', 'speed', 'slow'));
    assert.ok(store.containsNegated('param', 'c0', 'speed', 'medium'));

    store.assert(pos('c0', 'speed', 'veryFast'));

    assert.ok(store.contains('param', 'c0', 'speed', 'veryFast'));
    assert.equal(store.query('param', 'c0', 'speed', null).length, 1);
    assert.ok(!store.containsNegated('param', 'c0', 'speed', 'fast'));
    assert.ok(!store.containsNegated('param', 'c0', 'speed', 'slow'));
    assert.ok(!store.containsNegated('param', 'c0', 'speed', 'medium'));
  });

  it('a negated assert does NOT supersede a positive value at a different value (coexist)', () => {
    const store = new FactStore({ schema });
    store.assert(pos('c0', 'speed', 'medium'));
    store.assert(neg('c0', 'speed', 'fast'));

    assert.ok(store.contains('param', 'c0', 'speed', 'medium'));     // value survives
    assert.ok(store.containsNegated('param', 'c0', 'speed', 'fast')); // redundant negative lingers
    assert.equal(store.query('param', 'c0', 'speed', null).length, 1);
  });

  it('a negated assert of the current value retracts it (direct contradiction)', () => {
    const store = new FactStore({ schema });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(neg('c0', 'speed', 'fast'));

    assert.ok(!store.contains('param', 'c0', 'speed', 'fast'));
    assert.ok(store.containsNegated('param', 'c0', 'speed', 'fast'));
  });

  it('history is preserved when a value is superseded', () => {
    const store = new FactStore({ schema });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(pos('c0', 'speed', 'slow'));

    assert.ok(store.wasEverTrue('param', 'c0', 'speed', 'fast'));
    assert.ok(!store.contains('param', 'c0', 'speed', 'fast'));
  });

  it('block policy makes the value write-once', () => {
    const store = new FactStore({ schema, contradictionPolicy: 'block' });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(pos('c0', 'speed', 'slow')); // rejected

    assert.ok(store.contains('param', 'c0', 'speed', 'fast'));
    assert.ok(!store.contains('param', 'c0', 'speed', 'slow'));
  });

  it('allow policy lets values coexist', () => {
    const store = new FactStore({ schema, contradictionPolicy: 'allow' });
    store.assert(pos('c0', 'speed', 'fast'));
    store.assert(pos('c0', 'speed', 'slow'));

    assert.ok(store.contains('param', 'c0', 'speed', 'fast'));
    assert.ok(store.contains('param', 'c0', 'speed', 'slow'));
  });

  it('non-single-valued predicates are unaffected', () => {
    const store = new FactStore({ schema });
    store.assert(new Fact('plain', 'c0', 'speed', 'fast'));
    store.assert(new Fact('plain', 'c0', 'speed', 'slow'));

    assert.ok(store.contains('plain', 'c0', 'speed', 'fast'));
    assert.ok(store.contains('plain', 'c0', 'speed', 'slow'));
  });

  it('an empty key (all args single-valued) holds a single fact globally', () => {
    const schema2 = new PredicateSchema({
      predicates: { turn: { type: 'boolean', args: ['n'], singleValued: [0] } },
    });
    const store = new FactStore({ schema: schema2 });
    store.assert(new Fact('turn', 1));
    store.assert(new Fact('turn', 2));

    assert.ok(store.contains('turn', 2));
    assert.ok(!store.contains('turn', 1));
  });
});

describe('single-valued schema validation', () => {
  const build = (def) => () => new PredicateSchema({ predicates: { p: def } });

  it('rejects an out-of-range index', () => {
    assert.throws(build({ type: 'boolean', args: ['a', 'b'], singleValued: [5] }), /out of range/);
  });
  it('rejects non-boolean predicates', () => {
    assert.throws(build({ type: 'numeric', args: ['a', 'b'], singleValued: [1] }), /only supported on boolean/);
  });
  it('rejects combining with symmetric', () => {
    assert.throws(build({ type: 'boolean', args: ['a', 'a'], singleValued: [1], symmetric: true }), /cannot be combined with symmetric/);
  });
  it('rejects a non-array value', () => {
    assert.throws(build({ type: 'boolean', args: ['a', 'b'], singleValued: 1 }), /must be an array/);
  });
});
