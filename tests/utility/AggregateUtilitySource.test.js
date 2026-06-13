import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AggregateUtilitySource } from '../../src/utility/AggregateUtilitySource.js';
import { ConstantUtilitySource } from '../../src/utility/ConstantUtilitySource.js';
import { Binding } from '../../src/Binding.js';

function constants(...values) {
  return values.map(v => new ConstantUtilitySource(v));
}

function evaluate(aggregator, ...values) {
  return new AggregateUtilitySource(aggregator, constants(...values))
    .evaluate(new Binding(), new Map(), null);
}

describe('AggregateUtilitySource', () => {
  describe('sum', () => {
    it('returns the total of all sources', () => {
      assert.equal(evaluate('sum', 3, 4, 5), 12);
    });

    it('returns 0 for no sources', () => {
      assert.equal(new AggregateUtilitySource('sum', []).evaluate(new Binding(), new Map(), null), 0);
    });
  });

  describe('avg', () => {
    it('returns the mean of all sources', () => {
      assert.equal(evaluate('avg', 10, 20, 30), 20);
    });

    it('returns 0 for no sources', () => {
      assert.equal(new AggregateUtilitySource('avg', []).evaluate(new Binding(), new Map(), null), 0);
    });
  });

  describe('min', () => {
    it('returns the smallest value', () => {
      assert.equal(evaluate('min', 5, 2, 8), 2);
    });

    it('returns 0 for no sources', () => {
      assert.equal(new AggregateUtilitySource('min', []).evaluate(new Binding(), new Map(), null), 0);
    });
  });

  describe('max', () => {
    it('returns the largest value', () => {
      assert.equal(evaluate('max', 5, 2, 8), 8);
    });

    it('returns 0 for no sources', () => {
      assert.equal(new AggregateUtilitySource('max', []).evaluate(new Binding(), new Map(), null), 0);
    });
  });

  it('throws on an unknown aggregator', () => {
    assert.throws(
      () => new AggregateUtilitySource('product', constants(2, 3)).evaluate(new Binding(), new Map(), null),
      /Unknown aggregator/
    );
  });

  it('nests aggregate sources', () => {
    const inner = new AggregateUtilitySource('sum', constants(3, 7));   // 10
    const outer = new AggregateUtilitySource('max', [inner, new ConstantUtilitySource(5)]);
    assert.equal(outer.evaluate(new Binding(), new Map(), null), 10);
  });
});
