import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { Binding } from '../../src/Binding.js';
import { Fact } from '../../src/Fact.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { CountPredicate } from '../../src/predicates/CountPredicate.js';

const SELF     = new LogicalVariable('SELF');
const countVar = new LogicalVariable('__count_0__');

function buildContext(facts, agents) {
  const factStore = new FactStore();
  for (const fact of facts) factStore.assert(fact);
  const entityRegistry = new Map([['agent', agents]]);
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers, { entityRegistry });
}

// Inner predicate: knows(?SELF, __count_0__) — counts how many agents SELF knows
function makePredicate(operator, threshold) {
  const inner = new FactPredicate('knows', SELF, countVar);
  return new CountPredicate(inner, [countVar], new Map(), operator, threshold);
}

const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };
const dave  = { name: 'dave' };

describe('CountPredicate', () => {
  describe('operator >', () => {
    it('is true when the count exceeds the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol'), new Fact('knows', 'alice', 'dave')],
        [alice, bob, carol, dave],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(makePredicate('>', 2).evaluate(binding, evaluationContext));
    });

    it('is false when the count equals the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol')],
        [alice, bob, carol],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(!makePredicate('>', 2).evaluate(binding, evaluationContext));
    });

    it('is false when the count is below the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob')],
        [alice, bob, carol],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(!makePredicate('>', 2).evaluate(binding, evaluationContext));
    });
  });

  describe('operator <', () => {
    it('is true when the count is below the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob')],
        [alice, bob, carol, dave],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(makePredicate('<', 3).evaluate(binding, evaluationContext));
    });

    it('is false when the count meets the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol'), new Fact('knows', 'alice', 'dave')],
        [alice, bob, carol, dave],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(!makePredicate('<', 3).evaluate(binding, evaluationContext));
    });
  });

  describe('operator =', () => {
    it('is true when the count exactly equals the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol')],
        [alice, bob, carol, dave],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(makePredicate('=', 2).evaluate(binding, evaluationContext));
    });

    it('is false when the count differs from the threshold', () => {
      const evaluationContext = buildContext(
        [new Fact('knows', 'alice', 'bob')],
        [alice, bob, carol],
      );
      const binding = new Binding().extend(SELF, alice);
      assert.ok(!makePredicate('=', 2).evaluate(binding, evaluationContext));
    });
  });

  describe('getVariables()', () => {
    it('returns outer-scope variables but not counting variables', () => {
      const inner = new FactPredicate('knows', SELF, countVar);
      const pred  = new CountPredicate(inner, [countVar], new Map(), '>', 2);
      const vars  = pred.getVariables();
      assert.equal(vars.length, 1);
      assert.equal(vars[0].name, 'SELF');
    });

    it('returns empty when no outer-scope variables are present', () => {
      const inner = new FactPredicate('knows', countVar, new LogicalVariable('__count_1__'));
      const pred  = new CountPredicate(
        inner,
        [countVar, new LogicalVariable('__count_1__')],
        new Map(),
        '>',
        2,
      );
      assert.equal(pred.getVariables().length, 0);
    });
  });

  describe('non-agent entity types', () => {
    it('counts over a non-agent type when countingVarTypes specifies it', () => {
      const factStore = new FactStore();
      factStore.assert(new Fact('hasKnowledge', 'alice', 'karate'));
      factStore.assert(new Fact('hasKnowledge', 'alice', 'philosophy'));

      const karate     = { name: 'karate' };
      const philosophy = { name: 'philosophy' };
      const cooking    = { name: 'cooking' };

      const entityRegistry = new Map([
        ['agent',     [alice]],
        ['knowledge', [karate, philosophy, cooking]],
      ]);
      const queryHandlers = new QueryHandlers();
      queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
      const evaluationContext = new EvaluationContext(queryHandlers, { entityRegistry });

      const knowledgeVar = new LogicalVariable('__count_0__');
      const inner = new FactPredicate('hasKnowledge', SELF, knowledgeVar);
      const pred  = new CountPredicate(
        inner,
        [knowledgeVar],
        new Map([['__count_0__', 'knowledge']]),
        '=',
        2,
      );

      const binding = new Binding().extend(SELF, alice);
      assert.ok(pred.evaluate(binding, evaluationContext));
    });
  });
});
