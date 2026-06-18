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
  exploited(alice, carol) [at: -5]
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

`not` on the RHS means "make absent" — the same meaning it carries on the LHS. Each LHS check has a mirrored RHS effect with identical syntax.

---

## Strength

Every fact carries a strength value from 0.0 to 1.0. If omitted, strength defaults to **1.0**. Specify strength with a `[strength: N]` annotation after the assertion:

```klugh
perceivedThreat(carol, alice) [strength: 0.85]
friendship(bob, alice) = 85 [strength: 0.9]
knows(alice, bob)                  // strength 1.0
```

Strength is stored on the fact record and is available to application layers; it does not affect whether a boolean predicate evaluates as true.

---

## Backdating

A fact can be backdated to a specific tick using `[at: N]`. Negative ticks represent history before the simulation started. Backdating is how you establish prior events that rules can look back on.

```klugh
world
  exploited(alice, carol) [at: -5]
  hadConflict(alice, carol) [at: -1]
```

`[at: N]` and `[strength: N]` are independent annotations that stack in any order: `exploited(alice, bob) [at: -30] [strength: 0.75]` and `exploited(alice, bob) [strength: 0.75] [at: -30]` are equivalent.

---

## String arguments

String literals are enclosed in double quotes and are compared by value.

```klugh
world
  hasNeed(alice, "companionship")
  hasKnowledge(bob, "philosophy")
```
