import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProductUtilitySource } from '../../src/utility/ProductUtilitySource.js';
import { ConstantUtilitySource } from '../../src/utility/ConstantUtilitySource.js';
import { Binding } from '../../src/Binding.js';

function constant(v) { return new ConstantUtilitySource(v); }
const b   = new Binding();
const reg = new Map();

describe('ProductUtilitySource', () => {
  it('multiplies two constants', () => {
    const src = new ProductUtilitySource(constant(4), constant(0.5));
    assert.equal(src.evaluate(b, reg, null), 2);
  });

  it('returns zero when either factor is zero', () => {
    assert.equal(new ProductUtilitySource(constant(10), constant(0)).evaluate(b, reg, null), 0);
    assert.equal(new ProductUtilitySource(constant(0), constant(10)).evaluate(b, reg, null), 0);
  });

  it('works with negative factors', () => {
    assert.equal(new ProductUtilitySource(constant(3), constant(-2)).evaluate(b, reg, null), -6);
  });

  it('scoreWithBreakdown records both sides and the product score', () => {
    const src    = new ProductUtilitySource(constant(4), constant(0.5));
    const result = src.scoreWithBreakdown(b, reg, null);
    assert.equal(result.type,        'product');
    assert.equal(result.score,       2);
    assert.equal(result.left.score,  4);
    assert.equal(result.right.score, 0.5);
  });

  it('nests correctly (left-associative chaining)', () => {
    const src = new ProductUtilitySource(
      new ProductUtilitySource(constant(10), constant(0.5)),
      constant(2)
    );
    assert.equal(src.evaluate(b, reg, null), 10);
  });
});
