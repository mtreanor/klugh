# Plans

A **plan** is a sequence of actions that achieves a goal from a given starting state. klugh ships two planners — a forward BFS planner and a backward (regression) planner — that search over hypothetical world states to find such sequences.

The planner never mutates the live world. It works against a `PlannerSnapshot` — a frozen copy of the fact store and private stores at a point in time — so searching is always safe to discard.

---

## Finding a plan

Both planners expose the same `findPlan(goalPredicates, snapshot)` interface:

```javascript
import { Planner } from './src/planner/Planner.js';
import { BackwardPlanner } from './src/planner/BackwardPlanner.js';
import { PlannerSnapshot } from './src/planner/PlannerSnapshot.js';

const snapshot = PlannerSnapshot.from(world);
const steps    = new Planner(actions, schema).findPlan(goalPredicates, snapshot);
// or
const steps    = new BackwardPlanner(actions, schema).findPlan(goalPredicates, snapshot);
```

`goalPredicates` is an array of predicate objects — the same forms used in rule preconditions and action preconditions.

`findPlan` returns either an array of `{ action, binding }` steps or `null` if no plan exists. An empty array means the goal is already satisfied in the snapshot.

---

## Forward vs. backward

| | Forward (`Planner`) | Backward (`BackwardPlanner`) |
|--|--|--|
| Strategy | Applies actions forward from the initial state | Works back from the goal, finding what achieves each sub-goal |
| Best for | Short horizons, broad worlds | Deep plans, highly constrained goals |

---

## Committing a plan

Finding a plan does not record it. To make a plan part of the world's history — so its status can be tracked and executed actions can reference it — call `commit`:

```javascript
const steps = planner.findPlan(goalPredicates, PlannerSnapshot.from(world));

if (steps) {
  const plan = planner.commit(steps, goalPredicates, world);
  // plan is now in world.planLog with status 'active'
} else {
  const plan = planner.commitFailedAttempt(goalPredicates, world);
  // plan.status === 'failed', plan.plannedSteps is empty
}
```

---

## `PlanRecord` fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Auto-incremented identifier |
| `goal` | `Predicate[]` | The goal predicates passed to `commit` |
| `plannedSteps` | `{ action: Action, binding: Binding }[]` | The planned sequence, with full `Action` objects |
| `plannedAtTick` | `number` | World tick at the time `commit` was called |
| `status` | `string` | `'active'`, `'succeeded'`, `'failed'`, or `'abandoned'` |

---

## Plan status

A committed plan starts `'active'`. Status is updated explicitly or via `checkGoal`:

```javascript
plan.checkGoal(world);  // evaluates goal predicates against live world state;
                        // sets status to 'succeeded' and returns true if satisfied,
                        // returns false otherwise — status unchanged

plan.succeed();         // explicit success
plan.fail();            // explicit failure (e.g. a required step was blocked)
plan.abandon();         // plan was discarded (world changed, goal no longer relevant)
```

---

## Linking executed actions to the plan

Pass the `PlanRecord` when executing each step. The resulting `ActionRecord` will carry a reference to the plan:

```javascript
for (const { action, binding } of plan.plannedSteps) {
  action.execute(binding, world.queryHandlers, null, {
    world,
    planRecord: plan,
  });
  world.advanceTick();
}

plan.checkGoal(world);  // auto-sets status to 'succeeded' if the goal is now met
```

Every fact asserted by a planned action carries an `ActionEffectProvenance → ActionRecord → PlanRecord` chain, so the full path from intent to effect is always traversable from any affected fact.

---

## Reading the plan log

All committed plans live in `world.planLog`:

```javascript
world.planLog;                                     // PlanRecord[]
world.planLog.at(-1);                              // most recent plan
world.planLog.filter(p => p.status === 'active');  // active plans

const record = world.actionLog.at(-1);
record.planRecord;  // PlanRecord | null — the plan this action was executing
```

---

## Full audit trail

Given a fact, trace it back through the action and into the plan that motivated it:

```javascript
const [factRecord] = world.factStore.getRecords('messageDelivered', ['alice', 'carol']);
const reason = factRecord.currentReasons().find(e => e.provenance?.type === 'action-effect');

if (reason) {
  const ar = reason.provenance.actionRecord;
  console.log(`asserted by "${ar.action.name}" at tick ${ar.tick}`);

  if (ar.planRecord) {
    const plan = ar.planRecord;
    console.log(`part of plan #${plan.id}  (status: ${plan.status})`);
    console.log(`planned steps:`);
    for (const step of plan.plannedSteps) {
      console.log(`  ${step.action.name}`);
    }
  }
}
```

A runnable end-to-end example is in `examples/planner.js`.

→ [Actions](actions.md) · [Action records](action-records.md) · [Provenance](provenance.md)
