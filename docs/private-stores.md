# Private stores

An entity type opts in to private stores by setting `"privateStore": true` at the type level in `entities.json`. Every instance of that type receives its own fact store, separate from the shared world store.

```json
{
  "agent": {
    "privateStore": true,
    "alice": {},
    "bob":   {}
  }
}
```

Per-entity configuration lets you set a contradiction policy for individual entities:

```json
{
  "agent": {
    "alice": {},
    "bob":   {},
    "dana":  { "privateStore": { "active": true, "contradictionPolicy": "allow" } }
  }
}
```

When the `privateStore` key is an object, `"active": true` creates the store and `"contradictionPolicy"` sets the policy. When it is just `true`, the store is created with the default `lastWins` policy.

---

## Contradiction policy

A **contradiction** occurs when both `pred(args)` and `-pred(args)` are simultaneously active in the same store. Three policies govern what happens when `assert` would create a contradiction:

| Policy | Behaviour |
|--------|-----------|
| `lastWins` | The new assertion retracts the opposing fact. Most recent belief stands. **Default.** |
| `allow` | Both may coexist. No automatic resolution. |
| `block` | If the opposing fact is present, the new assertion is silently ignored. |

The **world store** is always `lastWins` by default. Override it with a top-level `"world"` key in `entities.json`:

```json
{
  "world": { "contradictionPolicy": "allow" },
  "agent": { "alice": {} }
}
```

The `"world"` key is reserved and is not treated as an entity type.

`allow` is the right choice for stores that represent an agent holding uncertain or conflicting beliefs — the agent's reasoning layer is responsible for resolving contradictions, not the store. Under `lastWins`, `~pred` and `not pred` behave identically (asserting `-pred` automatically removes `pred`). The difference between those two operators only matters under `allow`, where both can coexist. See [Negation](negation.md#weak-negation-pred).

---

## Owner prefix syntax

A predicate is prefixed with an owner to query that entity's private store instead of the shared world store. Without a prefix, the predicate queries the **world** store.

The prefix is either:
- a logical variable followed by `.` (e.g. `?X.`), or
- a concrete entity name followed by `.` (e.g. `alice.`) when the name is a known entity

```klugh
?SELF.perceivedThreat(?Y, ?SELF)       // variable owner
alice.perceivedThreat(carol, alice)    // ground owner
?X.friendship.strong(?Y, ?X)          // tier query against ?X's private store
```

---

## Negation in private stores

All four negation operators work with private-store predicates. Place `-` before the owner prefix for explicit negation:

```klugh
rule "private belief: threat perceived"
  ?SELF.hostile(?Y, ?SELF)
  => away(?SELF, ?Y) += 6.0

rule "private explicit negation: threat dismissed"
  -?SELF.hostile(?Y, ?SELF)
  => toward(?SELF, ?Y) += 4.0
```

Under an `allow` contradiction policy, both rules can fire simultaneously for the same (SELF, Y) pair — producing conflicting impulses that reflect genuinely ambivalent belief.

---

## Owner binding

If the owner variable is **unbound** at evaluation time, the predicate is false. The owner is not auto-enumerated — bind it via a positive predicate earlier in the conjunction, or use a ground entity name.

If the named entity has no private store, the predicate is false.

---

## Writing to private stores

State operations in state files or on a rule RHS can target a private store with the same owner prefix:

```klugh
=> ?SELF.perceivedThreat(?SELF, ?Y)
=> ?SELF.friendship(?SELF, ?Y) += 10
=> alice.perceivedThreat(carol, alice) @ 0.8
```

Facts written inside a `private <name>` block in the state file go to that entity's store directly — no owner prefix is needed in the block body.
