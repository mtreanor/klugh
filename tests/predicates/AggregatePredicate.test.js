import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactStore } from '../../src/FactStore.js';
import { FactStoreQueryHandler } from '../../src/queryHandlers/FactStoreQueryHandler.js';
import { NumericStateQueryHandler } from '../../src/queryHandlers/NumericStateQueryHandler.js';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { Binding } from '../../src/Binding.js';
import { Fact } from '../../src/Fact.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { AggregatePredicate } from '../../src/predicates/AggregatePredicate.js';
import { WhenPredicate } from '../../src/predicates/WhenPredicate.js';

const alice = { name: 'alice' };
const bob   = { name: 'bob' };
const carol = { name: 'carol' };
const dave  = { name: 'dave' };
const agents = [alice, bob, carol, dave];

const schema = new PredicateSchema({
  predicates: {
    warmth: { type: 'numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    trust:  { type: 'numeric', minValue: 0, maxValue: 100, default: 0, tiers: {} },
    knows:  { type: 'boolean', args: ['agent', 'agent'] },
  },
});

const aggVar      = new LogicalVariable('__agg_0__');
const aggVarTypes = new Map([['__agg_0__', 'agent']]);

// warmthValues: { alice: 80, bob: 60 } etc.
// booleanFacts: [[name, ...args], ...]
function buildContext(warmthValues = {}, booleanFacts = []) {
  const factStore = new FactStore();
  const qh        = new QueryHandlers();
  const numHandler = new NumericStateQueryHandler(factStore, schema);
  qh.register('factStore', new FactStoreQueryHandler(factStore));
  qh.register('numeric',   numHandler);

  for (const [subject, value] of Object.entries(warmthValues)) {
    numHandler.setValue('warmth', [subject, 'carol'], value);
  }
  for (const args of booleanFacts) {
    factStore.assert(new Fact(...args));
  }

  const entityRegistry = new Map([['agent', agents]]);
  return new EvaluationContext(qh, { entityRegistry, predicateSchema: schema });
}

// avg|warmth(__agg_0__, carol)| op threshold — no filter.
function makeAvgPred(operator, threshold) {
  return new AggregatePredicate(
    'avg',
    [],
    { name: 'warmth', args: [aggVar, 'carol'] },
    [aggVar],
    aggVarTypes,
    operator,
    { kind: 'literal', value: threshold },
  );
}

describe('AggregatePredicate', () => {
  describe('avg', () => {
    it('averages numeric values across all enumerated entities', () => {
      // avg(80, 60, 40, 20) / 4 = 50
      const ctx = buildContext({ alice: 80, bob: 60, carol: 40, dave: 20 });
      assert.ok(makeAvgPred('=', 50).evaluate(new Binding(), ctx));
    });

    it('excludes entities with the default value when default is 0 and comparing >', () => {
      // alice=70, bob=50; carol and dave have default 0 → avg(70,50,0,0)/4 = 30
      const ctx = buildContext({ alice: 70, bob: 50 });
      assert.ok(makeAvgPred('=', 30).evaluate(new Binding(), ctx));
    });

    it('returns false when avg does not satisfy the comparison', () => {
      const ctx = buildContext({ alice: 80, bob: 60, carol: 40, dave: 20 }); // avg=50
      assert.ok(!makeAvgPred('>', 50).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('>', 49).evaluate(new Binding(), ctx));
    });
  });

  describe('sum', () => {
    it('sums numeric values', () => {
      const ctx = buildContext({ alice: 30, bob: 20 });
      // all four agents: 30+20+0+0 = 50
      const pred = new AggregatePredicate(
        'sum', [], { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, '=', { kind: 'literal', value: 50 },
      );
      assert.ok(pred.evaluate(new Binding(), ctx));
    });
  });

  describe('max', () => {
    it('finds the maximum value', () => {
      const ctx = buildContext({ alice: 90, bob: 45, carol: 70, dave: 20 });
      const pred = new AggregatePredicate(
        'max', [], { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, '=', { kind: 'literal', value: 90 },
      );
      assert.ok(pred.evaluate(new Binding(), ctx));
    });
  });

  describe('min', () => {
    it('finds the minimum value', () => {
      const ctx = buildContext({ alice: 90, bob: 45, carol: 70, dave: 20 });
      const pred = new AggregatePredicate(
        'min', [], { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, '=', { kind: 'literal', value: 20 },
      );
      assert.ok(pred.evaluate(new Binding(), ctx));
    });
  });

  describe('filter predicates', () => {
    it('only aggregates over entities that pass the filter', () => {
      // alice=80, bob=60, carol=40, dave=20; filter: knows(_, carol) = alice+bob only
      const ctx = buildContext(
        { alice: 80, bob: 60, carol: 40, dave: 20 },
        [['knows', 'alice', 'carol'], ['knows', 'bob', 'carol']],
      );
      const knowsFilter = new FactPredicate('knows', aggVar, 'carol');
      const pred = new AggregatePredicate(
        'avg', [knowsFilter],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, '=', { kind: 'literal', value: 70 },
      );
      assert.ok(pred.evaluate(new Binding(), ctx));
    });

    it('returns false when filter excludes all entities', () => {
      const ctx = buildContext({ alice: 80 }, []);
      const knowsFilter = new FactPredicate('knows', aggVar, 'carol');
      const pred = new AggregatePredicate(
        'avg', [knowsFilter], { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, '>', { kind: 'literal', value: 0 },
      );
      assert.ok(!pred.evaluate(new Binding(), ctx));
    });
  });

  describe('outer context variable', () => {
    it('uses a bound outer variable as the target argument', () => {
      // avg|warmth(__agg__, ?SELF)| where ?SELF bound to carol
      // warmth(alice, carol)=60, warmth(bob, carol)=40; carol,dave default=0 → avg=25
      const factStore = new FactStore();
      const qh        = new QueryHandlers();
      const numHandler = new NumericStateQueryHandler(factStore, schema);
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      qh.register('numeric',   numHandler);
      numHandler.setValue('warmth', ['alice', 'carol'], 60);
      numHandler.setValue('warmth', ['bob',   'carol'], 40);
      numHandler.setValue('warmth', ['alice', 'bob'],   90);
      const entityRegistry = new Map([['agent', agents]]);
      const ctx = new EvaluationContext(qh, { entityRegistry, predicateSchema: schema });

      const SELF = new LogicalVariable('SELF');
      const pred = new AggregatePredicate(
        'avg', [], { name: 'warmth', args: [aggVar, SELF] },
        [aggVar], aggVarTypes, '=', { kind: 'literal', value: 25 },
      );
      const binding = new Binding().extend(SELF, carol);
      assert.ok(pred.evaluate(binding, ctx));
    });
  });

  describe('comparison operators', () => {
    it('supports all six operators against a literal', () => {
      // alice=60, bob=40, carol=0, dave=0 → avg = 25
      const ctx = buildContext({ alice: 60, bob: 40 });
      assert.ok( makeAvgPred('>',  24).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('>',  25).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('>=', 25).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('>=', 26).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('<',  26).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('<',  25).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('<=', 25).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('<=', 24).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('=',  25).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('=',  24).evaluate(new Binding(), ctx));
      assert.ok( makeAvgPred('!=', 24).evaluate(new Binding(), ctx));
      assert.ok(!makeAvgPred('!=', 25).evaluate(new Binding(), ctx));
    });
  });

  describe('rhs: numeric predicate', () => {
    it('compares aggregate to a bound numeric predicate value', () => {
      const factStore = new FactStore();
      const qh        = new QueryHandlers();
      const numHandler = new NumericStateQueryHandler(factStore, schema);
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      qh.register('numeric',   numHandler);
      // avg warmth toward carol = (80+60+0+0)/4 = 35; warmth(dave,carol)=0 → 35 > 0 ✓
      numHandler.setValue('warmth', ['alice', 'carol'], 80);
      numHandler.setValue('warmth', ['bob',   'carol'], 60);
      const entityRegistry = new Map([['agent', agents]]);
      const ctx = new EvaluationContext(qh, { entityRegistry, predicateSchema: schema });

      const DAVE = new LogicalVariable('DAVE');
      const pred = new AggregatePredicate(
        'avg', [],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes,
        '>',
        { kind: 'numeric', name: 'warmth', args: [DAVE, 'carol'] },
      );
      // avg=35 > warmth(dave,carol)=0 → true
      assert.ok(pred.evaluate(new Binding().extend(DAVE, dave), ctx));

      // avg=35 > warmth(alice,carol)=80 → false
      const ALICE = new LogicalVariable('ALICE');
      const pred2 = new AggregatePredicate(
        'avg', [],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes,
        '>',
        { kind: 'numeric', name: 'warmth', args: [ALICE, 'carol'] },
      );
      assert.ok(!pred2.evaluate(new Binding().extend(ALICE, alice), ctx));
    });
  });

  describe('rhs: aggregate vs aggregate', () => {
    it('compares two aggregate values against each other', () => {
      const factStore = new FactStore();
      const qh        = new QueryHandlers();
      const numHandler = new NumericStateQueryHandler(factStore, schema);
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      qh.register('numeric',   numHandler);
      // avg warmth toward carol: (80+60+0+0)/4=35
      numHandler.setValue('warmth', ['alice', 'carol'], 80);
      numHandler.setValue('warmth', ['bob',   'carol'], 60);
      // avg warmth toward bob: (30+10+0+0)/4=10
      numHandler.setValue('warmth', ['alice', 'bob'], 30);
      numHandler.setValue('warmth', ['dave',  'bob'], 10);
      const entityRegistry = new Map([['agent', agents]]);
      const ctx = new EvaluationContext(qh, { entityRegistry, predicateSchema: schema });

      const aggVar2      = new LogicalVariable('__agg_1__');
      const aggVarTypes2 = new Map([['__agg_1__', 'agent']]);

      // avg|warmth(_, carol)| > avg|warmth(_, bob)| → 35 > 10 ✓
      const innerPred = new AggregatePredicate(
        'avg', [],
        { name: 'warmth', args: [aggVar2, 'bob'] },
        [aggVar2], aggVarTypes2, null, null,
      );
      const outerPred = new AggregatePredicate(
        'avg', [],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes,
        '>',
        { kind: 'aggregate', predicate: innerPred },
      );
      assert.ok(outerPred.evaluate(new Binding(), ctx));
    });
  });

  describe('argmax pattern', () => {
    it('computeValue returns the maximum for use in pred(?X) = max|...| pattern', () => {
      const factStore = new FactStore();
      const qh        = new QueryHandlers();
      const numHandler = new NumericStateQueryHandler(factStore, schema);
      qh.register('numeric', numHandler);
      numHandler.setValue('warmth', ['alice', 'carol'], 90);
      numHandler.setValue('warmth', ['bob',   'carol'], 50);
      numHandler.setValue('warmth', ['dave',  'carol'], 30);
      const entityRegistry = new Map([['agent', agents]]);
      const ctx = new EvaluationContext(qh, { entityRegistry, predicateSchema: schema });

      const maxPred = new AggregatePredicate(
        'max', [],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes, null, null,
      );
      assert.equal(maxPred.computeValue(new Binding(), ctx), 90);
    });
  });

  describe('getVariables()', () => {
    it('returns outer-scope variables but not counting variables', () => {
      const pred = makeAvgPred('>', 50);
      assert.equal(pred.getVariables().length, 0);
    });

    it('includes outer-scope variables referenced in filter predicates', () => {
      const TARGET = new LogicalVariable('TARGET');
      const filterPred = new FactPredicate('knows', aggVar, TARGET);
      const pred = new AggregatePredicate(
        'avg', [filterPred],
        { name: 'warmth', args: [aggVar, TARGET] },
        [aggVar], aggVarTypes, '>', { kind: 'literal', value: 50 },
      );
      const vars = pred.getVariables();
      assert.equal(vars.length, 1);
      assert.equal(vars[0].name, 'TARGET');
    });

    it('includes outer-scope variables from a numeric rhs', () => {
      const TARGET = new LogicalVariable('TARGET');
      const pred = new AggregatePredicate(
        'avg', [],
        { name: 'warmth', args: [aggVar, 'carol'] },
        [aggVar], aggVarTypes,
        '>',
        { kind: 'numeric', name: 'warmth', args: [TARGET, 'bob'] },
      );
      const vars = pred.getVariables();
      assert.equal(vars.length, 1);
      assert.equal(vars[0].name, 'TARGET');
    });
  });

  // fn: 'count' — valuePred is null; every predicate in the conjunction is a
  // filter, and the result is how many enumerated combinations satisfy all of
  // them. Migrated from the retired CountPredicate class, which this
  // subsumes: same semantics for a single-filter conjunction, plus support
  // for multiple filters (^) that CountPredicate never had.
  describe("fn: 'count'", () => {
    const SELF = new LogicalVariable('SELF');

    function buildKnowsContext(facts, agents) {
      const factStore = new FactStore();
      for (const fact of facts) factStore.assert(fact);
      const qh = new QueryHandlers();
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      return new EvaluationContext(qh, { entityRegistry: new Map([['agent', agents]]) });
    }

    function makeCountPred(operator, threshold, filterPredicates = [new FactPredicate('knows', SELF, aggVar)]) {
      return new AggregatePredicate('count', filterPredicates, null, [aggVar], aggVarTypes, operator, { kind: 'literal', value: threshold });
    }

    describe('operator >', () => {
      it('is true when the count exceeds the threshold', () => {
        const ctx = buildKnowsContext(
          [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol'), new Fact('knows', 'alice', 'dave')],
          [alice, bob, carol, dave],
        );
        const binding = new Binding().extend(SELF, alice);
        assert.ok(makeCountPred('>', 2).evaluate(binding, ctx));
      });

      it('is false when the count equals the threshold', () => {
        const ctx = buildKnowsContext(
          [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol')],
          [alice, bob, carol],
        );
        const binding = new Binding().extend(SELF, alice);
        assert.ok(!makeCountPred('>', 2).evaluate(binding, ctx));
      });

      it('is false when the count is below the threshold', () => {
        const ctx = buildKnowsContext([new Fact('knows', 'alice', 'bob')], [alice, bob, carol]);
        const binding = new Binding().extend(SELF, alice);
        assert.ok(!makeCountPred('>', 2).evaluate(binding, ctx));
      });
    });

    describe('operators >= and <=', () => {
      it('>= is true at and above the threshold, false below', () => {
        const ctx = buildKnowsContext(
          [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol')],
          [alice, bob, carol, dave],
        );
        const binding = new Binding().extend(SELF, alice);
        assert.ok(makeCountPred('>=', 1).evaluate(binding, ctx));
        assert.ok(makeCountPred('>=', 2).evaluate(binding, ctx));
        assert.ok(!makeCountPred('>=', 3).evaluate(binding, ctx));
      });

      it('<= is true at and below the threshold, false above', () => {
        const ctx = buildKnowsContext(
          [new Fact('knows', 'alice', 'bob'), new Fact('knows', 'alice', 'carol')],
          [alice, bob, carol, dave],
        );
        const binding = new Binding().extend(SELF, alice);
        assert.ok(makeCountPred('<=', 3).evaluate(binding, ctx));
        assert.ok(makeCountPred('<=', 2).evaluate(binding, ctx));
        assert.ok(!makeCountPred('<=', 1).evaluate(binding, ctx));
      });
    });

    it('is true (0 >= 0) when nothing matches — count must not collapse to null like avg/sum do on empty', () => {
      const ctx = buildKnowsContext([], [alice, bob, carol]);
      const binding = new Binding().extend(SELF, alice);
      assert.ok(makeCountPred('>=', 0).evaluate(binding, ctx));
      assert.ok(!makeCountPred('>=', 1).evaluate(binding, ctx));
    });

    it('supports a multi-predicate conjunction — CountPredicate never could', () => {
      // alice knows bob and carol; only bob is also "trusted". Count of
      // groupmates alice both knows AND trusts should be 1, not 2.
      const factStore = new FactStore();
      factStore.assert(new Fact('knows', 'alice', 'bob'));
      factStore.assert(new Fact('knows', 'alice', 'carol'));
      factStore.assert(new Fact('trusted', 'alice', 'bob'));
      const qh = new QueryHandlers();
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      const ctx = new EvaluationContext(qh, { entityRegistry: new Map([['agent', [alice, bob, carol, dave]]]) });

      const pred = makeCountPred('=', 1, [
        new FactPredicate('knows', SELF, aggVar),
        new FactPredicate('trusted', SELF, aggVar),
      ]);
      const binding = new Binding().extend(SELF, alice);
      assert.ok(pred.evaluate(binding, ctx));
    });

    describe('getVariables()', () => {
      it('returns outer-scope variables but not counting variables', () => {
        const vars = makeCountPred('>', 2).getVariables();
        assert.equal(vars.length, 1);
        assert.equal(vars[0].name, 'SELF');
      });

      it('returns empty when no outer-scope variables are present', () => {
        const pred = makeCountPred('>', 2, [new FactPredicate('knows', aggVar, aggVar)]);
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
        const knowledgeVar = new LogicalVariable('__count_0__');

        const qh = new QueryHandlers();
        qh.register('factStore', new FactStoreQueryHandler(factStore));
        const entityRegistry = new Map([
          ['agent',     [alice]],
          ['knowledge', [karate, philosophy, cooking]],
        ]);
        const ctx = new EvaluationContext(qh, { entityRegistry });

        const pred = new AggregatePredicate(
          'count',
          [new FactPredicate('hasKnowledge', SELF, knowledgeVar)],
          null,
          [knowledgeVar],
          new Map([['__count_0__', 'knowledge']]),
          '=',
          { kind: 'literal', value: 2 },
        );
        const binding = new Binding().extend(SELF, alice);
        assert.ok(pred.evaluate(binding, ctx));
      });
    });
  });

  describe('count with [when: _t] (tick-kind counting variable)', () => {
    const SELF  = new LogicalVariable('SELF');
    const OTHER = new LogicalVariable('OTHER');
    const tVar  = new LogicalVariable('__agg_0__');

    function tickCtx(now, seed) {
      const factStore = new FactStore();
      seed(factStore);
      const qh = new QueryHandlers();
      qh.register('factStore', new FactStoreQueryHandler(factStore));
      return new EvaluationContext(qh, {
        entityRegistry: new Map([['agent', agents]]),
        predicateSchema: schema,
        tickTracker: { currentTick: now },
      });
    }

    // count|knows(?SELF, ?OTHER) [when: _t]| op threshold — counts assertion events.
    function makeCount(operator, threshold) {
      const when = new WhenPredicate('knows', [SELF, OTHER], tVar);
      return new AggregatePredicate(
        'count', [when], null, [tVar], new Map([['__agg_0__', 'tick']]), operator,
        { kind: 'literal', value: threshold },
      );
    }

    it('counts assertion events, not ticks of continuous truth', () => {
      const ctx = tickCtx(20, (s) => {
        // knows(alice,bob): on@1, off@3, on@5, off@8, on@11 → 3 assertion events
        s.currentTick = 1;  s.assert(new Fact('knows', 'alice', 'bob'));
        s.currentTick = 3;  s.retract(new Fact('knows', 'alice', 'bob'));
        s.currentTick = 5;  s.assert(new Fact('knows', 'alice', 'bob'));
        s.currentTick = 8;  s.retract(new Fact('knows', 'alice', 'bob'));
        s.currentTick = 11; s.assert(new Fact('knows', 'alice', 'bob'));
      });
      const binding = new Binding().extend(SELF, 'alice').extend(OTHER, 'bob');
      assert.equal(makeCount('=', 3).evaluate(binding, ctx), true);  // three on-events
      assert.equal(makeCount('>', 3).evaluate(binding, ctx), false);
      assert.equal(makeCount('>', 2).evaluate(binding, ctx), true);
    });

    it('counts zero when the fact was never asserted', () => {
      const ctx = tickCtx(20, () => {});
      const binding = new Binding().extend(SELF, 'alice').extend(OTHER, 'bob');
      assert.equal(makeCount('=', 0).evaluate(binding, ctx), true);
    });
  });
});
