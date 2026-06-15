import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/World.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { Fact } from '../../src/Fact.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../../src/predicates/NegationPredicate.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { Action } from '../../src/Action.js';
import { PlannerSnapshot } from '../../src/planner/PlannerSnapshot.js';
import { Planner } from '../../src/planner/Planner.js';
import { PlanRecord } from '../../src/provenance/PlanRecord.js';

const schema = new PredicateSchema({
  predicates: {
    knows:            { type: 'boolean', args: ['agent', 'agent'] },
    hasMessage:       { type: 'boolean', args: ['agent'] },
    messageDelivered: { type: 'boolean', args: ['agent', 'agent'] },
  },
});

const A = new LogicalVariable('A');
const B = new LogicalVariable('B');
const C = new LogicalVariable('C');

function buildWorld(...facts) {
  const world = new World(schema);
  world.addEntity('agent', { name: 'alice' });
  world.addEntity('agent', { name: 'bob' });
  world.addEntity('agent', { name: 'carol' });
  for (const [name, ...args] of facts) {
    world.factStore.assert(new Fact(name, ...args));
  }
  return world;
}

const introduceAction = new Action('introduce', {
  preconditions: [
    { predicate: new FactPredicate('knows', A, B), importance: 1.0 },
    { predicate: new FactPredicate('knows', A, C), importance: 1.0 },
    { predicate: new NegationPredicate(new FactPredicate('knows', B, C)), importance: 1.0 },
  ],
  effects: [new StateOperation('assert', 'knows', [B, C])],
});

const deliverAction = new Action('deliver', {
  preconditions: [
    { predicate: new FactPredicate('hasMessage', A), importance: 1.0 },
    { predicate: new FactPredicate('knows', A, B),   importance: 1.0 },
  ],
  effects: [
    new StateOperation('assert',  'messageDelivered', [A, B]),
    new StateOperation('retract', 'hasMessage',       [A]),
  ],
});

describe('PlanRecord', () => {
  it('is created with active status and correct fields', () => {
    const goal  = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const steps = [{ action: deliverAction, binding: null }];
    const plan  = new PlanRecord({ goal, plannedSteps: steps, plannedAtTick: 5 });

    assert.equal(plan.status, 'active');
    assert.equal(plan.goal, goal);
    assert.equal(plan.plannedSteps, steps);
    assert.equal(plan.plannedAtTick, 5);
    assert.ok(plan.id != null);
  });

  it('assigns unique ids to each instance', () => {
    const a = new PlanRecord({ goal: [], plannedSteps: [], plannedAtTick: 0 });
    const b = new PlanRecord({ goal: [], plannedSteps: [], plannedAtTick: 0 });
    assert.notEqual(a.id, b.id);
  });

  it('succeed() sets status to succeeded', () => {
    const plan = new PlanRecord({ goal: [], plannedSteps: [], plannedAtTick: 0 });
    plan.succeed();
    assert.equal(plan.status, 'succeeded');
  });

  it('fail() sets status to failed', () => {
    const plan = new PlanRecord({ goal: [], plannedSteps: [], plannedAtTick: 0 });
    plan.fail();
    assert.equal(plan.status, 'failed');
  });

  it('abandon() sets status to abandoned', () => {
    const plan = new PlanRecord({ goal: [], plannedSteps: [], plannedAtTick: 0 });
    plan.abandon();
    assert.equal(plan.status, 'abandoned');
  });

  it('checkGoal() returns true and sets status to succeeded when the goal is satisfied', () => {
    const world = buildWorld(['messageDelivered', 'alice', 'carol']);
    const goal  = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan  = new PlanRecord({ goal, plannedSteps: [], plannedAtTick: 0 });

    const result = plan.checkGoal(world);
    assert.equal(result, true);
    assert.equal(plan.status, 'succeeded');
  });

  it('checkGoal() returns false and leaves status active when the goal is not satisfied', () => {
    const world = buildWorld(['knows', 'alice', 'bob']);
    const goal  = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan  = new PlanRecord({ goal, plannedSteps: [], plannedAtTick: 0 });

    const result = plan.checkGoal(world);
    assert.equal(result, false);
    assert.equal(plan.status, 'active');
  });
});

describe('Planner.commit', () => {
  it('creates a PlanRecord, pushes it to world.planLog, and returns it', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));

    const plan = planner.commit(steps, goal, world);

    assert.equal(world.planLog.length, 1);
    assert.equal(world.planLog[0], plan);
    assert.equal(plan.status, 'active');
    assert.equal(plan.goal, goal);
    assert.deepEqual(plan.plannedSteps, steps);
    assert.equal(plan.plannedAtTick, world.tickTracker.currentTick);
  });

  it('stores the full Action object in each planned step', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));
    const plan    = planner.commit(steps, goal, world);

    assert.equal(plan.plannedSteps[0].action, deliverAction);
  });

  it('multiple commits accumulate in world.planLog', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));

    planner.commit(steps, goal, world);
    planner.commit(steps, goal, world);

    assert.equal(world.planLog.length, 2);
  });
});

describe('Planner.commitFailedAttempt', () => {
  it('creates a PlanRecord with failed status and no steps', () => {
    const world   = buildWorld(['knows', 'alice', 'bob']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([deliverAction], schema);

    const plan = planner.commitFailedAttempt(goal, world);

    assert.equal(world.planLog.length, 1);
    assert.equal(world.planLog[0], plan);
    assert.equal(plan.status, 'failed');
    assert.deepEqual(plan.plannedSteps, []);
    assert.equal(plan.goal, goal);
    assert.equal(plan.plannedAtTick, world.tickTracker.currentTick);
  });
});

describe('ActionRecord — plan linkage', () => {
  it('ActionRecord.action is the Action object, not a name string', () => {
    const world = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal  = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const steps = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));
    const { action, binding } = steps[0];

    action.execute(binding, world.queryHandlers, null, { world });

    const record = world.actionLog.at(-1);
    assert.equal(record.action, deliverAction);
    assert.equal(record.planRecord, null);
  });

  it('ActionRecord.planRecord is set when a planRecord is passed to execute()', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));
    const plan    = planner.commit(steps, goal, world);
    const { action, binding } = steps[0];

    action.execute(binding, world.queryHandlers, null, { world, planRecord: plan });

    const record = world.actionLog.at(-1);
    assert.equal(record.planRecord, plan);
    assert.equal(record.action, deliverAction);
  });

  it('facts produced by a planned action carry provenance back to the plan', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));
    const plan    = planner.commit(steps, goal, world);
    const { action, binding } = steps[0];

    action.execute(binding, world.queryHandlers, null, { world, planRecord: plan });

    const [factRecord] = world.factStore.getRecords('messageDelivered', ['alice', 'carol']);
    const reason = factRecord.currentReasons().find(e => e.provenance?.type === 'action-effect');
    assert.ok(reason, 'expected action-effect provenance');
    assert.equal(reason.provenance.actionRecord.planRecord, plan);
  });

  it('checkGoal() sets status to succeeded after the planned steps are executed', () => {
    const world   = buildWorld(['hasMessage', 'alice'], ['knows', 'alice', 'carol']);
    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const planner = new Planner([introduceAction, deliverAction], schema);
    const steps   = planner.findPlan(goal, PlannerSnapshot.from(world));
    const plan    = planner.commit(steps, goal, world);

    for (const { action, binding } of steps) {
      action.execute(binding, world.queryHandlers, null, { world, planRecord: plan });
    }

    assert.equal(plan.checkGoal(world), true);
    assert.equal(plan.status, 'succeeded');
  });
});
