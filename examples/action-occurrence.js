// Demonstrates action occurrences — reified events recorded when actions
// actually happen, so you can query the history by pattern.
//
// Recording an occurrence mints an `occurrence` entity and asserts:
//   actionType(occ, <action>)         — what happened
//   role(occ, <roleName>, <value>)    — who/what filled each declared role
// plus any context facts the decision process supplies (?this_occurrence = the occurrence).
// Rules can then derive further facts over occurrences.
//
// Occurrences are a live-world record of what actually happened — not part of
// hypothetical planner search.
//
// Run: node examples/action-occurrence.js

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/Engine.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'action-catalog');

const engine = new Engine({
  predicates: join(dataDir, 'predicates.json'),
  entities:   join(dataDir, 'entities.json'),
  state:      join(dataDir, 'state'),
  actionsets: { social: join(dataDir, 'actions') },
});

// A derived predicate layered on top of the occurrence facts.
engine.loadDefinitions(`
  define "regretted a gift"
    actionType(?o, "give")
    ^ reluctant(?o)
    => regretted(?o)
`);

// Everyone needs to know their recipient for the "give" action to be eligible.
engine.assert('knows(alice, bob)');
engine.assert('knows(bob, carol)');
engine.assert('knows(carol, alice)');

const names = (rows, v) => rows.map(b => b.assignments.get(v).name ?? b.assignments.get(v)).sort();

// Executes the "give" action for a giver/recipient and records the occurrence.
// recordOccurrence is what mints the queryable actionType/role facts below.
const gift = (self, y, options = {}) => {
  const candidate = engine.scoreActionset('social', { SELF: self, Y: y })
    .find(c => c.action.name === 'give');
  engine.execute(candidate, { recordOccurrence: true, ...options });
};

// ── Three gifts happen; one of them reluctantly ─────────────────────────────

gift('alice', 'bob');
gift('bob',   'carol');
gift('carol', 'alice', { occurrenceFacts: [{ name: 'reluctant', args: ['?this_occurrence'] }] });

// ── Query the history by pattern ────────────────────────────────────────────

console.log('── every gift that occurred ──');
console.log(' ', names(engine.query('actionType(?o, "give")'), 'o').join(', '));

console.log('\n── gifts where alice was the giver (SELF) ──');
console.log(' ', names(engine.query('actionType(?o, "give") ^ role(?o, SELF, alice)'), 'o').join(', '));

console.log('\n── occurrences alice took part in, in ANY role ──');
console.log(' ', names(engine.query('role(?o, _, alice)'), 'o').join(', '));

console.log('\n── all roles of occ3 (extent binding over the polymorphic value slot) ──');
for (const b of engine.query('role(occ3, ?r, ?v)')) {
  console.log(`  ${b.assignments.get('r')} = ${b.assignments.get('v')}`);
}

console.log('\n── gifts that were regretted (derived from a reluctant context fact) ──');
console.log(' ', names(engine.query('regretted(?o)'), 'o').join(', '));
