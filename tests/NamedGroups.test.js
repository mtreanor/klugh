import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../src/Engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stressDir = join(__dirname, '../data/stress');

// Minimal schema shared across tests that need a live engine.
function buildEngine() {
  return new Engine({
    predicates: { predicates: {
      knows: { type: 'boolean', args: ['agent', 'agent'] },
      likes: { type: 'boolean', args: ['agent', 'agent'] },
      met:   { type: 'boolean', args: ['agent', 'agent'] },
    }},
    entities: { agent: { alice: {}, bob: {}, carol: {} } },
  });
}

// ─── rulesets ────────────────────────────────────────────────────────────────

describe('addRuleset / loadRules', () => {
  it('loadRules creates a named ruleset', () => {
    const engine = buildEngine();
    engine.loadRules('rule "R" knows(?X,?Y) => likes(?X,?Y)', 'social');
    assert.equal(engine.rulesets.get('social').length, 1);
  });

  it('addRuleset replaces the group by default', () => {
    const engine = buildEngine();
    engine.loadRules('rule "R1" knows(?X,?Y) => likes(?X,?Y)', 'social');
    engine.loadRules('rule "R2" knows(?X,?Y) => met(?X,?Y)', 'social');
    assert.equal(engine.rulesets.get('social').length, 1);
  });

  it('addRuleset with merge:true appends to the existing group', () => {
    const engine = buildEngine();
    engine.loadRules('rule "R1" knows(?X,?Y) => likes(?X,?Y)', 'social');
    engine.loadRules('rule "R2" knows(?X,?Y) => met(?X,?Y)', 'social', { merge: true });
    assert.equal(engine.rulesets.get('social').length, 2);
  });

  it('two independently named rulesets coexist', () => {
    const engine = buildEngine();
    engine.loadRules('rule "R1" knows(?X,?Y) => likes(?X,?Y)', 'social');
    engine.loadRules('rule "R2" knows(?X,?Y) => met(?X,?Y)', 'norms');
    assert.equal(engine.rulesets.get('social').length, 1);
    assert.equal(engine.rulesets.get('norms').length, 1);
  });
});

// ─── actionsets ──────────────────────────────────────────────────────────────

const ACTION_A = 'action "greet" effects knows(?SELF, ?Y)';
const ACTION_B = 'action "meet"  effects met(?SELF, ?Y)';

describe('addActionset / loadActions', () => {
  it('loadActions creates a named actionset', () => {
    const engine = buildEngine();
    engine.loadActions(ACTION_A, 'social');
    assert.equal(engine.actionsets.get('social').length, 1);
  });

  it('addActionset replaces the group by default', () => {
    const engine = buildEngine();
    engine.loadActions(ACTION_A, 'social');
    engine.loadActions(ACTION_B, 'social');
    assert.equal(engine.actionsets.get('social').length, 1);
  });

  it('addActionset with merge:true appends to the existing group', () => {
    const engine = buildEngine();
    engine.loadActions(ACTION_A, 'social');
    engine.loadActions(ACTION_B, 'social', { merge: true });
    assert.equal(engine.actionsets.get('social').length, 2);
  });

  it('two independently named actionsets coexist', () => {
    const engine = buildEngine();
    engine.loadActions(ACTION_A, 'social');
    engine.loadActions(ACTION_B, 'norms');
    assert.equal(engine.actionsets.get('social').length, 1);
    assert.equal(engine.actionsets.get('norms').length, 1);
  });
});

// ─── config: string | string[] ───────────────────────────────────────────────

describe('config — array paths for rulesets and actionsets', () => {
  it('accepts a single string path (backward compatible)', () => {
    const engine = new Engine({
      predicates: join(stressDir, 'predicates.json'),
      entities:   join(stressDir, 'entities.json'),
      rulesets:   { main: join(stressDir, 'rules') },
    });
    assert.ok(engine.rulesets.get('main').length > 0);
  });

  it('accepts an array of paths and merges them into one named ruleset', () => {
    // Point the same file twice — the group should have double the rules.
    const rulesPath = join(stressDir, 'rules');
    const single = new Engine({
      predicates: join(stressDir, 'predicates.json'),
      entities:   join(stressDir, 'entities.json'),
      rulesets:   { main: rulesPath },
    });
    const doubled = new Engine({
      predicates: join(stressDir, 'predicates.json'),
      entities:   join(stressDir, 'entities.json'),
      rulesets:   { main: [rulesPath, rulesPath] },
    });
    assert.equal(doubled.rulesets.get('main').length, single.rulesets.get('main').length * 2);
  });

  it('accepts an array of paths and merges them into one named actionset', () => {
    const actionsPath = join(stressDir, 'actions');
    const single = new Engine({
      predicates: join(stressDir, 'predicates.json'),
      entities:   join(stressDir, 'entities.json'),
      actionsets: { social: actionsPath },
    });
    const doubled = new Engine({
      predicates: join(stressDir, 'predicates.json'),
      entities:   join(stressDir, 'entities.json'),
      actionsets: { social: [actionsPath, actionsPath] },
    });
    assert.equal(doubled.actionsets.get('social').length, single.actionsets.get('social').length * 2);
  });
});
