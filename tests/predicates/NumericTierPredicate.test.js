import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NumericTierPredicate } from '../../src/predicates/NumericTierPredicate.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

describe('NumericTierPredicate', () => {
  const X = new LogicalVariable('X');
  const Y = new LogicalVariable('Y');

  it('exposes its logical variables', () => {
    const predicate = new NumericTierPredicate('friendship', [X, Y], 'strong');
    const vars = predicate.getVariables();
    assert.equal(vars.length, 2);
    assert.equal(vars[0].name, 'X');
    assert.equal(vars[1].name, 'Y');
  });

  it('does not include concrete args as variables', () => {
    const predicate = new NumericTierPredicate('friendship', [X, 'carol'], 'warm');
    const vars = predicate.getVariables();
    assert.equal(vars.length, 1);
    assert.equal(vars[0].name, 'X');
  });

  it('produces a readable toString', () => {
    const predicate = new NumericTierPredicate('friendship', [X, Y], 'strong');
    assert.equal(predicate.toString(), 'friendship(?X, ?Y) is strong');
  });
});
