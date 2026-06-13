import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleUtilitySource } from '../../src/utility/RuleUtilitySource.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { Binding } from '../../src/Binding.js';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Fact } from '../../src/Fact.js';

const schema = new PredicateSchema({
  predicates: {
    knows: { type: 'boolean', args: ['agent', 'agent'] },
  },
});

const SELF  = new LogicalVariable('SELF');
const Y     = new LogicalVariable('Y');
const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };

const knowsEntry = { predicate: new FactPredicate('knows', SELF, Y), importance: 1 };

function buildContext(facts = []) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers, { predicateSchema: schema });
}

describe('RuleUtilitySource', () => {
  it('returns weight × count of satisfying bindings', () => {
    const src = new RuleUtilitySource('knows count', [knowsEntry], 2);
    const ctx = buildContext([
      new Fact('knows', 'alice', 'bob'),
      new Fact('knows', 'alice', 'carol'),
    ]);
    const registry = new Map([['agent', [alice, bob, carol]]]);
    const b = new Binding().extend(SELF, alice);
    // 2 satisfying bindings (?Y = bob, ?Y = carol), weight 2 → 4
    assert.equal(src.evaluate(b, registry, ctx), 4);
  });

  it('returns 0 when no bindings satisfy the predicates', () => {
    const src = new RuleUtilitySource('knows count', [knowsEntry], 5);
    const ctx = buildContext([]);
    const registry = new Map([['agent', [alice, bob]]]);
    const b = new Binding().extend(SELF, alice);
    assert.equal(src.evaluate(b, registry, ctx), 0);
  });

  it('treats already-bound free variables as fixed', () => {
    const src = new RuleUtilitySource('knows pair', [knowsEntry], 3);
    const ctx = buildContext([new Fact('knows', 'alice', 'bob')]);
    const registry = new Map([['agent', [alice, bob, carol]]]);
    // ?Y pre-bound to bob — checks only that exact pair
    const b = new Binding().extend(SELF, alice).extend(Y, bob);
    assert.equal(src.evaluate(b, registry, ctx), 3);
  });

  it('returns 0 when a pre-bound pair does not satisfy the predicates', () => {
    const src = new RuleUtilitySource('knows pair', [knowsEntry], 3);
    const ctx = buildContext([]);
    const registry = new Map([['agent', [alice, bob]]]);
    const b = new Binding().extend(SELF, alice).extend(Y, bob);
    assert.equal(src.evaluate(b, registry, ctx), 0);
  });

  it('counts each additional satisfying binding at weight', () => {
    const src = new RuleUtilitySource('knows count', [knowsEntry], 1);
    const ctx = buildContext([
      new Fact('knows', 'alice', 'bob'),
      new Fact('knows', 'alice', 'carol'),
      new Fact('knows', 'alice', 'alice'), // won't fire — distinct constraint
    ]);
    const registry = new Map([['agent', [alice, bob, carol]]]);
    const b = new Binding().extend(SELF, alice);
    assert.equal(src.evaluate(b, registry, ctx), 2);
  });
});
