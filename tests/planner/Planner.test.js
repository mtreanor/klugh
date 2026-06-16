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
import { Planner } from '../../src/planner/Planner.js';

const schema = new PredicateSchema({
  predicates: {
    knows:            { type: 'boolean', args: ['agent', 'agent'] },
    hasMessage:       { type: 'boolean', args: ['agent'] },
    messageDelivered: { type: 'boolean', args: ['agent', 'agent'] },
    qualified:        { type: 'boolean', args: ['agent'] },
    recommended:      { type: 'boolean', args: ['agent'] },
    relayed:          { type: 'boolean', args: ['agent'] },
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

// Two-step relay path: relay(A) then relayDeliver(A, B).
// Used in cost and enumeration tests to give a genuine 2-step alternative to direct deliver.
const relayAction = new Action('relay', {
  preconditions: [{ predicate: new FactPredicate('hasMessage', A), importance: 1.0 }],
  effects: [
    new StateOperation('assert',  'relayed',    [A]),
    new StateOperation('retract', 'hasMessage', [A]),
  ],
});

const relayDeliverAction = new Action('relayDeliver', {
  preconditions: [
    { predicate: new FactPredicate('relayed', A), importance: 1.0 },
    { predicate: new FactPredicate('knows', A, B), importance: 1.0 },
  ],
  effects: [
    new StateOperation('assert',  'messageDelivered', [A, B]),
    new StateOperation('retract', 'relayed',          [A]),
  ],
});

describe('Planner', () => {
  it('finds a 2-step plan when an introduction is needed before delivery', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'bob'],
      ['knows', 'bob', 'alice'],
      ['knows', 'bob', 'carol'],
    );

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new Planner([introduceAction, deliverAction], schema)
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
    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.ok(plan, 'expected a plan');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action.name, 'deliver');
  });

  it('returns null when the goal is unreachable', () => {
    const world = buildWorld(['knows', 'alice', 'bob']);

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.equal(plan, null);
  });

  it('returns an empty plan when the goal is already satisfied', () => {
    const world = buildWorld(['messageDelivered', 'alice', 'carol']);

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.deepEqual(plan, []);
  });

  it('does not revisit states already seen', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'bob'],
      ['knows', 'bob', 'alice'],
    );

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.equal(plan, null);
  });
});

describe('PlannerSnapshot', () => {
  it('clones only currently active facts', () => {
    const world = buildWorld(['knows', 'alice', 'bob'], ['hasMessage', 'alice']);
    world.factStore.retract(new Fact('hasMessage', 'alice'));

    const snapshot = PlannerSnapshot.from(world);
    assert.equal(snapshot.factStore.factHistory.filter(r => r.isCurrentlyActive()).length, 1);
    assert.ok(snapshot.factStore.contains('knows', 'alice', 'bob'));
    assert.ok(!snapshot.factStore.contains('hasMessage', 'alice'));
  });

  it('produces a consistent state key for cycle detection', () => {
    const world = buildWorld(['knows', 'alice', 'bob'], ['knows', 'bob', 'carol']);
    const s1 = PlannerSnapshot.from(world);
    const s2 = PlannerSnapshot.from(world);
    assert.equal(s1.stateKey(), s2.stateKey());
  });

  it('produces different state keys for different fact sets', () => {
    const w1 = buildWorld(['knows', 'alice', 'bob']);
    const w2 = buildWorld(['knows', 'alice', 'carol']);
    assert.notEqual(PlannerSnapshot.from(w1).stateKey(), PlannerSnapshot.from(w2).stateKey());
  });

  it('includes private store facts in the state key', () => {
    const w1 = buildWorldWithPrivateStores();
    const w2 = buildWorldWithPrivateStores();
    w2.privateStores.get('bob').assert(new Fact('qualified', 'carol'));
    assert.notEqual(PlannerSnapshot.from(w1).stateKey(), PlannerSnapshot.from(w2).stateKey());
  });
});

