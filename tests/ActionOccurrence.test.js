import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World } from '../src/World.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { Action } from '../src/Action.js';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { Engine } from '../src/Engine.js';
import { recordActionOccurrence } from '../src/recordActionOccurrence.js';

const SELF = new LogicalVariable('SELF');
const Y    = new LogicalVariable('Y');

function bind(...pairs) {
  let b = new Binding();
  for (const [v, val] of pairs) b = b.extend(v, val);
  return b;
}

// ── recordActionOccurrence (the mechanism) ───────────────────────────────────

describe('recordActionOccurrence', () => {
  const schema = new PredicateSchema({ predicates: {} });

  function world() {
    const w = new World(schema);
    w.addEntity('agent', { name: 'alice' });
    w.addEntity('agent', { name: 'bob' });
    return w;
  }

  const give = new Action('give', { roles: [{ variable: '?SELF', type: 'agent' }, { variable: '?Y', type: 'agent' }], effects: [] });

  it('mints an occurrence entity and asserts actionType + role facts', () => {
    const w = world();
    const binding = bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]);

    const occ = recordActionOccurrence(give, binding, w);

    assert.equal(occ, 'occ1');
    assert.deepEqual(w.entityRegistry.get('occurrence'), [{ name: 'occ1' }]);
    assert.ok(w.factStore.contains('actionType', 'occ1', 'give'));
    assert.ok(w.factStore.contains('role', 'occ1', 'SELF', 'alice'));
    assert.ok(w.factStore.contains('role', 'occ1', 'Y', 'bob'));
  });

  it('asserts context facts with ?this_occurrence resolved to the occurrence', () => {
    const w = world();
    const binding = bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]);

    const occ = recordActionOccurrence(give, binding, w, {
      contextFacts: [
        { name: 'reluctant', args: ['?this_occurrence'] },
        { name: 'runnerUp',  args: ['?this_occurrence', 'apologize'] },
      ],
    });

    assert.ok(w.factStore.contains('reluctant', occ));
    assert.ok(w.factStore.contains('runnerUp', occ, 'apologize'));
  });

  it('gives each occurrence a distinct id', () => {
    const w = world();
    const binding = bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]);
    assert.equal(recordActionOccurrence(give, binding, w), 'occ1');
    assert.equal(recordActionOccurrence(give, binding, w), 'occ2');
  });

  it('skips roles that are not bound', () => {
    const w = world();
    const binding = bind([SELF, { name: 'alice' }]);  // Y unbound
    const occ = recordActionOccurrence(give, binding, w);
    assert.ok(w.factStore.contains('role', occ, 'SELF', 'alice'));
    assert.equal(w.factStore.getRecords('role', [occ, 'Y', 'bob']).length, 0);
  });
});

// ── execute opt-in: record + link to the action record ───────────────────────

describe('Action.execute — recordOccurrence option', () => {
  const schema = new PredicateSchema({
    predicates: { helped: { type: 'boolean', args: ['agent', 'agent'] } },
  });

  it('records an occurrence and links it onto the action record', () => {
    const w = new World(schema);
    w.addEntity('agent', { name: 'alice' });
    w.addEntity('agent', { name: 'bob' });
    const give = new Action('give', {
      roles: [{ variable: '?SELF', type: 'agent' }, { variable: '?Y', type: 'agent' }],
      effects: [new StateOperation('assert', 'helped', [SELF, Y])],
    });
    const binding = bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]);

    give.execute(binding, w.queryHandlers, null, {
      world: w,
      recordOccurrence: true,
      occurrenceFacts: [{ name: 'reluctant', args: ['?this_occurrence'] }],
    });

    const record = w.actionLog.at(-1);
    assert.equal(record.occurrence, 'occ1');
    assert.ok(w.factStore.contains('actionType', 'occ1', 'give'));
    assert.ok(w.factStore.contains('reluctant', 'occ1'));
    assert.ok(w.factStore.contains('helped', 'alice', 'bob'));  // the effect still applies
  });

  it('does not record an occurrence unless asked', () => {
    const w = new World(schema);
    w.addEntity('agent', { name: 'alice' });
    w.addEntity('agent', { name: 'bob' });
    const give = new Action('give', {
      roles: [{ variable: '?SELF', type: 'agent' }, { variable: '?Y', type: 'agent' }],
      effects: [new StateOperation('assert', 'helped', [SELF, Y])],
    });
    give.execute(bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]), w.queryHandlers, null, { world: w });

    assert.equal(w.entityRegistry.get('occurrence'), undefined);
    assert.equal(w.actionLog.at(-1).occurrence, undefined);
  });
});

// ── ?this_occurrence inside effects ──────────────────────────────────────────

describe('Action.execute — ?this_occurrence in effects', () => {
  const schema = new PredicateSchema({
    predicates: {
      helped:    { type: 'boolean', args: ['agent', 'agent'] },
      reluctant: { type: 'boolean', args: ['occurrence'] },
    },
  });

  const OCC = new LogicalVariable('this_occurrence');

  function makeGive() {
    return new Action('give', {
      roles: [{ variable: '?SELF', type: 'agent' }, { variable: '?Y', type: 'agent' }],
      effects: [
        new StateOperation('assert', 'helped', [SELF, Y]),       // ordinary state
        new StateOperation('assert', 'reluctant', [OCC]),        // annotates the occurrence
      ],
    });
  }

  it('annotates the recorded occurrence when tracking is on', () => {
    const w = new World(schema);
    w.addEntity('agent', { name: 'alice' });
    w.addEntity('agent', { name: 'bob' });
    const give = makeGive();

    give.execute(bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]), w.queryHandlers, null, {
      world: w,
      recordOccurrence: true,
    });

    assert.ok(w.factStore.contains('helped', 'alice', 'bob'));    // ordinary effect applied
    assert.ok(w.factStore.contains('reluctant', 'occ1'));         // occurrence effect applied
  });

  it('skips the occurrence effect when tracking is off, but applies the rest', () => {
    const w = new World(schema);
    w.addEntity('agent', { name: 'alice' });
    w.addEntity('agent', { name: 'bob' });
    const give = makeGive();

    give.execute(bind([SELF, { name: 'alice' }], [Y, { name: 'bob' }]), w.queryHandlers, null, { world: w });

    assert.ok(w.factStore.contains('helped', 'alice', 'bob'));    // ordinary effect still applies
    assert.equal(w.factStore.getRecords('reluctant', ['occ1']).length, 0);  // occurrence effect skipped
    assert.equal(w.entityRegistry.get('occurrence'), undefined);
  });
});

