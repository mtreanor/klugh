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
        'moves-stage': new Stage({ actionset: 'moves' }),
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
        'moves-stage': new Stage({ actionset: 'moves' }),
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
        'tier1-stage': new Stage({ actionset: 'tier1' }),
        'respond-stage': new Stage({ actionset: 'tier2' }),
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
        'tier1-stage': new Stage({ actionset: 'tier1' }),
        'respond-stage': new Stage({ actionset: 'tier2' }),
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
          postHooks: [{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }],
        }),
        'respond-stage': new Stage({ actionset: 'tier2' }),
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
        'moves-stage': new Stage({ actionset: 'moves', salienceFloor: 0.01 }),
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
        'moves-stage': new Stage({ actionset: 'moves', salienceFloor: 0.01 }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('acted', 'alice'));
  });
});

// ── groupBy selection ────────────────────────────────────────────────────────

describe('PipelineRunner — groupBy', () => {
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
        }),
      },
    });

    new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });

    assert.ok(engine.world.factStore.contains('responded', 'alice'),
      'high-score-act should win after impulse rules fire');
  });
});
