import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/Engine.js';
import { ActionParser } from '../src/loader/ActionParser.js';
import { ActionLoader } from '../src/loader/ActionLoader.js';

// ── ?this_action available everywhere a binding works ────────────────────────

function makeEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'klugh-thisvars-'));

  writeFileSync(join(dir, 'predicates.json'), JSON.stringify({
    predicates: {
      tag: { type: 'boolean', args: ['action', 'actionTag'] },
      did: { type: 'boolean', args: ['agent', 'action'] },
    },
  }));

  writeFileSync(join(dir, 'entities.json'), JSON.stringify({
    agent:     { alice: {} },
    actionTag: { generous: {}, aggressive: {} },
  }));

  writeFileSync(join(dir, 'state'), '# no initial facts\n');

  const actionsPath = join(dir, 'actions');
  writeFileSync(actionsPath, `
    action "give"
      roles: ?SELF
      info:
        tag(?this_action, generous)
      preconditions
        tag(?this_action, generous)
      utility
        rule "is generous" tag(?this_action, generous) => 5
      effects did(?SELF, ?this_action)

    action "insult"
      roles: ?SELF
      info:
        tag(?this_action, aggressive)
      preconditions
        tag(?this_action, generous)
      effects did(?SELF, ?this_action)
  `);

  return new Engine({
    predicates: join(dir, 'predicates.json'),
    entities:   join(dir, 'entities.json'),
    state:      join(dir, 'state'),
    actionsets: { test: actionsPath },
  });
}

describe('?this_action', () => {
  it('binds to the current action in preconditions (not enumerated over all actions)', () => {
    const engine = makeEngine();
    const candidates = engine.scoreActionset('test', { SELF: 'alice' });

    // Only "give" passes — its tag(?this_action, generous) precondition resolves
    // to *give*. "insult" is excluded: tag(insult, generous) is false, even though
    // some other action is generous.
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].action.name, 'give');
  });

  it('resolves to the current action in utility scoring', () => {
    const engine = makeEngine();
    const [best] = engine.scoreActionset('test', { SELF: 'alice' });
    assert.equal(best.score, 5);
  });

  it('resolves to the current action in effects', () => {
    const engine = makeEngine();
    const [best] = engine.scoreActionset('test', { SELF: 'alice' });
    best.action.execute(best.binding, engine.world.queryHandlers, null, { world: engine.world });

    assert.ok(engine.world.factStore.contains('did', 'alice', 'give'));
  });
});

// ── ?this_occurrence is effects-only ─────────────────────────────────────────

function load(src) {
  const ast = new ActionParser(null).parse(src);
  return new ActionLoader(null).load(ast);
}

describe('?this_occurrence placement', () => {
  it('is allowed in effects', () => {
    assert.doesNotThrow(() => load(`
      action "give"
        roles: ?SELF
        effects reluctant(?this_occurrence)
    `));
  });

  it('is a load-time error in preconditions', () => {
    assert.throws(() => load(`
      action "give"
        roles: ?SELF
        preconditions reluctant(?this_occurrence)
        effects helped(?SELF)
    `), /only valid in an effects: block/);
  });

  it('is a load-time error in utility', () => {
    assert.throws(() => load(`
      action "give"
        roles: ?SELF
        utility
          rule "x" reluctant(?this_occurrence) => 1
        effects helped(?SELF)
    `), /only valid in an effects: block/);
  });

  it('is a load-time error in info', () => {
    assert.throws(() => load(`
      action "give"
        roles: ?SELF
        info:
          reluctant(?this_occurrence)
        effects helped(?SELF)
    `), /only valid in an effects: block/);
  });
});
