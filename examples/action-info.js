// Demonstrates action info: blocks — describing actions with facts so the
// action catalog itself becomes queryable with ordinary klugh queries.
//
// Each action declares facts about itself via `info:`, where ?this_action is the
// action. Those facts register the action as an `action` entity, so you can
// find actions by spec, match conjunctions, enumerate an action's tags with a
// partial binding, and even change the facts at runtime.
//
// Run: node examples/action-info.js

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interpreter } from '../src/Interpreter.js';
import { Fact } from '../src/Fact.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'action-catalog');

const interp = new Interpreter({
  predicates: join(dataDir, 'predicates.json'),
  entities:   join(dataDir, 'entities.json'),
  state:      join(dataDir, 'state'),
  actionsets: { social: join(dataDir, 'actions') },
});

const names = (bindings, varName) => bindings.map(b => b.assignments.get(varName).name).sort();

// ── Find actions matching a spec ────────────────────────────────────────────

console.log('── all actions tagged "social" ──');
console.log(' ', names(interp.query('tag(?a, social)'), 'a').join(', '));

console.log('\n── actions that are BOTH social and generous ──');
console.log(' ', names(interp.query('tag(?a, social) ^ tag(?a, generous)'), 'a').join(', '));

console.log('\n── actions that target an agent but are NOT aggressive ──');
console.log(' ', names(interp.query('targets(?a, agent) ^ not tag(?a, aggressive)'), 'a').join(', '));

// ── Partial binding: enumerate one action's tags ────────────────────────────

console.log('\n── every tag on "give" (partial binding ?a = give) ──');
console.log(' ', names(interp.query('tag(?a, ?t)', { a: 'give' }), 't').join(', '));

// ── Facts about actions are mutable ─────────────────────────────────────────

console.log('\n── reclassify: a social norm shifts, "insult" becomes acceptable ──');
console.log('  before — aggressive actions:', names(interp.query('tag(?a, aggressive)'), 'a').join(', '));

interp.world.factStore.retract(new Fact('tag', 'insult', 'aggressive'));
interp.world.factStore.assert(new Fact('tag', 'insult', 'social'));

console.log('  after  — aggressive actions:', names(interp.query('tag(?a, aggressive)'), 'a').join(', ') || '(none)');
console.log('  after  — social actions:   ', names(interp.query('tag(?a, social)'), 'a').join(', '));
