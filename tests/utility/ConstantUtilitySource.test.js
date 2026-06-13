import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConstantUtilitySource } from '../../src/utility/ConstantUtilitySource.js';
import { Binding } from '../../src/Binding.js';

describe('ConstantUtilitySource', () => {
  it('returns its value regardless of binding, registry, or context', () => {
    const src = new ConstantUtilitySource(42);
    assert.equal(src.evaluate(new Binding(), new Map(), null), 42);
  });

  it('works with fractional values', () => {
    assert.equal(new ConstantUtilitySource(1.5).evaluate(new Binding(), new Map(), null), 1.5);
  });

  it('works with zero', () => {
    assert.equal(new ConstantUtilitySource(0).evaluate(new Binding(), new Map(), null), 0);
  });

  it('works with negative values', () => {
    assert.equal(new ConstantUtilitySource(-3).evaluate(new Binding(), new Map(), null), -3);
  });
});
