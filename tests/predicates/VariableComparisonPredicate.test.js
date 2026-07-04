import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VariableComparisonPredicate } from '../../src/predicates/VariableComparisonPredicate.js';
import { Binding } from '../../src/Binding.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';

const D = new LogicalVariable('D');
const E = new LogicalVariable('E');

function evalWith(left, op, right, assignments) {
  let b = new Binding();
  for (const [v, val] of assignments) b = b.extend(v, val);
  return new VariableComparisonPredicate(left, op, right).evaluate(b, null);
}

describe('VariableComparisonPredicate', () => {
  it('compares a numeric variable against a literal', () => {
    assert.equal(evalWith(D, '<=', 2, [[D, 1]]), true);
    assert.equal(evalWith(D, '<=', 2, [[D, 2]]), true);
    assert.equal(evalWith(D, '<=', 2, [[D, 3]]), false);
    assert.equal(evalWith(D, '>', 2, [[D, 3]]), true);
    assert.equal(evalWith(D, '=', 2, [[D, 2]]), true);
  });

  it('compares two bound variables by value / identity', () => {
    const alice = { name: 'alice' }, bob = { name: 'bob' };
    assert.equal(evalWith(D, '!=', E, [[D, alice], [E, bob]]), true);
    assert.equal(evalWith(D, '!=', E, [[D, alice], [E, alice]]), false);
    assert.equal(evalWith(D, '=',  E, [[D, alice], [E, alice]]), true);
  });

  it('is false when either operand is unbound', () => {
    assert.equal(evalWith(D, '<=', 2, []), false);          // D unbound
    assert.equal(evalWith(D, '=', E, [[D, 1]]), false);     // E unbound
  });

  it('ordering operators are false for non-numeric operands', () => {
    assert.equal(evalWith(D, '<', 2, [[D, { name: 'alice' }]]), false);
  });

  it('reports both operands as required-bound and binds nothing', () => {
    const p = new VariableComparisonPredicate(D, '!=', E);
    assert.deepEqual(p.getRequiredBoundVariables().map(v => v.name), ['D', 'E']);
    assert.deepEqual(p.getBindingVariables(), []);
  });
});
