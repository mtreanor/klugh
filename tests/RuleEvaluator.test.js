import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../src/FactStore.js';
import { FactStoreQueryHandler } from '../src/queryHandlers/FactStoreQueryHandler.js';
import { QueryHandlers } from '../src/QueryHandlers.js';
import { EvaluationContext } from '../src/EvaluationContext.js';
import { RuleEvaluator } from '../src/RuleEvaluator.js';
import { Binding } from '../src/Binding.js';
import { Rule } from '../src/Rule.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../src/predicates/NegationPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { Fact } from '../src/Fact.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');

const mockConsequent = new StateOperation('adjust-numeric', 'test-tag', [], { delta: 1.0 });

function buildEvaluationContext(facts) {
  const factStore = new FactStore();
  facts.forEach(f => factStore.assert(f));
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('factStore', new FactStoreQueryHandler(factStore));
  return new EvaluationContext(queryHandlers);
}

describe('RuleEvaluator', () => {
  it('finds a satisfying application when all conditions are met', () => {
    const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };

    const rule = new Rule('R1', [new FactPredicate('knows', X, Y)], mockConsequent);
    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);

    assert.ok(activeRules.has(rule));
    const applications = activeRules.get(rule);
    assert.equal(applications.length, 1);
    assert.equal(applications[0].binding.resolve(X), alice);
    assert.equal(applications[0].binding.resolve(Y), bob);
    assert.equal(applications[0].satisfactionScore, 1.0);
  });

  it('returns no applications when no conditions are met and there is nothing partial', () => {
    const evaluationContext = buildEvaluationContext([]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };

    const rule = new Rule('R1', [new FactPredicate('knows', X, Y)], mockConsequent);
    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);

    assert.ok(!activeRules.has(rule));
  });

  it('finds multiple satisfying applications', () => {
    const evaluationContext = buildEvaluationContext([
      new Fact('knows', 'alice', 'bob'),
      new Fact('knows', 'alice', 'carol'),
    ]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };
    const carol = { name: 'carol' };

    const rule = new Rule('R1', [new FactPredicate('knows', X, Y)], mockConsequent);
    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob, carol]]]), evaluationContext);

    assert.equal(activeRules.get(rule).length, 2);
  });

  it('correctly evaluates a rule with a negation predicate', () => {
    const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };

    const rule = new Rule('R3', [
      new FactPredicate('knows', X, Y),
      new NegationPredicate(new FactPredicate('hasNeed', X, null)),
    ], mockConsequent);

    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);

    assert.ok(activeRules.has(rule));

    // The alice→bob binding satisfies both predicates fully
    const fullySatisfied = activeRules.get(rule).find(a =>
      a.binding.resolve(X) === alice && a.binding.resolve(Y) === bob
    );
    assert.ok(fullySatisfied);
    assert.equal(fullySatisfied.satisfactionScore, 1.0);
  });

  it('computes a partial truth degree when some predicates fail', () => {
    const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };

    // Two predicates, equal importance. Only 'knows' is true.
    const rule = new Rule('R-partial', [
      new FactPredicate('knows', X, Y),
      new FactPredicate('respectsHistory', X, Y),
    ], mockConsequent);

    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);

    assert.ok(activeRules.has(rule));
    const application = activeRules.get(rule).find(a =>
      a.binding.resolve(X) === alice && a.binding.resolve(Y) === bob
    );
    assert.equal(application.satisfactionScore, 0.5);
  });

  it('respects importance weights when computing truth degree', () => {
    const evaluationContext = buildEvaluationContext([new Fact('knows', 'alice', 'bob')]);
    const alice = { name: 'alice' };
    const bob   = { name: 'bob' };

    // 'knows' has importance 3, 'respectsHistory' has importance 1.
    // Only 'knows' is true -> truth degree = 3/4 = 0.75
    const rule = new Rule('R-weighted', [
      { predicate: new FactPredicate('knows', X, Y), importance: 3 },
      { predicate: new FactPredicate('respectsHistory', X, Y), importance: 1 },
    ], mockConsequent);

    const evaluator = new RuleEvaluator();
    const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);

    const application = activeRules.get(rule).find(a =>
      a.binding.resolve(X) === alice && a.binding.resolve(Y) === bob
    );
    assert.equal(application.satisfactionScore, 0.75);
  });

  describe('starting binding', () => {
    it('pre-bound variables are held fixed and not enumerated', () => {
      const evaluationContext = buildEvaluationContext([
        new Fact('knows', 'alice', 'bob'),
        new Fact('knows', 'bob', 'alice'),
      ]);
      const FOCUS = new LogicalVariable('FOCUS');
      const Y     = new LogicalVariable('Y');
      const alice = { name: 'alice' };
      const bob   = { name: 'bob' };

      const rule = new Rule('R-focus', [new FactPredicate('knows', FOCUS, Y)], mockConsequent);
      const evaluator = new RuleEvaluator();

      const startingBinding = new Binding().extend(FOCUS, alice);
      const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext, startingBinding);
      const applications = activeRules.get(rule);

      assert.ok(applications.every(a => a.binding.resolve(FOCUS) === alice));
    });

    it('rules with no pre-bound variables range over all agents', () => {
      const evaluationContext = buildEvaluationContext([
        new Fact('knows', 'alice', 'bob'),
        new Fact('knows', 'bob', 'alice'),
      ]);
      const alice = { name: 'alice' };
      const bob   = { name: 'bob' };

      const rule = new Rule('R-general', [new FactPredicate('knows', X, Y)], mockConsequent);
      const evaluator = new RuleEvaluator();

      const activeRules = evaluator.evaluate([rule], new Map([['agent', [alice, bob]]]), evaluationContext);
      const applications = activeRules.get(rule);

      assert.equal(applications.filter(a => a.satisfactionScore === 1.0).length, 2);
    });
  });
});
