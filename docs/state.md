# State files

State is declared in a dedicated `state` file (not inside rule files). The file contains one or more blocks:

- `world` — the shared fact store
- `private <name>` — the private store for a named entity

```klugh
world
  knows(alice, bob)
  knows(alice, carol)
  hasNeed(alice, "companionship")
  friendship(alice, bob) = 85
  exploited(alice, carol) [tick: -5]
  -wantsContact(alice)

private alice
  perceivedThreat(carol, alice) [strength: 0.85]
  -perceivedThreat(carol, alice) [strength: 0.3]

private bob
  friendship(alice, bob) = 40
```

Facts inside a `private` block are written to that entity's store — no owner prefix is needed in the block body. The two `perceivedThreat` entries for alice coexist because her store has `allow` contradiction policy (see [Private stores](private-stores.md)).

---

## State operations

These operations appear in state files and on the RHS of rules.

| Syntax | Effect |
|--------|--------|
| `pred(args)` | Assert positive belief |
| `-pred(args)` | Assert explicit disbelief |
| `not pred(args)` | Retract positive belief |
| `not -pred(args)` | Retract explicit disbelief |
| `pred(args) = N` | Set a numeric value |
| `pred(args) += N` | Adjust a numeric value by +N |
| `pred(args) -= N` | Adjust a numeric value by −N |
| `new entity(type[, name\|?var])` | Create an entity at runtime (see [Actions → new entity](actions.md#new-entity)) |
| `remove entity(type, name\|?var)` | Remove an entity from the registry (see [Actions → remove entity](actions.md#remove-entity)) |
| `record(?var)` | Mint an action occurrence (action effects only; see [Actions → Occurrences](actions.md#occurrences)) |

`not` on the RHS means "make absent" — the same meaning it carries on the LHS. Each LHS check has a mirrored RHS effect with identical syntax.

### Single-valued assertions

If a predicate is declared [`singleValued`](schema.md#singlevalued), a positive assert sets the one value held at its key, superseding any prior value there (governed by the store's contradiction policy). A negated assert only rules out its exact value, so disbeliefs accumulate until a positive value sweeps them. Superseded values stay in history:

```klugh
world
  feels(zeke, anxious)   // zeke's mood is anxious…
  feels(zeke, hopeful)   // …now hopeful; anxious survives only in history
  -feels(una, anxious)   // una is not anxious…
  -feels(una, grieving)  // …and not grieving — both disbeliefs coexist
```

---

## Strength

Every fact carries a strength value from 0.0 to 1.0. If omitted, strength defaults to **1.0**. Specify strength with a `[strength: N]` annotation after the assertion:

```klugh
perceivedThreat(carol, alice) [strength: 0.85]
friendship(bob, alice) = 85 [strength: 0.9]
knows(alice, bob)                  // strength 1.0
```

Strength is stored on the fact record and is available to application layers; it does not affect whether a boolean predicate evaluates as true.

Strength applies to assertions and `=` value sets, not to `+=`/`-=` adjustments — an adjustment is a delta, not a stored belief, so `[strength: N]` on a `+=`/`-=` is a parse error.

---

## Backdating

A fact can be backdated to a specific tick using `[tick: N]`. Negative ticks represent history before the simulation started. Backdating is how you establish prior events that rules can look back on.

```klugh
world
  exploited(alice, carol) [tick: -5]
  hadConflict(alice, carol) [tick: -1]
```

`[tick: N]` and `[strength: N]` are independent annotations that stack in any order: `exploited(alice, bob) [tick: -30] [strength: 0.75]` and `exploited(alice, bob) [strength: 0.75] [tick: -30]` are equivalent.

---

## String arguments

String literals are enclosed in double quotes and are compared by value.

```klugh
world
  hasNeed(alice, "companionship")
  hasKnowledge(bob, "philosophy")
```
