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
import { Interpreter } from '../src/Interpreter.js';
import { recordActionOccurrence } from '../src/recordActionOccurrence.js';
import { Binding } from '../src/Binding.js';
import { LogicalVariable } from '../src/LogicalVariable.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'action-catalog');

const interp = new Interpreter({
  predicates: join(dataDir, 'predicates.json'),
  entities:   join(dataDir, 'entities.json'),
  state:      join(dataDir, 'state'),
  actionsets: { social: join(dataDir, 'actions') },
});

// A derived predicate layered on top of the occurrence facts.
interp.loadDefinitions(`
  define "regretted a gift"
    actionType(?o, "give")
    ^ reluctant(?o)
    => regretted(?o)
`);

const give    = interp.actionsets.get('social').find(a => a.name === 'give');
const ent      = name => interp.findEntityByName(name) ?? name;
const SELF     = new LogicalVariable('SELF');
const Y        = new LogicalVariable('Y');
const bind     = (self, y) => new Binding().extend(SELF, ent(self)).extend(Y, ent(y));
const names    = (rows, v) => rows.map(b => b.assignments.get(v).name ?? b.assignments.get(v)).sort();

// ── Three gifts happen; one of them reluctantly ─────────────────────────────

recordActionOccurrence(give, bind('alice', 'bob'),   interp.world);
recordActionOccurrence(give, bind('bob',   'carol'), interp.world);
recordActionOccurrence(give, bind('carol', 'alice'), interp.world, {
  contextFacts: [{ name: 'reluctant', args: ['?this_occurrence'] }],
});

// ── Query the history by pattern ────────────────────────────────────────────

console.log('── every gift that occurred ──');
console.log(' ', names(interp.query('actionType(?o, "give")'), 'o').join(', '));

console.log('\n── gifts where alice was the giver (SELF) ──');
console.log(' ', names(interp.query('actionType(?o, "give") ^ role(?o, SELF, alice)'), 'o').join(', '));

console.log('\n── occurrences alice took part in, in ANY role ──');
console.log(' ', names(interp.query('role(?o, _, alice)'), 'o').join(', '));

console.log('\n── all roles of occ3 (extent binding over the polymorphic value slot) ──');
for (const b of interp.query('role(occ3, ?r, ?v)')) {
  console.log(`  ${b.assignments.get('r')} = ${b.assignments.get('v')}`);
}

console.log('\n── gifts that were regretted (derived from a reluctant context fact) ──');
console.log(' ', names(interp.query('regretted(?o)'), 'o').join(', '));
