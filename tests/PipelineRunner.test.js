import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/Engine.js';
import { Fact } from '../src/Fact.js';
import { Pipeline } from '../src/pipeline/Pipeline.js';
import { Stage } from '../src/pipeline/Stage.js';
import { PipelineRunner } from '../src/pipeline/PipelineRunner.js';

// Minimal engine with two agents and enough predicates to test routing.
function makeEngine() {
  return new Engine({
    predicates: {
      predicates: {
        acted:    { type: 'boolean', args: ['agent'] },
        responded: { type: 'boolean', args: ['agent'] },
        handoff:  { type: 'boolean', args: ['agent', 'agent'] },
        score:    { type: 'numeric', args: ['agent'], minValue: 0, maxValue: 100, default: 0, annotations: { ephemeral: true } },
      },
    },
    entities: { agent: { alice: {}, bob: {} } },
  });
}

// ── Basic single-stage pipeline ──────────────────────────────────────────────

describe('PipelineRunner — single stage, terminal action', () => {
  it('runs the entry stage and executes the top-scoring action', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "act"
        roles: ?SELF: agent
        utility 1.0
        effects acted(?SELF)
    `, 'moves');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      stages: {
        'moves-stage': new Stage({ actionset: 'moves', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('acted', 'alice'));
    assert.ok(!engine.world.factStore.contains('acted', 'bob'));
  });

  it('fires pipeline postHooks after a terminal action', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "act"
        roles: ?SELF: agent
        utility 1.0
        effects acted(?SELF)
    `, 'moves');
    engine.loadRules(`
      rule "mark responded after act"
        acted(?X)
        => responded(?X)
    `, 'post-consequences');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      postHooks: [{ type: 'ruleset', name: 'post-consequences' }],
      stages: {
        'moves-stage': new Stage({ actionset: 'moves', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('acted', 'alice'));
    assert.ok(engine.world.factStore.contains('responded', 'alice'));
  });
});

// ── Two-stage routing ────────────────────────────────────────────────────────

