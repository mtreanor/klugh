// Demonstrates the planner through the Engine facade: finding a plan from a goal
// written in the query DSL, running it, and reading the full provenance chain —
// all without touching the planner internals by hand.
//
// Run: node examples/planner.js

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/Engine.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'messaging');

const engine = new Engine({
  predicates: join(dataDir, 'predicates.json'),
  entities:   join(dataDir, 'entities.json'),
  state:      join(dataDir, 'state'),
  actionsets: { messaging: join(dataDir, 'actions') },
});

// ── Plan ────────────────────────────────────────────────────────────────────
// The goal is just a query-DSL conjunction. engine.plan searches the actionset
// for a sequence of steps that makes it true. It returns the committed plan, or
// null when no plan exists (a failed attempt is still recorded in planLog).

const plan = engine.plan('messageDelivered(alice, carol)', { using: 'messaging' });

if (!plan) {
  const failed = engine.planLog.at(-1);
  console.log(`No plan found. Recorded failed attempt (plan #${failed.id}).`);
  process.exit(1);
}

console.log(`Plan #${plan.id} found: ${plan.plannedSteps.length} step(s)  status=${plan.status}`);
for (const { action } of plan.plannedSteps) {
  console.log(`  - ${action.name}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
// runPlan executes each step against the live world, advances a tick after each,
// links every action back to the plan, and re-checks the goal.

engine.runPlan(plan);
console.log(`\nPlan run. Goal satisfied → status=${plan.status}`);

// ── Audit trail ───────────────────────────────────────────────────────────────

console.log('\n── engine.actionLog ──');
for (const record of engine.actionLog) {
  const ref = record.planRecord ? `plan #${record.planRecord.id}` : 'unplanned';
  console.log(`  tick ${record.tick}  ${record.action.name}  (${ref})`);
}

console.log('\n── engine.planLog ──');
for (const record of engine.planLog) {
  const stepNames = record.plannedSteps.map(s => s.action.name).join(', ');
  console.log(`  plan #${record.id}  status=${record.status}  steps=[${stepNames}]`);
}

// ── Provenance ──────────────────────────────────────────────────────────────
// engine.why returns the events backing a fact. Follow an action-effect event
// to its action record, and from there to the plan that motivated it.

console.log('\n── why messageDelivered(alice, carol) ──');
for (const event of engine.why('messageDelivered(alice, carol)')) {
  if (event.provenance?.type === 'action-effect') {
    const ar = event.provenance.actionRecord;
    console.log(`  asserted by "${ar.action.name}" at tick ${ar.tick}`);
    if (ar.planRecord) {
      const p = ar.planRecord;
      console.log(`  part of plan #${p.id} (status: ${p.status})`);
      console.log(`  planned steps: ${p.plannedSteps.map(s => s.action.name).join(' → ')}`);
    }
  }
}
