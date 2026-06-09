# Logic Layer

The foundation of the engine. Pure symbolic reasoning with no knowledge of agents, decisions, or beliefs. Everything here is plumbing — sensible engineering choices are fine.

## Responsibilities

- Store and query facts (`FactStore`, `Fact`, `FactRecord`)
- Declare what can be true (`PredicateSchema`)
- Evaluate rules against world state (`RuleEvaluator`, predicate classes)
- Run inference to fixpoint (`ForwardChainer`, `BackwardChainer`)
- Apply state changes (`StateOperation`, `applyStateChange`)
- Parse the rule DSL (`DSLParser`, `RuleParser`, `RuleLoader`)

## Key classes

### World

`World` is the shared container passed around during a simulation tick. It holds:
- `factStore` — the shared `FactStore` for world-level facts
- `privateStores: Map<entityName, FactStore>` — per-entity stores for private beliefs
- `entityRegistry: Map<type, entity[]>` — typed roster used for variable enumeration
- `queryHandlers` — named registry of `QueryHandler` instances
- `tickTracker` — shared `{ currentTick }` object

`world.createEvaluationContext()` packages all of the above into an `EvaluationContext` passed to predicates during evaluation.

### FactStore

Append-only log of `FactRecord` objects. Every `assert` and `retract` is recorded with tick timestamps — full temporal history is preserved.

Key methods:
- `assert(fact, strength)` — adds a record; enforces `contradictionPolicy` if set
- `retract(fact)` — sets `retractedAt` on the most recent active matching record
- `query(name, ...args)` — returns currently active matching facts (null args are wildcards)
- `queryAt(tick, ...)` — point-in-time query
- `wasEverTrue(name, ...args)` — spans full history
- `wasEverTrueInWindow(name, args, window, currentTick)` — recency-bounded historical query
- `getStrength / setStrength` — read/write the `strength` field on the active record
- `containsNegated(name, ...args)` — checks for an active explicit-negation record

**Contradiction policy** (per-store): `lastWins` (default), `allow`, or `block`.

### Fact and FactRecord

`Fact(name, ...args, { negated, value })` is the data object. `negated: true` marks an explicit disbelief (classical negation). `FactRecord` wraps a `Fact` with `assertedAt`, `retractedAt`, and `strength`.

### PredicateSchema

Loaded from `predicates.json`. Declares every predicate that can be asserted, including type (`boolean`, `historical`, `numeric`, `derived`), argument types, whether it is `symmetric`, and for numerics: `minValue`, `maxValue`, `default`, and named tiers. `RuleLoader` enforces the schema at load time.

A `symmetric` predicate treats both argument orderings as equivalent: asserting `knows(alice, bob)` means queries for `knows(bob, alice)` also return true, and contradiction detection checks both orderings. Only one direction needs to be declared in the state file.

### Rule

`Rule(name, predicateEntries, effects)`. Each `predicateEntry` is `{ predicate, importance }` where `importance` (default 1.0) governs partial-truth weighting. `effects` is a list of `StateOperation` objects.

### RuleEvaluator

`evaluate(rules, entityRegistry, evaluationContext, startingBinding, schema)` returns a `Map<Rule, RuleApplication[]>`.

For each rule it:
1. Collects logical variables and infers their types from the schema
2. Generates all candidate bindings (Cartesian product of entity registries, filtered by `?SELF` pre-binding)
3. Evaluates each predicate against the binding via `evaluationContext`
4. Computes `truthDegree = satisfiedImportance / totalImportance`
5. Keeps applications above the `minimumTruthDegree` threshold

For variables with no schema type entry (e.g. string need values), the evaluator scans the fact store for distinct values at the relevant argument position rather than failing.

### Predicate types

| Class | Syntax | Description |
|-------|--------|-------------|
| `FactPredicate` | `pred(args)` | Currently active positive fact |
| `ExplicitNegationPredicate` | `-pred(args)` | Currently active negated fact |
| `NegationPredicate` | `not pred(args)` | Absence of a positive fact (NAF) |
| `WeakNegationPredicate` | `~pred(args)` | Absent OR explicitly disbelieved |
| `HistoricalWindowPredicate` | `hadX(args) within N` | Ever asserted within tick window |
| `DerivedFactPredicate` | derived predicate name | Resolved via `DerivedFactQueryHandler` |
| `NumericTierPredicate` | `pred.tier(args)` | Numeric value falls within a named tier |
| `NumericComparisonPredicate` | `pred(args) > N` | Direct numeric comparison |
| `CurrentTimePredicate` | `currentTime in [a,b]` | Current time in range |
| `CountPredicate` | `count(pred, var) >= N` | Count of matching facts |
| `TemporalChainPredicate` | multi-step temporal sequence | Chain of events in order |
| `PrivatePredicate` | `?VAR.pred(args)` | Queries the private store of the bound entity |

Variables inside negation predicates are not enumerated — they must already be bound by positive predicates.

### Query architecture

Predicates never query `FactStore` directly. Each predicate calls `evaluationContext.getHandler(name)` to retrieve a `QueryHandler` by name, then asks it questions in terms of the predicate's own domain language.

| Handler | Name | Source |
|---------|------|--------|
| `FactStoreQueryHandler` | `'factStore'` | In-memory `FactStore` |
| `ExternalAPIQueryHandler` | `'externalAPI'` | Outside the system (e.g. current time) |
| `DerivedFactQueryHandler` | `'derived'` | Sub-query via backward chaining |
| `NumericStateQueryHandler` | `'numericState'` | `NumericStateStore` (numeric values) |

New sources of truth are added by registering new handlers on `World`.

### ForwardChainer

Runs rules to fixpoint via a callback. Has no side effects — all decisions about what to assert belong to the caller's `onApplication` callback. Returns `true` from the callback to signal a new conclusion was committed and trigger another pass.

### BackwardChainer

Finds proof paths for a target conclusion. `findAll: true` returns all grounded paths; `findAll: false` returns on first proof (used by `DerivedFactQueryHandler`). Maximum depth is 8. No assertions.

### DerivationRule and DerivedFactQueryHandler

`DerivationRule` (loaded via `DerivationRuleLoader`) defines computed facts — conclusions derivable from premises via backward chaining. `DerivedFactQueryHandler` calls `BackwardChainer` to resolve them at query time. Derivation rules are declared in a `definitions` file (`.viv`-style DSL, `define` keyword).

### State operations

`StateOperation` is the unit of world mutation. Types: `assert`, `retract`, `adjust-numeric`. `applyStateChange(operation, binding, queryHandlers, options)` executes one operation. `StateChangeQueue` batches operations for deferred flush.

## DSL

Rules, actions, and definitions are all authored in a small DSL parsed by `DSLParser`. `RuleParser` builds `Rule` objects; `RuleSerializer` round-trips them back to DSL text for display. `RuleLoader` wires schema validation into loading.

Predicate syntax recap:
- `pred(args)` — positive fact
- `-pred(args)` — explicit disbelief
- `not pred(args)` — absence (NAF)
- `?SELF.pred(args)` — private store query
- `pred.tier(args)` — numeric tier
- `^` — conjunction separator between premises
- `=>` — separates LHS from conclusion
