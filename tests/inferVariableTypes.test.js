import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferVariableTypes } from '../src/inferVariableTypes.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../src/predicates/NegationPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { PredicateSchema } from '../src/PredicateSchema.js';

const schema = new PredicateSchema({
  predicates: {
    knows:      { type: 'boolean', args: ['agent', 'agent'] },
    hasNeed:    { type: 'boolean', args: ['agent', 'string'] },
    friendship: { type: 'numeric', args: ['agent', 'agent'], minValue: 0, maxValue: 100, default: 0, tiers: {} },
  },
});

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');
const N = new LogicalVariable('N');

function entries(...predicates) {
  return predicates.map(p => ({ predicate: p }));
}

describe('inferVariableTypes', () => {
  it('returns an empty map when no schema is provided', () => {
    const types = inferVariableTypes(entries(new FactPredicate('knows', X, Y)), null);
    assert.equal(types.size, 0);
  });

  it('maps variables to their schema arg types', () => {
    const types = inferVariableTypes(entries(new FactPredicate('knows', X, Y)), schema);
    assert.equal(types.get('X'), 'agent');
    assert.equal(types.get('Y'), 'agent');
  });

  it('infers string type for string-typed arg positions', () => {
    const types = inferVariableTypes(entries(new FactPredicate('hasNeed', X, N)), schema);
    assert.equal(types.get('X'), 'agent');
    assert.equal(types.get('N'), 'string');
  });

  it('first occurrence wins — later predicates do not overwrite the type', () => {
    // X appears as arg[0] of knows (agent); if it appeared again later the type must not change
    const types = inferVariableTypes(
      entries(
        new FactPredicate('knows', X, Y),
        new FactPredicate('friendship', Y, X),
      ),
      schema
    );
    assert.equal(types.get('X'), 'agent');
    assert.equal(types.get('Y'), 'agent');
  });

  it('collects types across multiple predicate entries', () => {
    const types = inferVariableTypes(
      entries(
        new FactPredicate('knows', X, Y),
        new FactPredicate('hasNeed', X, N),
      ),
      schema
    );
    assert.equal(types.get('X'), 'agent');
    assert.equal(types.get('Y'), 'agent');
    assert.equal(types.get('N'), 'string');
  });

  it('ignores predicates not in the schema', () => {
    const types = inferVariableTypes(entries(new FactPredicate('unknownPred', X, Y)), schema);
    assert.equal(types.size, 0);
  });

  it('skips NegationPredicate entries — they have no name to look up', () => {
    const neg = new NegationPredicate(new FactPredicate('knows', X, Y));
    const types = inferVariableTypes(entries(neg), schema);
    assert.equal(types.size, 0);
  });

  it('returns an empty map for an empty predicate entry list', () => {
    const types = inferVariableTypes([], schema);
    assert.equal(types.size, 0);
  });
});
