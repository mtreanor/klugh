# Logic Language Reference

## What the language supports

**[Predicate types](#predicate-schema)** — [`boolean`](#predicate-types) (storable, negatable), [`derived`](#derived-predicates) (computed by backward chaining, never stored), [`numeric`](#predicate-types) (continuous value with named tiers), [`sensor`](#sensor-predicates) (boolean computed by application-layer code), [`sensor-numeric`](#sensor-predicates) (numeric computed by application-layer code, queryable by tier and comparison).

**[Negation](#negation)** — four operators with distinct semantics:
| Operator | Meaning |
|----------|---------|
| [`pred`](#positive-no-operator) | positive belief is present |
| [`-pred`](#explicit-negation--pred) | explicit disbelief is present |
| [`not pred`](#negation-as-failure-not-pred) | positive belief is absent (NAF) |
| [`~pred`](#weak-negation-pred) | positive absent or explicit disbelief present |
| [`not -pred`](#not-negated-not--pred) | no explicit disbelief has been asserted |

**[Facts](#state-file)** — boolean and explicit-disbelief facts carry a **[strength](#strength)** (0.0–1.0) and can be **[backdated](#backdating)** to a past tick (`[at: N]`). [Symmetric predicates](#symmetric) (`"symmetric": true`) unify both argument orderings.

**[Private stores](#private-store-predicates)** — each entity can have its own fact store, separate from the world store. Predicates are prefixed with an owner (`?SELF.pred(args)`, `alice.pred(args)`) to route queries to that store. Private stores support a configurable **[contradiction policy](#contradiction-policy)** (`lastWins` / `allow` / `block`).

**[Rules and queries](#predicate-forms-in-rules-and-queries)** — conjunctions of predicates joined by `^`. Predicates can be: [boolean facts](#boolean-fact), [explicit negation](#explicit-negation--pred), [NAF](#negation-as-failure-not-pred), [weak negation](#weak-negation-pred), [historical](#historical) (`[history]`, `[history: N]`), [numeric tier](#numeric-tier) (`pred.tier(args)`), [numeric comparison](#numeric-value-comparison) (`pred(args) >= N`), [count](#count) (`|pred(args)| > N`), [temporal chain](#temporal-chain) (`pred1 then pred2`), [private-store prefixed](#private-store-predicates), and [importance-weighted](#importance) (`[importance: N]`).

**[Derived predicates](#derived-predicates)** — reusable named inferences authored as `define` definitions. Evaluated lazily by backward chaining at query time; results cached per tick.

**[REPL](#using-the-repl)** — interactive query prompt with `facts`, `facts all`, `facts <name>`, `assert`, `degree`, and `entities` commands.

---

The logic system uses a plain-text DSL for declaring state and evaluating predicate queries. Predicates and state are parsed by `RuleParser`. The predicate schema (a JSON file) is the single source of truth for what predicates exist and what types their arguments take.

Scenario data for the REPL is wired through `project.config.json`:

| File | Purpose |
|------|---------|
| `predicates.json` | Predicate schema |
| `entities.json` | Entity types and instances |
| `state` | Shared world state and per-entity private state |
| `definitions` | Definitions for derived predicates (optional) |

Predicate syntax, state operations, and query forms are documented here. For how rules and actions drive agent behaviour, see [volition.md](volition.md).

---

## Predicate schema

The schema is a JSON file declaring every predicate the system knows about.

```json
{
  "predicates": {
    "knows":       { "type": "boolean",    "symmetric": true, "args": ["agent", "agent"] },
    "hasNeed":     { "type": "boolean",    "args": ["agent", "string"] },
    "hadConflict": { "type": "boolean",    "args": ["agent", "agent"] },
    "canHelp":     { "type": "derived",    "args": ["agent", "agent"] },
    "mood": {
      "type": "numeric", "args": ["agent"],
      "minValue": 0, "maxValue": 100, "default": 50,
      "tiers": {
        "low":    [0,  40],
        "medium": [40, 70],
        "high":   [70, 100]
      }
    },
    "drive": {
      "type": "numeric", "ephemeral": true,
      "args": ["agent", "agent"],
      "minValue": 0, "maxValue": 999, "default": 0
    }
  }
}
```

Predicate names must not collide with entity type names or entity instance names (validated at load time).

### Predicate types

| Type | Description |
|------|-------------|
| `boolean` | Currently true or false. Stored in a fact store. Supports explicit negation (see below). |
| `derived` | Computed at query time — defined by authored derive rules and/or a code handler. Never stored as a fact. |
| `numeric` | A continuous value in `[minValue, maxValue]`, queryable by named tier or direct comparison. |
| `sensor` | Boolean truth computed on demand by application-layer code. Never stored. See [Sensor predicates](#sensor-predicates). |
| `sensor-numeric` | Numeric value computed on demand by application-layer code. Never stored. Queryable by tier and comparison. See [Sensor predicates](#sensor-predicates). |

### `annotations`

An optional object for application-layer metadata. The logic engine stores and passes it through opaquely — nothing in the core reads it. Application layers can define their own keys here without touching the schema structure.

```json
"toward": {
  "type": "numeric", "args": ["agent", "agent"],
  "minValue": 0, "maxValue": 999, "default": 0,
  "annotations": { "ephemeral": true }
}
```

The volition layer recognises `"ephemeral": true` in `annotations`: all facts of that predicate are cleared at the start of each simulation tick. Works on `boolean` and `numeric` predicates.

### `symmetric`

Setting `"symmetric": true` on a two-argument predicate means that `knows(alice, carol)` and `knows(carol, alice)` are treated as equivalent. Asserting or retracting one direction propagates to the other. Only one direction needs to be declared in the state file.

---

## Entities

Entities are declared in `entities.json`, grouped by type. Each type maps entity names to optional per-instance configuration.

```json
{
  "agent": {
    "privateStore": true,
    "alice": {},
    "bob":   {},
    "carol": {}
  },
  "knowledge": {
    "karate":      {},
    "philosophy":  {}
  }
}
```

### Private stores

An entity type opts in to private stores by setting `"privateStore": true` at the type level. Every instance of that type receives its own fact store, separate from the shared world store.

Per-entity configuration is also supported, which lets you set a contradiction policy (see below) for individual entities:

```json
{
  "agent": {
    "alice": {},
    "bob":   {},
    "dana":  { "privateStore": { "active": true, "contradictionPolicy": "allow" } }
  }
}
```

When the `privateStore` key is an object, `"active": true` creates the store and `"contradictionPolicy"` sets the policy. When it is `true`, the store is created with the default `lastWins` policy.

Private stores support the same predicate types as the world store. Derived predicates receive the scoped store at evaluation time.

### Contradiction policy

A **contradiction** occurs when both `pred(args)` and `-pred(args)` are simultaneously active in the same store. Three policies govern what happens when `assert` would create a contradiction:

| Policy | Behaviour |
|--------|-----------|
| `lastWins` | The new assertion retracts the opposing fact. Most recent belief stands. **Default.** |
| `allow` | Both may coexist. No automatic resolution. |
| `block` | If the opposing fact is present, the new assertion is silently ignored. |

The **world store** is always `lastWins`. This can be overridden in `entities.json` under a top-level `"world"` key:

```json
{
  "world": { "contradictionPolicy": "allow" },
  "agent": {
    "alice": {}
  }
}
```

The `"world"` key is reserved and is not treated as an entity type.

`allow` policy is the right choice for private stores that represent an agent holding uncertain or conflicting beliefs — the agent's reasoning layer is responsible for resolving contradictions, not the store. Under `lastWins`, `~pred` and `not pred` behave identically (asserting `-pred` automatically removes `pred`, so `pred` is always absent when `-pred` is present). The difference between the two operators only matters under `allow`, where both can coexist.

---

## State file

State is declared in a dedicated `state` file (not inside rule files). The file contains one or more blocks:

- `world` — the shared fact store
- `private <name>` — the private store for a named entity

```
world
  knows(alice, bob)
  knows(alice, carol)
  hasNeed(alice, "companionship")
  friendship(alice, bob) = 85
  exploited(alice, carol) [at: -5]
  -wantsContact(alice)

private alice
  perceivedThreat(carol, alice) @ 0.85
  -perceivedThreat(carol, alice) @ 0.3

private bob
  friendship(alice, bob) = 40
```

Facts inside a `private` block are written to that entity's store directly — no owner prefix is needed in the block body. The two `perceivedThreat` entries for alice coexist because her store has `allow` contradiction policy.

### State operations

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

### Strength

Every fact carries a strength value from 0.0 to 1.0. If omitted, strength defaults to **1.0**. Specify strength with `@` after the assertion:

```
perceivedThreat(carol, alice) @ 0.85
friendship(bob, alice) = 85 @ 0.9
knows(alice, bob)                  // strength 1.0
```

Strength is stored on the fact record and is available to application layers; it does not affect whether a boolean predicate evaluates as true.

### Backdating

A fact can be backdated to a specific tick using `[at: N]`. Negative ticks represent history before the simulation started. Backdating is how you establish prior events that rules can look back on.

```
world
  exploited(alice, carol) [at: -5]
  hadConflict(alice, carol) [at: -1]
```

`[at: N]` and `@ strength` can be combined: `exploited(alice, bob) [at: -30] @ 0.75`.

### String arguments

String literals are enclosed in double quotes and are compared by value.

```
world
  hasNeed(alice, "companionship")
  hasKnowledge(bob, "philosophy")
```

---

## Rules (syntax)

Rule files use the same predicate syntax documented below. A rule has a name, a left-hand side (LHS) of predicates joined by `^`, and a right-hand side (RHS) of state operations.

```
rule "R1 — exploit when a need can be met"
  knows(?SELF, ?Y)
  ^ canHaveNeedMet(?SELF, ?Y)
  => exploitative(?SELF, ?Y) += 3.0
```

Rule files contain only `rule` blocks. World and private state belong in the `state` file. How volition interprets rule RHS is described in [volition.md](volition.md).

### Logical variables

Variables begin with `?`. During evaluation the engine searches all possible bindings — assignments of entities to variables — that satisfy the full LHS.

```
rule "shared knowledge deepens respect"
  knows(?SELF, ?Y)
  ^ hasKnowledge(?SELF, ?K)
  ^ hasKnowledge(?Y, ?K)
  => respectful(?SELF, ?Y) += 2.0
```

The logic system has no built-in notion of a "self" or focus agent. Any variable can be pre-bound by the caller before evaluation begins — variables already present in the starting binding are held fixed and not enumerated. `?SELF` is a convention; the volition layer pre-binds it to the agent whose turn it is.

### Binding constraints

When the engine searches bindings, two constraints apply:

**Distinct variables.** Two different logical variables of the same entity type (e.g. `?X` and `?Y` both ranging over agents) cannot be assigned the same entity. So `knows(?X, ?Y)` never generates `?X = alice, ?Y = alice`.

**Distinct arguments within one predicate.** For a single predicate occurrence, two argument positions with the same schema type cannot resolve to the same entity. This applies to literals as well as variables: in `knows(alice, ?Y)`, `?Y` cannot be `alice`.

These rules follow from argument types in the schema (`agent`, `knowledge`, `item`, …). Positions typed as `string` are not compared to each other for distinctness.

### Wildcards

`_` (underscore) is an anonymous variable — it matches any entity but is not bound and cannot be referenced elsewhere in the rule.

```
rule "cautious when self has any unmet need"
  knows(?SELF, ?Y)
  ^ hasNeed(?SELF, _)
  => cautious(?SELF, ?Y) += 1.0
```

---

## Negation

The system provides four negation operators, each with a distinct meaning.

### Positive (no operator)

True when the positive belief is **currently asserted** in the relevant store.

```
knows(?SELF, ?Y)
```

### Explicit negation (`-pred`)

True when an **explicit disbelief** is currently present — a fact stored with `negated: true`. On the LHS of a rule or in a query this tests for the presence of that disbelief; on the RHS of a rule it asserts one.

```
rule "back off when contact is explicitly declined"
  knows(?SELF, ?Y)
  ^ -wantsContact(?Y)
  => away(?SELF, ?Y) += 5.0
```

Explicit disbelief is a stored fact, not just the absence of positive belief. A world where neither `wantsContact(alice)` nor `-wantsContact(alice)` is present is different from a world where `-wantsContact(alice)` has been actively asserted.

### Negation as failure (`not pred`)

True when the **positive belief is absent** from the store — regardless of whether explicit disbelief is present. On the RHS, `not pred` retracts the positive belief.

```
rule "lean in when no hostility is on record"
  knows(?SELF, ?Y)
  ^ not hostile(?SELF, ?Y)
  => toward(?SELF, ?Y) += 1.5
```

NAF does not distinguish between "not known to be true" and "known to be false". It fires whenever the positive form is missing.

### Not-negated (`not -pred`)

True when **no explicit disbelief** has been asserted — regardless of whether positive belief is present. On the RHS, `not -pred` retracts the explicit disbelief.

```
rule "approach unless explicitly refused"
  knows(?SELF, ?Y)
  ^ not -wantsContact(?Y)
  => toward(?SELF, ?Y) += 0.5
```

This fires for anyone who has not been explicitly marked as not wanting contact.

### Weak negation (`~pred`)

True when the **positive belief is absent OR explicit disbelief is present**. On the LHS only — there is no RHS form for weak negation.

```
rule "cautious when trust is unconfirmed"
  knows(?SELF, ?Y)
  ^ ~trusts(?Y, ?SELF)
  => away(?SELF, ?Y) += 2.0
```

Under `lastWins` policy, asserting `-pred` always retracts `pred`, so `pred` is never present when `-pred` is present. In that mode `~pred` and `not pred` behave identically. The difference emerges under `allow` policy, where both can coexist — `~pred` then fires even when `pred` is present (as long as `-pred` is also there), while `not pred` does not.

### Summary

| Operator | LHS: fires when | RHS: effect |
|----------|----------------|-------------|
| `pred` | positive belief present | assert positive belief |
| `-pred` | explicit disbelief present | assert explicit disbelief |
| `not pred` | positive belief absent | retract positive belief |
| `not -pred` | explicit disbelief absent | retract explicit disbelief |
| `~pred` | positive absent OR explicit disbelief present | (LHS only) |

### Variable binding and negation

Variables inside a negation predicate must already be bound by a positive predicate earlier in the conjunction — they are not enumerated. This applies to `not`, `-`, and `~`.

```
rule "correct — ?Y is already bound by knows"
  knows(?SELF, ?Y)
  ^ not hostile(?SELF, ?Y)
  => toward(?SELF, ?Y) += 1.5

rule "incorrect — ?Z would never be bound"
  not hostile(?SELF, ?Z)    // ?Z is unbound — always evaluates false
  => ...
```

---

## Private-store predicates

A predicate can be prefixed with an owner to query (or write to) that entity's private store instead of the shared world store.

```
?SELF.perceivedThreat(?Y, ?SELF)       // variable owner
alice.perceivedThreat(carol, alice)    // ground owner
?X.friendship.strong(?Y, ?X)          // tier query against ?X's private store
```

The prefix is either:

- a logical variable followed by `.` (e.g. `?X.`), or
- a concrete entity name followed by `.` (e.g. `alice.`) when the name is a known entity and not a predicate name

Without a prefix, the predicate queries the **world** store.

### Negation in private stores

All four negation operators work with private-store predicates. To check for explicit disbelief inside an owner's store, place `-` before the owner prefix:

```
rule "private belief: threat perceived"
  ?SELF.hostile(?Y, ?SELF)
  => away(?SELF, ?Y) += 6.0

rule "private explicit negation: threat dismissed"
  -?SELF.hostile(?Y, ?SELF)
  => toward(?SELF, ?Y) += 4.0
```

Under an `allow` contradiction policy, both can fire simultaneously for the same (SELF, Y) pair — producing conflicting impulses that reflect genuinely ambivalent belief.

### Owner binding

If the owner variable is **unbound** at evaluation time, the predicate is false. The owner is not auto-enumerated — bind it via a positive predicate earlier in the conjunction, or use a ground entity name.

If the named entity has no private store, the predicate is false.

### Writing to private stores

State operations (in state files or rule RHS) can target a private store with the same owner prefix:

```
=> ?SELF.perceivedThreat(?SELF, ?Y)
=> ?SELF.friendship(?SELF, ?Y) += 10
=> alice.perceivedThreat(carol, alice) @ 0.8
```

---

## Predicate forms in rules and queries

### Boolean fact

The default. True if the predicate is currently asserted in the relevant store.

```
knows(?SELF, ?Y)
hasKnowledge(?Y, "karate")
?SELF.perceivedThreat(?SELF, ?OTHER)
```

### Historical

Adding `[history]` after a predicate makes it true if the fact was ever asserted, even if later retracted.

```
rule "guilt when SELF has previously exploited Y"
  knows(?SELF, ?Y)
  ^ exploited(?SELF, ?Y) [history]
  => respectful(?SELF, ?Y) += 5.0
```

### Historical window

`[history: N]` restricts the historical check to the last N ticks.

```
rule "remorse sharpens when exploitation was recent"
  knows(?SELF, ?Y)
  ^ exploited(?SELF, ?Y) [history: 3]
  => respectful(?SELF, ?Y) += 2.0
```

### Numeric tier

`predicate.tier(args)` is true when the predicate's current value falls within the named tier's range. Tiers are declared in the schema.

```
rule "warmth toward someone when friendship is strong"
  knows(?SELF, ?Y)
  ^ friendship.strong(?SELF, ?Y)
  => respectful(?SELF, ?Y) += 3.0

?X.friendship.strong(?Y, ?X)    // tier query against ?X's private store
```

### Numeric value comparison

`predicate(args) > N`, `>= N`, `< N`, `<= N`, or `= N` compares the current numeric value directly against a threshold.

```
rule "desperate when mood is very low"
  knows(?SELF, ?Y)
  ^ mood(?SELF) <= 20
  => exploitative(?SELF, ?Y) += 2.0

rule "confident when mood is high"
  knows(?SELF, ?Y)
  ^ mood(?SELF) >= 80
  => respectful(?SELF, ?Y) += 1.0
```

The same operators work in count predicates: `|knows(?SELF, _)| >= 2`.

### Count

`|predicate(args)| > N` (or `< N`, `= N`) counts how many entity combinations satisfy the inner predicate, then compares the count to a threshold. Use `_` for the positions being counted over.

```
rule "popular when many agents feel warm toward SELF"
  |friendship.warm(_, ?SELF)| > 3
  => confident(?SELF) += 2.0

rule "isolated when SELF knows fewer than two agents"
  |knows(?SELF, _)| < 2
  => cautious(?SELF, ?Y) += 1.0
```

The type of each `_` position is inferred from the predicate schema, so non-agent entities (knowledge domains, items, etc.) are enumerated correctly.

### Temporal chain

`pred1 then pred2` is true when both predicates were asserted in that order (with any gap). `then[N]` tightens the window to N ticks between assertions. Chains can be combined with `^` to require additional current facts:

```
rule "awareness of moral failure follows exploitation"
  knows(?SELF, ?Y) then exploited(?SELF, ?Y)
  => cautious(?SELF, ?Y) += 1.5

rule "exploitation followed by respect, and history is honoured now"
  exploited(?SELF, ?Y) then[5] treatedWithRespect(?SELF, ?Y)
  ^ respectsHistory(?SELF, ?Y)
  => considerate(?SELF, ?Y) += 3.0
```

`then` binds tighter than `^`. A chain like `A then B ^ C` means `(A then B) ^ C` — the chain and `C` must all hold.

Temporal chains with private-store predicates are not supported.

### Importance

`[importance: N]` assigns a weight to a predicate in the LHS. Importance affects partial truth: when a rule is only partially satisfied, its contribution is scaled by the ratio of satisfied importance to total importance.

```
rule "complex judgment"
  knows(?SELF, ?Y) [importance: 2.0]
  ^ exploited(?SELF, ?Y) [history]
  ^ friendship.strong(?SELF, ?Y) [importance: 0.5]
  => respectful(?SELF, ?Y) += 4.0
```

---

## Derived predicates

Derived predicates let you name a reusable inference — a conjunction of conditions that implies something else — and refer to it in rules and queries as if it were an ordinary boolean predicate. They are **not stored as facts**. Each query is answered by backward chaining over definitions at evaluation time.

### Schema declaration

Every derived predicate must be declared in the schema with `"type": "derived"` and an argument list, like any other predicate:

```json
"canPair":        { "type": "derived", "args": ["agent", "agent"] },
"canHaveNeedMet": { "type": "derived", "args": ["agent", "agent"] }
```

A derived predicate cannot be asserted or retracted in a state file. Its truth is always computed from other predicates.

### Definitions

Logic for derived predicates is authored in a dedicated `definitions` file. The file contains only `define` blocks — no `rule` blocks and no state. Definitions use the **same predicate syntax** as rule LHS conjunctions: boolean facts, negation, historical modifiers, numeric tiers, numeric comparisons, counts, temporal chains, and private-store prefixes.

A definition has a name, a body of premises joined by `^`, and a **conclusion** — a single derived predicate call — after `=>`:

```
define "can pair — strong friendship"
  knows(?X, ?Y)
  ^ friendship.strong(?X, ?Y)
  => canPair(?X, ?Y)

define "can pair — by bond threshold"
  knows(?X, ?Y)
  ^ bond(?X, ?Y) >= 40
  => canPair(?X, ?Y)

define "can have need met"
  canPair(?X, ?Y)
  ^ hasNeed(?X, ?N)
  ^ canSatisfy(?Y, ?X, ?N)
  => canHaveNeedMet(?X, ?Y)

define "close contact — near and acquainted"
  near(?X, ?Y)
  ^ knows(?X, ?Y)
  => closeContact(?X, ?Y)
```

**Requirements:**

- The conclusion must be a predicate declared as `"type": "derived"` in the schema. Load fails if the conclusion is any other type.
- The conclusion is a plain predicate call — no importance modifier, no `[history]`. Owner prefixes are supported: `=> ?X.canPair(?X, ?Y)` creates a private-conclusion definition that is only invoked when querying that predicate via `?X.canPair(...)`. World-level and private-conclusion definitions for the same predicate are stored and looked up separately. Any premise that needs to query a private store must carry an explicit owner prefix (`?X.pred(args)`); no store scope is inherited from the caller.
- Premises support every predicate form documented above, including **sensor predicates** (both boolean and numeric).
- Multiple definitions may share the same conclusion (multi-head). The predicate is true if **any** matching definition can be proved.

The `definitions` file is loaded at startup (alongside state) when a `definitions` path is configured in `project.config.json`. The logic REPL loads it automatically when the file is present.

### Inference and caching

Evaluation is **lazy**: derived facts are not materialized into a store each tick. When a query asks whether `canHaveNeedMet(alice, bob)` holds, the engine:

1. Finds definitions whose conclusion unifies with the query
2. Attempts to prove each premise, recursively through other derived predicates if needed
3. Returns true if any definition succeeds

Results are **cached for the current tick**, keyed by store scope and ground arguments, so repeated queries within the same tick do not re-run the proof. The cache clears when the tick advances.

Cycle detection prevents infinite recursion when definitions refer to each other circularly — a cyclic proof returns false.

### Using derived predicates in rules and queries

In rules, queries, and the REPL, a derived predicate looks identical to a boolean fact:

```
rule "can exploit if need can be met"
  knows(?SELF, ?Y)
  ^ canHaveNeedMet(?SELF, ?Y)
  => exploitative(?SELF, ?Y) += 3.0
```

The outer evaluator enumerates free variables and calls the derived handler with each candidate binding. Chaining is transparent: `canHaveNeedMet` may depend on `canPair`, which may depend on `knows` and `friendship.strong`, without any special syntax.

### Private stores

Definition premises always query the **world store** unless they carry an explicit owner prefix. No store scope is inherited from the caller — querying `alice.canPair(alice, bob)` gives the same result as `canPair(alice, bob)` because definitions are global and the caller's context does not pass through.

To read from a specific entity's private store inside a definition, use an explicit owner prefix on the premise:

```
define "can pair by alice's private view"
  alice.knows(?X, ?Y)
  ^ alice.friendship.strong(?X, ?Y)
  => canPair(?X, ?Y)
```

Definitions are global — one set per scenario, shared by all agents.

### String and unbound variables in definition bodies

When a premise contains an unbound variable whose schema type has no entity registry (e.g. `?N` in `hasNeed(?X, ?N)` where the second argument is `string`), the prover discovers candidate values from the active fact store — the distinct values that appear in asserted facts for that predicate and argument position.

### Code handler fallback

For predicates that do not fit Horn-clause definitions (e.g. graph algorithms, external computation), a JavaScript handler can be registered at startup via `DerivedFactQueryHandler.define(name, fn)`. **Authored definitions take precedence**: the code handler is used only when no definitions exist for that predicate name.

### What derived predicates are not

- **Not facts** — asserting `canPair(alice, bob)` in a state file is invalid; derived predicates are never written to a store.
- **Not volition rules** — definitions produce true/false at query time. They do not contribute tag weights or select actions (see [volition.md](volition.md)).

---

## Sensor predicates

Sensors are predicates whose truth is computed by application-layer code at evaluation time rather than looked up in a fact store. They let rules reason about runtime state — spatial proximity, environmental readings, external signals — that has no natural home in the fact store.

There are two sensor types. They share the same authoring process but expose different interfaces in rules.

### Boolean sensors (`type: "sensor"`)

A boolean sensor evaluates to true or false. In a rule LHS it is written exactly like any other boolean predicate.

**Schema declaration:**

```json
"near": { "type": "sensor", "args": ["agent", "agent"] }
```

**In rules:**

```
rule "approach when nearby"
  near(?SELF, ?Y)
  ^ knows(?SELF, ?Y)
  => toward(?SELF, ?Y) += 3.0
```

### Numeric sensors (`type: "sensor-numeric"`)

A numeric sensor produces a continuous value. In rules it supports the same tier and comparison syntax as a stored `numeric` predicate. The schema must declare the full numeric contract — `minValue`, `maxValue`, `default`, and any tiers.

**Schema declaration:**

```json
"distance": {
  "type": "sensor-numeric",
  "args": ["agent", "agent"],
  "minValue": 0, "maxValue": 999, "default": 999,
  "tiers": {
    "near": [0,  4],
    "far":  [4, 999]
  }
}
```

**In rules:**

```
rule "wariness when far"
  distance.far(?SELF, ?Y)
  ^ knows(?SELF, ?Y)
  => away(?SELF, ?Y) += 2.0

rule "urgency when very close"
  knows(?SELF, ?Y)
  ^ distance(?SELF, ?Y) < 2
  => toward(?SELF, ?Y) += 5.0
```

Tier syntax (`predicate.tier(args)`) and all comparison operators (`>`, `>=`, `<`, `<=`, `=`) work exactly as they do for stored numeric predicates.

### Implementing a sensor

Sensors are implemented in application-layer code by extending the appropriate base class from the logic module:

```javascript
// Boolean sensor
import { Sensor } from '@engine/logic/Sensor.js';

export class NearSensor extends Sensor {
  evaluate([a, b], evaluationContext) {
    // ... compute result
    return { result: dist <= this.threshold, detail: `distance(${a},${b}) = ${dist}` };
  }
}

// Numeric sensor
import { NumericSensor } from '@engine/logic/NumericSensor.js';

export class DistanceSensor extends NumericSensor {
  getValue([a, b], evaluationContext) {
    // ... compute value
    return { value: dist, detail: `distance(${a},${b}) = ${dist}` };
  }
}
```

Sensors are registered on the `SensorQueryHandler` at world-setup time:

```javascript
sensorHandler.register('near', new NearSensor());
sensorHandler.registerNumeric('distance', new DistanceSensor());
```

The `detail` string is snapshotted into `SensorProvenance` at the moment the rule is evaluated — not re-evaluated when inspecting history later.

Any runtime context a sensor needs (agent positions, external API responses, etc.) should be made available through the `evaluationContext` via a dedicated `QueryHandler` registered on the world. Sensors should not hold mutable world-state directly.

### Limitations

Sensors are stateless and ephemeral — they have no persistent record in any fact store. This rules out all predicate forms that depend on stored history or stored negation:

| Feature | Works with sensors? | Reason |
|---------|-------------------|--------|
| Plain positive use in rule LHS | ✓ | |
| Numeric tier (`pred.tier(args)`) | ✓ sensor-numeric only | |
| Numeric comparison (`pred(args) >= N`) | ✓ sensor-numeric only | |
| Importance weighting (`[importance: N]`) | ✓ | |
| Binding generation (unbound variables) | ✓ | Variables are enumerated by the rule evaluator and the sensor is called per candidate |
| As premise in `define` | ✓ | Sensor predicates are valid premises in `define` blocks — evaluated through backward chaining like any other premise |
| `[history]` / `[history: N]` | ✗ | Requires a stored fact record |
| `then` (temporal chain) | ✗ | Requires historical assertion timestamps |
| Explicit negation (`-pred`) | ✗ | Explicit disbelief is a stored fact; sensors have no storage |
| Negation as failure (`not pred`) | ✗ | Absence-from-store is undefined for sensors |
| Weak negation (`~pred`) | ✗ | Combination of the two forms above |
| `not -pred` | ✗ | Requires stored negation record |
| Count (`\|pred\|`) | ✗ | Counts scan the fact store |
| Private-store prefix (`?X.pred(...)`) | ✗ | Private stores are fact stores; sensors route through the `sensor` handler |
| State operations (assert / adjust / retract) | ✗ | Sensors are read-only from the logic layer |
| As `define` conclusion | ✗ | The conclusion of a `define` must be `type: "derived"`; sensor predicates cannot be derived predicates |

Sensors cannot be asserted or retracted in state files. Their value is always computed fresh.

---

## Using the REPL

Run `npm run demo` to open an interactive query prompt against the active scenario in `project.config.json`. Queries are predicate conjunctions using the same syntax as rule LHS predicates. Variables are enumerated; binding constraints above apply.

### Commands

| Command | Description |
|---------|-------------|
| *(query)* | Strict query — all predicates must hold |
| `degree …` | Partial satisfaction scoring |
| `as <name>: …` | Query from an entity's private-store perspective |
| `facts` | Print the shared world store |
| `facts <name> [<name> …]` | Print one or more entity private stores |
| `facts all` | Print world store and all private stores |
| `assert <operation>` | Assert or retract a fact in the world store |
| `entities` | List all entities by type (`*` = has private store) |

### Strict queries (default)

Without a prefix, every predicate in the conjunction must hold. Only fully satisfied bindings are printed.

```
> knows(?X, ?Y)
  ?X = alice, ?Y = bob
  ?X = alice, ?Y = carol
  — 4 results

> knows(alice, ?Y) ^ friendship.strong(alice, ?Y)
  ?Y = bob
  — 1 result

> -wantsContact(?X)
  ?X = alice
  — 1 result

> not -wantsContact(?X)
  ?X = bob
  ?X = carol
  — 2 results

> alice.perceivedThreat(carol, alice)
  true
```

To inspect private facts directly, use `facts alice` or query with a ground owner.

```
> facts alice
[alice]
  perceivedThreat("carol", "alice") @ 0.85
  -perceivedThreat("carol", "alice") @ 0.30

> entities
* — private store

[agent]
  alice *
  bob
  carol
```

### Truth degree (`degree` prefix)

Prefix a line with `degree` to score each candidate binding by partial satisfaction (the same weighted-average satisfaction score used when evaluating rules), instead of requiring every predicate to hold.

```
> degree knows(alice, ?Y) ^ friendship.strong(alice, ?Y)
  ?Y = bob  —  1.00 (100%)
    knows(alice, bob) ✓  friendship.strong(alice, bob) ✓
  ?Y = carol  —  0.50 (50%)
    knows(alice, carol) ✓  friendship.strong(alice, carol) ✗
  — 2 bindings
```

Bindings with satisfaction score 0 are omitted from REPL output. The REPL does not load named rules from scenario rule files — only the conjunction you type.

### Asserting facts

The `assert` command runs a state operation against the world store. The same syntax as state files applies, including explicit negation and numeric operations.

```
> assert -wantsContact(alice)
  ok

> assert not knows(alice, bob)
  ok

> assert bond(alice, bob) += 10
  ok
```

Tab completion is available: predicate names at the top level, entity names and variables inside parentheses, tier names after a dot.