// ── End-to-end: query occurrences by pattern ─────────────────────────────────

function makeEngine() {
  const dir = mkdtempSync(join(tmpdir(), 'klugh-occurrence-'));

  writeFileSync(join(dir, 'predicates.json'), JSON.stringify({
    predicates: {
      actionType: { type: 'boolean', args: ['occurrence', 'action'] },
      role:       { type: 'boolean', args: ['occurrence', 'roleName', 'entity'] },
      reluctant:  { type: 'boolean', args: ['occurrence'] },
      regretted:  { type: 'derived', args: ['occurrence'] },
      helped:     { type: 'boolean', args: ['agent', 'agent'] },
    },
  }));

  writeFileSync(join(dir, 'entities.json'), JSON.stringify({
    agent: { alice: {}, bob: {}, carol: {} },
  }));

  writeFileSync(join(dir, 'state'), '# no initial facts\n');

  const actionsPath = join(dir, 'actions');
  writeFileSync(actionsPath, `
    action "give"
      roles: ?SELF: agent, ?Y: agent
      effects helped(?SELF, ?Y)
  `);

  const engine = new Engine({
    predicates: join(dir, 'predicates.json'),
    entities:   join(dir, 'entities.json'),
    state:      join(dir, 'state'),
    actionsets: { social: actionsPath },
  });

  // A derived predicate layered on top of the occurrence facts (path b).
  engine.loadDefinitions(`
    define "regretted a gift"
      actionType(?o, "give")
      ^ reluctant(?o)
      => regretted(?o)
  `);

  return engine;
}

function ent(engine, name) {
  return engine.findEntityByName(name) ?? name;
}

describe('action occurrences — querying by pattern', () => {
  it('records and finds occurrences by action type and role', () => {
    const engine = makeEngine();
    const give   = engine.actionsets.get('social')[0];

    recordActionOccurrence(give, bind([SELF, ent(engine, 'alice')], [Y, ent(engine, 'bob')]),  engine.world);
    recordActionOccurrence(give, bind([SELF, ent(engine, 'carol')], [Y, ent(engine, 'alice')]), engine.world, {
      contextFacts: [{ name: 'reluctant', args: ['?this_occurrence'] }],
    });

    // All "give" occurrences
    assert.equal(engine.query('actionType(?o, "give")').length, 2);

    // Occurrences where alice was the SELF
    const aliceGave = engine.query('actionType(?o, "give") ^ role(?o, SELF, alice)');
    assert.equal(aliceGave.length, 1);
    assert.equal(aliceGave[0].assignments.get('o').name, 'occ1');
  });

  it('enumerates all roles of one occurrence via extent binding (polymorphic value slot)', () => {
    const engine = makeEngine();
    const give   = engine.actionsets.get('social')[0];
    recordActionOccurrence(give, bind([SELF, ent(engine, 'alice')], [Y, ent(engine, 'bob')]), engine.world);

    // ?r (roleName) and ?v (entity) have no registered entities → bound from the
    // recorded role facts themselves. Values come back as the stored name strings.
    const roles = engine.query('role(occ1, ?r, ?v)')
      .map(b => `${b.assignments.get('r')}=${b.assignments.get('v')}`)
      .sort();
    assert.deepEqual(roles, ['SELF=alice', 'Y=bob']);
  });

  it('finds an occurrence by who appeared in any role', () => {
    const engine = makeEngine();
    const give   = engine.actionsets.get('social')[0];
    recordActionOccurrence(give, bind([SELF, ent(engine, 'alice')], [Y, ent(engine, 'bob')]),  engine.world);
    recordActionOccurrence(give, bind([SELF, ent(engine, 'carol')], [Y, ent(engine, 'alice')]), engine.world);

    // alice appears in occ1 (SELF) and occ2 (Y)
    const withAlice = engine.query('role(?o, _, alice)')
      .map(b => b.assignments.get('o').name)
      .sort();
    assert.deepEqual(withAlice, ['occ1', 'occ2']);
  });

  it('lets rules derive new facts over occurrences (context layered on top)', () => {
    const engine = makeEngine();
    const give   = engine.actionsets.get('social')[0];
    recordActionOccurrence(give, bind([SELF, ent(engine, 'alice')], [Y, ent(engine, 'bob')]), engine.world);
    recordActionOccurrence(give, bind([SELF, ent(engine, 'carol')], [Y, ent(engine, 'alice')]), engine.world, {
      contextFacts: [{ name: 'reluctant', args: ['?this_occurrence'] }],
    });

    // Only the reluctant gift is regretted (derived).
    const regretted = engine.query('regretted(?o)').map(b => b.assignments.get('o').name);
    assert.deepEqual(regretted, ['occ2']);
  });
});
