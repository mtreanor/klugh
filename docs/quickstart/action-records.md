# 2.5 · Action records

Running an action through `engine.execute` leaves two traces, both for free: an entry in the **action log**, and **provenance** on every fact the action touched. Together they let you reconstruct what happened and why.

This page continues from [Actions](./actions) — assume `bob` has just offered to help `carol`.

## The action log

`engine.actionLog` is every action that has fired, oldest first. Each entry is an `ActionRecord`:

```javascript
for (const record of engine.actionLog) {
  const ref = record.planRecord ? `plan #${record.planRecord.id}` : 'unplanned';
  console.log(`tick ${record.tick}  ${record.action.name}  (${ref})`);
}
// tick 0  offer help  (unplanned)
```

A record carries the `action`, the `binding` it ran under, the `tick`, and — when the action was part of a plan — the `planRecord` (see [Plans](./plans)). Read the binding with `record.binding.resolve('Y')`.

## From a fact back to its cause

The other direction: start from a fact and ask what produced it. `engine.why` (from [Provenance](./provenance)) now returns an `action-effect` instead of `given`:

```javascript
engine.why('helped(bob, carol)');
// [ { type: 'asserted', tick: 0, provenance: { type: 'action-effect', actionRecord: ... } } ]
```

Follow the `actionRecord` to the action that caused it:

```javascript
for (const event of engine.why('helped(bob, carol)')) {
  if (event.provenance?.type === 'action-effect') {
    const ar = event.provenance.actionRecord;
    console.log(`caused by "${ar.action.name}" at tick ${ar.tick}`);
  }
}
// caused by "offer help" at tick 0
```

The same holds for the numeric effect: `engine.why('friendship(bob, carol)')` shows the original `given` value *and* the `+5` adjustment stamped with the action that made it. Nothing was instrumented to get this — recording is what `execute` does by default.

## There's more on the record

An `ActionRecord` can also carry a **utility breakdown** (the scored reasons it was chosen) and a reified **occurrence** (a queryable event, minted with `execute(candidate, { recordOccurrence: true })`). Those are beyond the quickstart:

→ [Action records reference](../action-records) · [Provenance reference](../provenance)

Next: [reach a goal with a plan →](./plans)
