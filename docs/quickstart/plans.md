# 3 · Plans

An action is a single step. A **plan** is a sequence of steps that reaches a *goal* you declare — the engine searches the actionset for a path from the current world to a state where the goal holds.

This is the tier where you compose the engine into something larger. Start from a fresh load of the scenario (so `alice` does **not** yet know `carol`).

## Declare a goal, get a plan

The goal is just a query-DSL conjunction. `engine.plan(goal, { using })` names the actionset to search:

```javascript
const plan = engine.plan('helped(alice, carol)', { using: 'social' });

plan.plannedSteps.map(s => s.action.name);
// [ 'introduce', 'offer help' ]
```

Two steps, and the reason is instructive. `offer help` requires `knows(?SELF, ?Y)`, but alice doesn't know carol — so a one-step plan is impossible. The planner discovers that `introduce` can establish the missing acquaintance first:

```
introduce(bob, alice, carol)   →  knows(alice, carol)
offer help(alice, carol)       →  helped(alice, carol)
```

`plan` returns the committed `PlanRecord`, or `null` when no path exists — and either way the attempt is recorded in `engine.planLog`, so even failures are auditable.

## Run it

`engine.runPlan` executes the steps against the live world, advances a tick after each, links every resulting action record back to the plan, and re-checks the goal:

```javascript
engine.runPlan(plan);
plan.status;        // 'succeeded'

engine.planLog;     // [ PlanRecord #1, status 'succeeded' ]
```

## The whole chain is traversable

Because plan steps run through the same recording path as any action, provenance now reaches all the way back to intent. Ask why the goal fact is true:

```javascript
for (const event of engine.why('helped(alice, carol)')) {
  if (event.provenance?.type === 'action-effect') {
    const ar = event.provenance.actionRecord;
    console.log(`asserted by "${ar.action.name}" at tick ${ar.tick}`);
    if (ar.planRecord) {
      const steps = ar.planRecord.plannedSteps.map(s => s.action.name).join(' → ');
      console.log(`as part of plan #${ar.planRecord.id}: ${steps}`);
    }
  }
}
// asserted by "offer help" at tick 1
// as part of plan #1: introduce → offer help
```

Fact → action that caused it → plan that motivated it. That traceability is a first-class output of the engine, not something you wired up.

## Where to go from here

You now have the whole arc: author a world, query it, score and run actions, and plan toward goals — all through the `Engine`, all recorded.

- [Plans reference](../plans) — plan costs, validators, multiple plans, failed-attempt records
- [Rules](../rules) — let the world change *itself* to a fixpoint, instead of one action at a time
- [Derived predicates](../derived-predicates) and [Private stores](../private-stores) — conclude facts on the fly, and give agents their own beliefs
- [Language overview](../overview) — the complete DSL

← Back to the [Quickstart overview](./)
