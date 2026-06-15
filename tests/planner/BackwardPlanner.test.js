import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/World.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { Fact } from '../../src/Fact.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../../src/predicates/NegationPredicate.js';
import { PrivatePredicate } from '../../src/predicates/PrivatePredicate.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { Action } from '../../src/Action.js';
import { PlannerSnapshot } from '../../src/planner/PlannerSnapshot.js';
import { BackwardPlanner } from '../../src/planner/BackwardPlanner.js';

const schema = new PredicateSchema({
  predicates: {
    knows:            { type: 'boolean', args: ['agent', 'agent'] },
    hasMessage:       { type: 'boolean', args: ['agent'] },
    messageDelivered: { type: 'boolean', args: ['agent', 'agent'] },
    qualified:        { type: 'boolean', args: ['agent'] },
    recommended:      { type: 'boolean', args: ['agent'] },
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

function buildWorldWithPrivateStores(...facts) {
  const world = buildWorld(...facts);
  world.registerPrivateStore('alice');
  world.registerPrivateStore('bob');
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

describe('BackwardPlanner', () => {
  it('finds a 2-step plan when an introduction is needed before delivery', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'bob'],
      ['knows', 'bob', 'alice'],
      ['knows', 'bob', 'carol'],
    );

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new BackwardPlanner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.ok(plan, 'expected a plan');
    assert.equal(plan.length, 2);
    assert.equal(plan[0].action.name, 'introduce');
    assert.equal(plan[1].action.name, 'deliver');
  });

  it('finds a 1-step plan when the recipient is already known', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new BackwardPlanner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.ok(plan, 'expected a plan');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action.name, 'deliver');
  });

  it('returns null when the goal is unreachable', () => {
    const world = buildWorld(['knows', 'alice', 'bob']);

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new BackwardPlanner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.equal(plan, null);
  });

  it('returns an empty plan when the goal is already satisfied in the initial state', () => {
    const world = buildWorld(['messageDelivered', 'alice', 'carol']);

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new BackwardPlanner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.deepEqual(plan, []);
  });
});

describe('BackwardPlanner — private store goals', () => {
  const OWNER_A = new LogicalVariable('A');
  const OWNER_B = new LogicalVariable('B');

  const requestReferralAction = new Action('requestReferral', {
    preconditions: [
      { predicate: new FactPredicate('knows', A, B), importance: 1.0 },
      { predicate: new FactPredicate('knows', A, C), importance: 1.0 },
      { predicate: new PrivatePredicate(OWNER_B, new FactPredicate('qualified', C)), importance: 1.0 },
    ],
    effects: [new StateOperation('assert', 'recommended', [C], { owner: OWNER_A, ownerIsVariable: true })],
  });

  it('finds a 2-step plan when an introduction is needed before requesting a referral', () => {
    const world = buildWorldWithPrivateStores(
      ['knows', 'alice', 'bob'],
      ['knows', 'bob', 'alice'],
      ['knows', 'bob', 'carol'],
    );
    world.privateStores.get('bob').assert(new Fact('qualified', 'carol'));

    const goal = [new PrivatePredicate('alice', new FactPredicate('recommended', 'carol'), { isVariable: false })];
    const plan = new BackwardPlanner([introduceAction, requestReferralAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.ok(plan, 'expected a plan');
    assert.equal(plan.length, 2);
    assert.equal(plan[0].action.name, 'introduce');
    assert.equal(plan[1].action.name, 'requestReferral');
  });

  it('finds a 1-step plan when alice already knows carol', () => {
    const world = buildWorldWithPrivateStores(
      ['knows', 'alice', 'bob'],
      ['knows', 'alice', 'carol'],
    );
    world.privateStores.get('bob').assert(new Fact('qualified', 'carol'));

    const goal = [new PrivatePredicate('alice', new FactPredicate('recommended', 'carol'), { isVariable: false })];
    const plan = new BackwardPlanner([introduceAction, requestReferralAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.ok(plan, 'expected a plan');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action.name, 'requestReferral');
  });

  it('returns null when nobody privately believes the target is qualified', () => {
    const world = buildWorldWithPrivateStores(
      ['knows', 'alice', 'bob'],
      ['knows', 'alice', 'carol'],
    );

    const goal = [new PrivatePredicate('alice', new FactPredicate('recommended', 'carol'), { isVariable: false })];
    const plan = new BackwardPlanner([introduceAction, requestReferralAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.equal(plan, null);
  });
});
