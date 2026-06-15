// Demonstrates the planner API: finding a plan, committing it,
// executing steps, and reading the full provenance chain.
//
// Run: node examples/planner.js

import { World } from '../src/World.js';
import { PredicateSchema } from '../src/PredicateSchema.js';
import { Fact } from '../src/Fact.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../src/predicates/NegationPredicate.js';
import { LogicalVariable } from '../src/LogicalVariable.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { Action } from '../src/Action.js';
import { PlannerSnapshot } from '../src/planner/PlannerSnapshot.js';
import { Planner } from '../src/planner/Planner.js';

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = new PredicateSchema({
  predicates: {
    knows:            { type: 'boolean', args: ['agent', 'agent'] },
    hasMessage:       { type: 'boolean', args: ['agent'] },
    messageDelivered: { type: 'boolean', args: ['agent', 'agent'] },
  },
});

// ── World ─────────────────────────────────────────────────────────────────────

const world = new World(schema);
world.addEntity('agent', { name: 'alice' });
world.addEntity('agent', { name: 'bob' });
world.addEntity('agent', { name: 'carol' });

// Alice has a message for Carol but doesn't know her.
// Bob knows both, so he can make the introduction.
world.factStore.assert(new Fact('hasMessage', 'alice'));
world.factStore.assert(new Fact('knows', 'alice', 'bob'));
world.factStore.assert(new Fact('knows', 'bob', 'alice'));
world.factStore.assert(new Fact('knows', 'bob', 'carol'));

// ── Actions ───────────────────────────────────────────────────────────────────

const A = new LogicalVariable('A');
const B = new LogicalVariable('B');
const C = new LogicalVariable('C');

const introduce = new Action('introduce', {
  preconditions: [
    { predicate: new FactPredicate('knows', A, B), importance: 1.0 },
    { predicate: new FactPredicate('knows', A, C), importance: 1.0 },
    { predicate: new NegationPredicate(new FactPredicate('knows', B, C)), importance: 1.0 },
  ],
  effects: [new StateOperation('assert', 'knows', [B, C])],
});

const deliver = new Action('deliver', {
  preconditions: [
    { predicate: new FactPredicate('hasMessage', A), importance: 1.0 },
    { predicate: new FactPredicate('knows', A, B),   importance: 1.0 },
  ],
  effects: [
    new StateOperation('assert',  'messageDelivered', [A, B]),
    new StateOperation('retract', 'hasMessage',       [A]),
  ],
});

// ── Planning ──────────────────────────────────────────────────────────────────

const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
const planner = new Planner([introduce, deliver], schema);
const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));

if (!steps) {
  const failed = planner.commitFailedAttempt(goal, world);
  console.log(`No plan found. Recorded failed attempt (plan #${failed.id}).`);
  process.exit(1);
}

console.log(`Plan found: ${steps.length} step(s)`);
for (const { action } of steps) {
  console.log(`  - ${action.name}`);
}

// ── Commit ────────────────────────────────────────────────────────────────────

const plan = planner.commit(steps, goal, world);
console.log(`\nPlan committed  id=${plan.id}  status=${plan.status}`);

// ── Execute ───────────────────────────────────────────────────────────────────

for (const { action, binding } of plan.plannedSteps) {
  action.execute(binding, world.queryHandlers, null, { world, planRecord: plan });
  world.advanceTick();
}

// ── Check goal ────────────────────────────────────────────────────────────────

plan.checkGoal(world);
console.log(`Goal satisfied  status=${plan.status}`);

// ── Audit trail ───────────────────────────────────────────────────────────────

console.log('\n── world.actionLog ──');
for (const record of world.actionLog) {
  const ref = record.planRecord ? `plan #${record.planRecord.id}` : 'unplanned';
  console.log(`  tick ${record.tick}  ${record.action.name}  (${ref})`);
}

console.log('\n── world.planLog ──');
for (const record of world.planLog) {
  const stepNames = record.plannedSteps.map(s => s.action.name).join(', ');
  console.log(`  plan #${record.id}  status=${record.status}  steps=[${stepNames}]`);
}

console.log('\n── provenance of messageDelivered(alice, carol) ──');
const [factRecord] = world.factStore.getRecords('messageDelivered', ['alice', 'carol']);
for (const event of factRecord.currentReasons()) {
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
