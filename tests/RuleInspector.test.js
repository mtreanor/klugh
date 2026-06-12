import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../src/FactStore.js';
import { FactStoreQueryHandler } from '../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../src/QueryHandlers.js';
import { EvaluationContext } from '../src/EvaluationContext.js';
import { RuleInspector } from '../src/RuleInspector.js';
import { Rule } from '../src/Rule.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { Fact } from '../src/Fact.js';

const SELF = new LogicalVariable('SELF');
const X    = new LogicalVariable('X');
const Y    = new LogicalVariable('Y');
const N    = new LogicalVariable('N');

const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };
const entityRegistry = new Map([['agent', [alice, bob, carol]]]);

function buildEvaluationContext(facts) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers);
}

function tag(name) {
  return [new StateOperation('adjust-numeric', name, [], { delta: 1.0 })];
}

describe('RuleInspector', () => {
  describe('minimumSatisfactionScore', () => {
    it('includes truth-degree-0 applications by default', () => {
      const evaluationContext = buildEvaluationContext([]);
      const rule = new Rule('R1', [new FactPredicate('knows', SELF, X)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: alice },
      });

      assert.ok(results.length > 0);
      assert.ok(results.every(r => r.satisfactionScore === 0));
    });

    it('excludes applications below a specified minimum truth degree', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      // Two predicates of equal importance; only knows is true → truth degree 0.5
      const rule = new Rule('R1', [
        new FactPredicate('knows', SELF, X),
        new FactPredicate('respectsHistory', SELF, X),
      ], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: 'alice', X: 'bob' },
        minimumSatisfactionScore: 1.0,
      });

      assert.equal(results.length, 0);
    });
  });

  describe('partial binding — name resolution', () => {
    it('resolves an agent name string to the matching entity object', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const rule = new Rule('R1', [new FactPredicate('knows', SELF, X)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: 'alice' },
        minimumSatisfactionScore: 1.0,
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].binding.resolve(SELF), alice);
      assert.equal(results[0].binding.resolve(X), bob);
    });

    it('accepts an entity object directly without resolution', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const rule = new Rule('R1', [new FactPredicate('knows', SELF, X)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: alice },
        minimumSatisfactionScore: 1.0,
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].binding.resolve(SELF), alice);
    });

    it('uses a scalar string as-is when it does not match any entity name', () => {
      const evaluationContext = buildEvaluationContext([new Fact('hasNeed', 'alice', 'companionship')]);
      const rule = new Rule('R1', [new FactPredicate('hasNeed', SELF, N)], tag('needy'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: 'alice', N: 'companionship' },
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].satisfactionScore, 1.0);
    });
  });

  describe('partial binding — variable enumeration', () => {
    it('enumerates free variables while respecting pre-bound ones', () => {
      const evaluationContext = buildEvaluationContext([
        new Fact('knows', 'alice', 'bob'),
        new Fact('knows', 'alice', 'carol'),
      ]);
      const rule = new Rule('R1', [new FactPredicate('knows', SELF, X)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: 'alice' },
        minimumSatisfactionScore: 1.0,
      });

      assert.equal(results.length, 2);
      assert.ok(results.some(r => r.binding.resolve(X) === bob));
      assert.ok(results.some(r => r.binding.resolve(X) === carol));
      assert.ok(results.every(r => r.binding.resolve(SELF) === alice));
    });

    it('evaluates exactly one combination when all variables are pre-bound', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const rule = new Rule('R1', [new FactPredicate('knows', SELF, X)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        binding: { SELF: 'alice', X: 'bob' },
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].satisfactionScore, 1.0);
    });

    it('enumerates all agents when no binding is supplied', () => {
      const evaluationContext = buildEvaluationContext([
        new Fact('knows', 'alice', 'bob'),
        new Fact('knows', 'bob', 'carol'),
      ]);
      const rule = new Rule('R1', [new FactPredicate('knows', X, Y)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        minimumSatisfactionScore: 1.0,
      });

      assert.equal(results.length, 2);
    });
  });

  describe('tag filter', () => {
    it('restricts to rules contributing to the specified tags', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const ruleA = new Rule('RA', [new FactPredicate('knows', X, Y)], tag('friendly'));
      const ruleB = new Rule('RB', [new FactPredicate('knows', X, Y)], tag('hostile'));
      const inspector = new RuleInspector();

      const results = inspector.query([ruleA, ruleB], entityRegistry, evaluationContext, null, {
        impulses: ['friendly'],
        minimumSatisfactionScore: 1.0,
      });

      assert.ok(results.every(r => r.rule === ruleA));
    });

    it('includes a rule that contributes to any of the specified tags', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const rule = new Rule('R1', [new FactPredicate('knows', X, Y)], tag('friendly'));
      const inspector = new RuleInspector();

      const results = inspector.query([rule], entityRegistry, evaluationContext, null, {
        impulses: ['friendly', 'hostile'],
        minimumSatisfactionScore: 1.0,
      });

      assert.ok(results.length > 0);
    });
  });

  describe('ruleName filter', () => {
    it('restricts to a single rule by name string', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const ruleA = new Rule('RA', [new FactPredicate('knows', X, Y)], tag('friendly'));
      const ruleB = new Rule('RB', [new FactPredicate('knows', X, Y)], tag('hostile'));
      const inspector = new RuleInspector();

      const results = inspector.query([ruleA, ruleB], entityRegistry, evaluationContext, null, {
        ruleName: 'RA',
        minimumSatisfactionScore: 1.0,
      });

      assert.ok(results.every(r => r.rule === ruleA));
    });

    it('restricts to multiple rules by name array', () => {
      const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
      const ruleA = new Rule('RA', [new FactPredicate('knows', X, Y)], tag('friendly'));
      const ruleB = new Rule('RB', [new FactPredicate('knows', X, Y)], tag('hostile'));
      const ruleC = new Rule('RC', [new FactPredicate('knows', X, Y)], tag('neutral'));
      const inspector = new RuleInspector();

      const results = inspector.query([ruleA, ruleB, ruleC], entityRegistry, evaluationContext, null, {
        ruleName: ['RA', 'RC'],
        minimumSatisfactionScore: 1.0,
      });

      const names = new Set(results.map(r => r.rule.name));
      assert.ok(names.has('RA'));
      assert.ok(!names.has('RB'));
      assert.ok(names.has('RC'));
    });
  });
});