describe('PipelineRunner — routing between stages', () => {
  it('follows routes-to into a child stage', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "engage"
        roles: ?SELF: agent
        utility 1.0
        effects acted(?SELF)
        routes-to: respond-stage

      action "skip"
        roles: ?SELF: agent
        utility 0.1
        effects acted(?SELF)
    `, 'tier1');
    engine.loadActions(`
      action "respond"
        roles: ?SELF: agent, ?OTHER: agent
        utility 1.0
        effects responded(?OTHER)
    `, 'tier2');

    const pipeline = new Pipeline('test', {
      entry: 'tier1-stage',
      stages: {
        'tier1-stage': new Stage({ actionset: 'tier1', routing: 'branch' }),
        'respond-stage': new Stage({ actionset: 'tier2', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice', OTHER: 'bob' });

    assert.ok(engine.world.factStore.contains('acted', 'alice'));
    assert.ok(engine.world.factStore.contains('responded', 'bob'));
  });

  it('does not fire pipeline postHooks for routing actions — only terminal', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "engage"
        roles: ?SELF: agent
        utility 1.0
        routes-to: respond-stage
    `, 'tier1');
    engine.loadActions(`
      action "respond"
        roles: ?SELF: agent
        utility 1.0
        effects responded(?SELF)
    `, 'tier2');
    engine.loadRules(`
      rule "mark acted after terminal"
        responded(?X)
        => acted(?X)
    `, 'post');

    const pipeline = new Pipeline('test', {
      entry: 'tier1-stage',
      postHooks: [{ type: 'ruleset', name: 'post' }],
      stages: {
        'tier1-stage': new Stage({ actionset: 'tier1', routing: 'branch' }),
        'respond-stage': new Stage({ actionset: 'tier2', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('responded', 'alice'));
    assert.ok(engine.world.factStore.contains('acted', 'alice'));
  });
});

// ── swap-roles hook ──────────────────────────────────────────────────────────

describe('PipelineRunner — swap-roles hook', () => {
  it('swaps SELF and OTHER before the child stage scores', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "initiate"
        roles: ?SELF: agent, ?OTHER: agent
        utility 1.0
        routes-to: respond-stage
    `, 'tier1');
    engine.loadActions(`
      action "respond"
        roles: ?SELF: agent, ?OTHER: agent
        utility 1.0
        effects handoff(?SELF, ?OTHER)
    `, 'tier2');

    // After swap: SELF=bob, OTHER=alice. So handoff(bob, alice).
    const pipeline = new Pipeline('test', {
      entry: 'tier1-stage',
      stages: {
        'tier1-stage': new Stage({
          actionset: 'tier1',
          routing: 'branch',
          postHooks: [{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }],
        }),
        'respond-stage': new Stage({ actionset: 'tier2', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice', OTHER: 'bob' });

    assert.ok(engine.world.factStore.contains('handoff', 'bob', 'alice'),
      'after swap SELF=bob should be the actor in respond-stage');
    assert.ok(!engine.world.factStore.contains('handoff', 'alice', 'bob'));
  });
});

// ── salienceFloor filtering ──────────────────────────────────────────────────

describe('PipelineRunner — salienceFloor', () => {
  it('excludes candidates scoring below the floor', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "low"
        roles: ?SELF: agent
        utility 0.005
        effects acted(?SELF)
    `, 'moves');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      stages: {
        'moves-stage': new Stage({ actionset: 'moves', salienceFloor: 0.01, routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(!engine.world.factStore.contains('acted', 'alice'),
      'action below salienceFloor should not execute');
  });

  it('executes candidates scoring at or above the floor', () => {
    const engine = makeEngine();
    engine.loadActions(`
      action "ok"
        roles: ?SELF: agent
        utility 0.01
        effects acted(?SELF)
    `, 'moves');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      stages: {
        'moves-stage': new Stage({ actionset: 'moves', salienceFloor: 0.01, routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('acted', 'alice'));
  });
});

// ── groupBy selection ────────────────────────────────────────────────────────

describe('PipelineRunner — groupBy (string form)', () => {
  it('selects one winner per distinct value of the groupBy variable', () => {
    const engine = new Engine({
      predicates: {
        predicates: {
          handoff: { type: 'boolean', args: ['agent', 'agent'] },
        },
      },
      entities: { agent: { alice: {}, bob: {}, carol: {} } },
    });
    engine.loadActions(`
      action "respond"
        roles: ?SELF: agent, ?OTHER: agent
        utility 1.0
        effects handoff(?SELF, ?OTHER)
    `, 'moves');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      stages: {
        'moves-stage': new Stage({
          actionset: 'moves',
          routing: 'branch',
          selectionStrategy: { type: 'highestUtility', groupBy: 'OTHER' },
        }),
      },
    });

    // SELF=alice, OTHER is free — enumerates bob and carol.
    // groupBy OTHER → one winner per OTHER value, so both should execute.
    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('handoff', 'alice', 'bob'));
    assert.ok(engine.world.factStore.contains('handoff', 'alice', 'carol'));
  });
});

describe('PipelineRunner — groupBy (pattern form)', () => {
  // Scenario: a judge evaluates acts. Each act has a `role` record linking it
  // to the actor. The judge action is scored per (JUDGE, ACT) pair, but we
  // want one winner per distinct actor derived from world state via the role
  // predicate — not directly from the binding.
  function makeJudgeEngine() {
    return new Engine({
      predicates: {
        predicates: {
          role:     { type: 'boolean', args: ['occurrence', 'agent'] },
          judged:   { type: 'boolean', args: ['agent', 'occurrence'] },
          witnessed:{ type: 'boolean', args: ['agent', 'occurrence'] },
        },
      },
      entities: {
        agent:      { alice: {}, bob: {}, carol: {} },
        occurrence: { act1: {}, act2: {} },
      },
    });
  }

  it('derives the grouping key from world state via a pattern query', () => {
    const engine = makeJudgeEngine();

    // alice witnessed both acts; act1 was by bob, act2 by carol.
    engine.world.assert(new Fact('witnessed', 'alice', 'act1'));
    engine.world.assert(new Fact('witnessed', 'alice', 'act2'));
    engine.world.assert(new Fact('role', 'act1', 'bob'));
    engine.world.assert(new Fact('role', 'act2', 'carol'));

    engine.loadActions(`
      action "judge"
        roles: ?JUDGE: agent, ?ACT: occurrence
        utility 1.0
        effects judged(?JUDGE, ?ACT)
    `, 'judge-acts');

    // groupBy pattern: for each candidate (JUDGE, ACT), look up the actor of
    // ACT in world state. Group by actor — one judgement per distinct actor.
    const pipeline = new Pipeline('test', {
      entry: 'judge-stage',
      stages: {
        'judge-stage': new Stage({
          actionset: 'judge-acts',
          routing: 'branch',
          selectionStrategy: {
            type: 'highestUtility',
            groupBy: { pattern: 'role(?ACT, ?actor)', key: 'actor' },
          },
        }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { JUDGE: 'alice' });

    // One judgement per actor (bob, carol) — two total.
    const judgedAct1 = engine.world.factStore.contains('judged', 'alice', 'act1');
    const judgedAct2 = engine.world.factStore.contains('judged', 'alice', 'act2');
    assert.ok(judgedAct1, 'alice should judge act1 (actor: bob)');
    assert.ok(judgedAct2, 'alice should judge act2 (actor: carol)');
  });

  it('picks the highest-scoring candidate when multiple acts share the same actor', () => {
    const engine = new Engine({
      predicates: {
        predicates: {
          role:     { type: 'boolean', args: ['occurrence', 'agent'] },
          judged:   { type: 'boolean', args: ['agent', 'occurrence'] },
          salience: { type: 'numeric', args: ['occurrence'], default: 0, minValue: 0, maxValue: 10 },
        },
      },
      entities: {
        agent:      { alice: {}, bob: {} },
        occurrence: { act1: {}, act2: {} },
      },
    });

    // Both acts are by bob. act2 has higher salience.
    engine.world.assert(new Fact('role', 'act1', 'bob'));
    engine.world.assert(new Fact('role', 'act2', 'bob'));
    const ctx = engine.world.createEvaluationContext();
    engine.world.queryHandlers.getHandler('numeric').setValue('salience', ['act1'], 3, ctx);
    engine.world.queryHandlers.getHandler('numeric').setValue('salience', ['act2'], 7, ctx);

    engine.loadActions(`
      action "judge"
        roles: ?JUDGE: agent, ?ACT: occurrence
        utility salience(?ACT)
        effects judged(?JUDGE, ?ACT)
    `, 'judge-acts');

    const pipeline = new Pipeline('test', {
      entry: 'judge-stage',
      stages: {
        'judge-stage': new Stage({
          actionset: 'judge-acts',
          routing: 'branch',
          selectionStrategy: {
            type: 'highestUtility',
            groupBy: { pattern: 'role(?ACT, ?actor)', key: 'actor' },
          },
        }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { JUDGE: 'alice' });

    // Only one winner for the bob group — act2 (higher salience).
    assert.ok(!engine.world.factStore.contains('judged', 'alice', 'act1'), 'act1 should lose to act2');
    assert.ok(engine.world.factStore.contains('judged', 'alice', 'act2'), 'act2 should win (salience 7 > 3)');
  });
});

// ── collect routing ──────────────────────────────────────────────────────────

describe('PipelineRunner — collect routing', () => {
  it('executes the whole winning group, then routes the stage once', () => {
    const engine = new Engine({
      predicates: {
        predicates: {
          minted: { type: 'boolean', args: ['agent'] },
          tally:  { type: 'numeric', args: [], default: 0, minValue: 0, maxValue: 100 },
        },
      },
      entities: { agent: { alice: {}, bob: {} } },
    });
    engine.loadActions(`
      action "mint"
        roles: ?A: agent
        utility 1.0
        effects minted(?A)
    `, 'produce');
    engine.loadActions(`
      action "done"
        utility 1.0
        effects tally() += 1
    `, 'finish');

    // produce: groupBy A → one winner per agent (alice, bob). collect → both
    // mint, THEN route once to the finish stage.
    const pipeline = new Pipeline('test', {
      entry: 'produce-stage',
      stages: {
        'produce-stage': new Stage({
          actionset: 'produce',
          selectionStrategy: { type: 'highestUtility', groupBy: 'A' },
          routing: 'collect',
          routesTo: 'finish-stage',
        }),
        'finish-stage': new Stage({ actionset: 'finish', routing: 'collect' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, {});

    assert.ok(engine.world.factStore.contains('minted', 'alice'));
    assert.ok(engine.world.factStore.contains('minted', 'bob'));
    // Routed ONCE for the whole group — not once per winner (which would be 2).
    const ctx = engine.world.createEvaluationContext();
    assert.equal(engine.world.queryHandlers.getHandler('numeric').getValue('tally', [], ctx), 1);
  });

  it('routes per winner under branch routing (the contrast)', () => {
    const engine = new Engine({
      predicates: {
        predicates: {
          minted: { type: 'boolean', args: ['agent'] },
          tally:  { type: 'numeric', args: [], default: 0, minValue: 0, maxValue: 100 },
        },
      },
      entities: { agent: { alice: {}, bob: {} } },
    });
    // Same shape, but the route lives on the action and the stage is branch.
    engine.loadActions(`
      action "mint"
        roles: ?A: agent
        utility 1.0
        effects minted(?A)
        routes-to: finish-stage
    `, 'produce');
    engine.loadActions(`
      action "done"
        utility 1.0
        effects tally() += 1
    `, 'finish');

    const pipeline = new Pipeline('test', {
      entry: 'produce-stage',
      stages: {
        'produce-stage': new Stage({
          actionset: 'produce',
          routing: 'branch',
          selectionStrategy: { type: 'highestUtility', groupBy: 'A' },
        }),
        'finish-stage': new Stage({ actionset: 'finish', routing: 'branch' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, {});

    // Each of the two winners routed independently → finish ran twice.
    const ctx = engine.world.createEvaluationContext();
    assert.equal(engine.world.queryHandlers.getHandler('numeric').getValue('tally', [], ctx), 2);
  });

  it('fires pipeline postHooks after a terminal collect group', () => {
    const engine = new Engine({
      predicates: {
        predicates: {
          minted:  { type: 'boolean', args: ['agent'] },
          settled: { type: 'boolean', args: ['agent'] },
        },
      },
      entities: { agent: { alice: {}, bob: {} } },
    });
    engine.loadActions(`
      action "mint"
        roles: ?A: agent
        utility 1.0
        effects minted(?A)
    `, 'produce');
    engine.loadRules(`
      rule "settle minted"
        minted(?A)
        => settled(?A)
    `, 'post');

    // A terminal collect stage (no routesTo) fires the pipeline postHooks once,
    // after the whole group has executed — so the consequence ruleset sees every
    // winner's effects.
    const pipeline = new Pipeline('test', {
      entry: 'produce-stage',
      postHooks: [{ type: 'ruleset', name: 'post' }],
      stages: {
        'produce-stage': new Stage({
          actionset: 'produce',
          selectionStrategy: { type: 'highestUtility', groupBy: 'A' },
          routing: 'collect',
        }),
      },
    });

    new PipelineRunner(engine).run(pipeline, {});

    assert.ok(engine.world.factStore.contains('settled', 'alice'));
    assert.ok(engine.world.factStore.contains('settled', 'bob'),
      'postHooks run after the whole group, so both winners are settled');
  });

  it('rejects a collect stage whose winning action carries routes-to', () => {
    const engine = new Engine({
      predicates: { predicates: { acted: { type: 'boolean', args: ['agent'] } } },
      entities: { agent: { alice: {} } },
    });
    engine.loadActions(`
      action "act"
        roles: ?A: agent
        utility 1.0
        effects acted(?A)
        routes-to: other-stage
    `, 'moves');

    const pipeline = new Pipeline('test', {
      entry: 'm',
      stages: {
        m:           new Stage({ actionset: 'moves', routing: 'collect' }),
        'other-stage': new Stage({ actionset: 'moves', routing: 'branch' }),
      },
    });

    assert.throws(
      () => new PipelineRunner(engine).run(pipeline, { A: 'alice' }),
      /collect/,
      'a collect stage routes via its own routesTo, so action routes-to is a conflict',
    );
  });

  it('scores a routed stage against fresh derivations the group just changed', () => {
    // Regression: the derived-fact cache is tick-scoped. Stage 1 queries armed(A)
    // (caching it false) and then asserts ready(A); stage 2's precondition is
    // armed(A). Without invalidation between stages the stale `false` would make
    // stage 2 ineligible.
    const engine = new Engine({
      predicates: {
        predicates: {
          ready:   { type: 'boolean', args: ['agent'] },
          armed:   { type: 'derived', args: ['agent'] },
          started: { type: 'boolean', args: ['agent'] },
        },
      },
      entities: { agent: { alice: {} } },
    });
    engine.loadDefinitions(`
      define "armed when ready"
        ready(?A)
        => armed(?A)
    `);
    engine.loadActions(`
      action "arm"
        roles: ?A: agent
        preconditions not armed(?A)
        utility 1.0
        effects ready(?A)
    `, 'stage1');
    engine.loadActions(`
      action "fire"
        roles: ?A: agent
        preconditions armed(?A)
        utility 1.0
        effects started(?A)
    `, 'stage2');

    const pipeline = new Pipeline('test', {
      entry: 's1',
      stages: {
        s1: new Stage({ actionset: 'stage1', routing: 'collect', routesTo: 's2' }),
        s2: new Stage({ actionset: 'stage2', routing: 'collect' }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { A: 'alice' });

    assert.ok(engine.world.factStore.contains('ready', 'alice'));
    assert.ok(engine.world.factStore.contains('started', 'alice'),
      'stage 2 should see armed(alice) become true after stage 1 — not a stale cached false');
  });
});

describe('Stage — routing validation', () => {
  it('rejects routesTo on a branch stage', () => {
    assert.throws(() => new Stage({ actionset: 'x', routing: 'branch', routesTo: 'y' }), /routesTo.*collect/);
  });
  it('requires routing to be declared', () => {
    assert.throws(() => new Stage({ actionset: 'x' }), /routing is required/);
  });
  it('rejects an unknown routing discipline', () => {
    assert.throws(() => new Stage({ actionset: 'x', routing: 'wat' }), /branch.*collect/);
  });
});

// ── impulse ruleset integration ──────────────────────────────────────────────

describe('PipelineRunner — impulse ruleset', () => {
  it('applies the stage ruleset before scoring', () => {
    const engine = makeEngine();

    // Pre-assert a fact the impulse rule can fire on
    engine.world.assert(new Fact('acted', 'alice'));

    engine.loadActions(`
      action "high-score-act"
        roles: ?SELF: agent
        utility score(?SELF)
        effects responded(?SELF)

      action "low-score-act"
        roles: ?SELF: agent
        utility 0.1
    `, 'moves');

    // Impulse rule fires on ?SELF (already bound in starting binding) rather
    // than a free ?X — a free variable of type 'agent' cannot enumerate alice
    // because alice is already bound in the starting binding (distinct check).
    engine.loadRules(`
      rule "give score to self if already acted"
        acted(?SELF)
        => score(?SELF) += 10
    `, 'score-rules');

    const pipeline = new Pipeline('test', {
      entry: 'moves-stage',
      stages: {
        'moves-stage': new Stage({
          ruleset: 'score-rules',
          actionset: 'moves',
          routing: 'branch',
        }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('responded', 'alice'),
      'high-score-act should win after impulse rules fire');
  });
});