describe('Planner — cost function', () => {
  it('prefers the lower-cost plan when a cost function is provided', () => {
    // Two genuinely different paths to the goal:
    //   Path 1 (1 step):  deliver(alice, carol)               — uses deliverAction
    //   Path 2 (2 steps): relay(alice) + relayDeliver(alice, carol) — uses relay actions
    //
    // Without cost: BFS finds the shorter path (1 step).
    // With cost fn: deliver costs 10, relay/relayDeliver cost 1 each.
    //   Path 1 total = 10, Path 2 total = 2 → planner returns the 2-step path.
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const actions = [deliverAction, relayAction, relayDeliverAction];

    const cheapBySteps = new Planner(actions, schema)
      .findPlan(goal, PlannerSnapshot.from(world));
    assert.equal(cheapBySteps.length, 1);
    assert.equal(cheapBySteps[0].action.name, 'deliver');

    const costFn = (action) => action.name === 'deliver' ? 10 : 1;
    const cheapByCost = new Planner(actions, schema)
      .findPlan(goal, PlannerSnapshot.from(world), { cost: costFn });
    assert.equal(cheapByCost.length, 2);
    assert.equal(cheapByCost[0].action.name, 'relay');
    assert.equal(cheapByCost[1].action.name, 'relayDeliver');
  });
});

describe('Planner — findPlans generator', () => {
  it('yields the first plan and can be used like findPlan', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const gen  = new Planner([introduceAction, deliverAction], schema)
      .findPlans(goal, PlannerSnapshot.from(world));

    const { value, done } = gen.next();
    assert.equal(done, false);
    assert.ok(Array.isArray(value));
    assert.equal(value.length, 1);
  });

  it('returns done:true with no value when no plan exists', () => {
    const world = buildWorld(['knows', 'alice', 'bob']);

    const goal = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const gen  = new Planner([introduceAction, deliverAction], schema)
      .findPlans(goal, PlannerSnapshot.from(world));

    const { value, done } = gen.next();
    assert.equal(done, true);
    assert.equal(value, undefined);
  });

  it('can be iterated with for...of to collect multiple plans', () => {
    // Two distinct paths to the goal: deliver (1 step) and relay+relayDeliver (2 steps).
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal    = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const actions = [deliverAction, relayAction, relayDeliverAction];
    const plans   = [];
    for (const plan of new Planner(actions, schema).findPlans(goal, PlannerSnapshot.from(world))) {
      plans.push(plan);
    }

    assert.ok(plans.length >= 2, `expected at least 2 plans, got ${plans.length}`);
    const lengths = plans.map(p => p.length);
    assert.ok(lengths.includes(1), 'expected a 1-step plan');
    assert.ok(lengths.includes(2), 'expected a 2-step plan');
  });
});

describe('Planner — validators', () => {
  it('skips plans that fail a validator', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal       = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    // Reject any plan whose first step is 'deliver'
    const validators = [(steps) => steps[0]?.action.name !== 'deliver'];

    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world), { validators });

    assert.equal(plan, null, 'expected null — only valid plan is blocked by validator');
  });

  it('accepts a plan that passes all validators', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal       = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const validators = [(steps) => steps.every(s => s.action.name !== 'introduce')];

    const plan = new Planner([introduceAction, deliverAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world), { validators });

    assert.ok(plan, 'expected a plan');
    assert.equal(plan[0].action.name, 'deliver');
  });
});

describe('Planner — findPlanDetailed', () => {
  it('returns { steps, nearestMiss: null } on success', () => {
    const world = buildWorld(
      ['hasMessage', 'alice'],
      ['knows', 'alice', 'carol'],
    );

    const goal   = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const result = new Planner([introduceAction, deliverAction], schema)
      .findPlanDetailed(goal, PlannerSnapshot.from(world));

    assert.ok(result.steps, 'expected steps');
    assert.equal(result.nearestMiss, null);
  });

  it('returns { steps: null, nearestMiss } on failure', () => {
    // alice has no message and doesn't know carol — goal is unreachable
    const world = buildWorld(['knows', 'alice', 'bob']);

    const goal   = [new FactPredicate('messageDelivered', 'alice', 'carol')];
    const result = new Planner([introduceAction, deliverAction], schema)
      .findPlanDetailed(goal, PlannerSnapshot.from(world));

    assert.equal(result.steps, null);
    assert.ok(Array.isArray(result.nearestMiss), 'expected nearestMiss array');
    assert.ok(result.nearestMiss.length > 0, 'expected at least one unsatisfied goal predicate');
  });
});

describe('Planner — private store goals', () => {
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
    const plan = new Planner([introduceAction, requestReferralAction], schema)
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
    const plan = new Planner([introduceAction, requestReferralAction], schema)
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
    const plan = new Planner([introduceAction, requestReferralAction], schema)
      .findPlan(goal, PlannerSnapshot.from(world));

    assert.equal(plan, null);
  });
});
