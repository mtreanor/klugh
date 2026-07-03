# Tick binding — design proposal

Status: **implemented.** This document is the record of the design conversation; the shipped behavior is documented in `docs/query-forms.md` and `docs/semantics.md`. It landed as six ordered commits: the `.inner` cycle-detector fix; the rename (`[at:]`→`[tick:]`, `[history: N]`→`[asserted-during: N]`, bare `[history]`→`[ever]`) plus the new relative `[ago: N]`; the state-range `[during: N]`; the event-enumeration `[when: ?t]`; named wildcards (`_name`, with bare `_` made anonymous in aggregates); and aggregate `[when: _t]`. Two decisions differ from the draft below: bare `[history]` was replaced by a dedicated `[ever]` keyword (not retired), and the wildcard breaking change was done in a single pass rather than sequenced.

---

## Motivation

klugh has no way to bind *when* a fact became true to a variable. Every existing temporal query form is boolean — it answers yes/no and throws the tick away. The concrete symptom already lives in this codebase: `data/reception/self-state-rules.klugh`'s `ticksAlone` is a hand-rolled counter (a declared numeric predicate, a reset rule, an increment rule) built entirely to work around not being able to ask "how long has this been true" directly. `FactRecord` already carries full assertion/retraction history with tick timestamps — the data exists, nothing in the DSL exposes it as a value.

What this unlocks that the shadow-counter pattern can't:

- **Retrofitting** — querying *when* on a predicate nobody thought to instrument in advance. The counter pattern requires declaring the shadow predicate before you need it.
- **Comparing recency across enumerated candidates** — "which of ?x's friends did they meet first" needs two bound ticks compared against each other; `then[N]` chains can't do this, they're a fixed named sequence, not a comparison over enumerated bindings.
- **Counting how many times a relationship cycled on and off** — genuinely inexpressible today. A monotone counter can't distinguish "been true 40 ticks straight" from "went true/false four times." Backtracking over every historical assertion tick answers this directly.

---

## Baseline: what already exists

| Form | Predicate class | Mechanism | Shape |
|---|---|---|---|
| `pred(args) [history]` | `HistoricalWindowPredicate`, `window: null` | `FactStore.wasEverTrueAtOrBefore` — any assertion event at or before now | boolean |
| `pred(args) [history: N]` | `HistoricalWindowPredicate` | `FactStore.wasEverTrueInWindow` — an assertion **event** with tick in `[currentTick-N, currentTick]` | boolean |
| `pred(args) [at: N]` (N a literal) | `AtTickPredicate` | `evaluationContext.withTick(N)` → ordinary evaluation → `containedAt`/`isActiveAt` — **state**, was it true at that tick | boolean |
| `pred1 then[N] pred2` | `TemporalChainPredicate` | walks `getAssertionTicks` per step, checks ordering/gaps, discards the ticks once satisfied | boolean |
| `currentTime in [a,b]` | `CurrentTimePredicate` | external time source | boolean |

The one finding worth flagging from this audit: **`[history: N]` is event-based, not state-based, despite reading like a state check.** `wasEverTrueInWindow` requires an *assertion event* inside the window — a fact asserted once, long ago, and never retracted will return `false` for `[history: N]` even though it's been continuously true the entire window. This surprised the design conversation itself partway through (a proposed rename to `since` was walked back specifically because "since" reads as continuous state but the implementation checks discrete events). It's the reason this proposal splits state and event queries into visibly different keywords rather than trying to preserve `history`'s name.

Also load-bearing for scope: `FactStore.getAssertionTicks(name, args)` already returns **every** historical assertion tick for a fact, not just the latest — reassertions after retraction included. This is the exact "list of ticks something was true" primitive the whole proposal is built on, and it requires zero changes.

---

## The five query forms

Two axes: **state** (was the fact *true*) vs. **event** (did the fact *become* true), and **point** vs. **range** vs. **enumerate**.

| Keyword | Axis | Question | Mechanism |
|---|---|---|---|
| `[tick: N]` | state, absolute point | was this true *at* tick N | rename of `AtTickPredicate` / `[at: N]` — unchanged mechanism |
| `[ago: N]` | state, relative point | was this true N ticks *before now* | new — resolves to `currentTick - N`, then identical to `[tick:]` |
| `[during: N]` | state, range | was this true at *any point* in the last N ticks, regardless of when it was actually asserted | new — see below |
| `[asserted-during: N]` | event, range | did this get *asserted* at some point in the last N ticks | rename + narrowed docs for `[history: N]`'s existing mechanism, unchanged |
| `[when: ?t]` | event, enumerate | bind `?t` to *every tick* this became true | new — see below |

`[history]` (bare, unbounded) is retired along with the rename; `wasEverTrueAtOrBefore` is still needed but no longer has DSL surface — `[asserted-during: N]` with a large enough N, or a plain unbracketed predicate reference (current truth), cover the practical cases. Worth a final check before implementation whether anything actually needs "ever, unbounded" as distinct from both of those.

An operation deliberately **not** given a keyword: "was this asserted at exactly tick N" (event, point). It's a degenerate, filtered case of enumeration — `pred(args) [when: ?t] ^ ?t = N` — not worth dedicated syntax.

### Worked example

`friends(x,y)` asserted at tick 2, evaluated at tick 30, no retraction:

```
friends(x,y) [tick: 4]    → true   (isActiveAt(4): last event ≤4 is asserted@2)
friends(x,y) [ago: 20]    → true   (resolves to tick 10, same check)
friends(x,y) [during: 35] → true   (window [-5,30] overlaps active interval [2,30])
```

Same fact, but **retracted at tick 15**, evaluated at tick 30:

```
friends(x,y) [tick: 20]            → false  (last event ≤20 is retracted@15)
friends(x,y) [ago: 5]              → false  (resolves to tick 25, same as above)
friends(x,y) [during: 35]          → true   (active interval [2,15) overlaps window [-5,30])
friends(x,y) [asserted-during: 35] → true   (assert@2 falls in [-5,30]; retract isn't an assertion event)
friends(x,y) [when: ?t]            → binds ?t = 2 only (one assertion event; retraction produces no binding)
```

This is the case that actually separates `during` from `tick`/`ago`: at a *specific* recent point (or even a narrower recent window), they're currently not friends. But somewhere in the last 35 ticks, they were — `during` is the only one of the three that says so, because it doesn't care that the state later flipped back off.

---

## `[during: N]` — new state-range query

Doesn't exist today; `[history: N]`'s name suggested it but its implementation doesn't provide it. Needs a new `FactStore` method that reconstructs active intervals from a record's event log (pair consecutive `asserted`/`retracted` events into `[start, end)` spans, treating "not yet retracted" as open-ended at `currentTick`) and checks whether any interval overlaps `[currentTick-N, currentTick]`. Same data source as everything else (`FactRecord.events`), same complexity class (O(events for that fact)), no new storage.

## `[asserted-during: N]` — rename only

Mechanically identical to today's `[history: N]`; only the name and its documentation change, to stop it reading as a state check. `data/stress/rules`, `data/demo-volition/*`, `data/landing-page-demo/*`, and several docs/tests use `[history`/`[at:` today — grepped exhaustively, **zero occurrences in `data/reception/`**, so this migration is entirely contained to klugh's own demo/stress/test fixtures (~64 `[history` hits, ~52 `[at:` hits across those files, none in the actual project this engine serves). `[at: N]`'s two current parser paths — state-file seeding (`applyStateModifiers`, `allowTick`-gated) and rule-condition evaluation (`parseBracketModifiers`) — are read/write sides of the same "absolute tick" concept, so one rename covers both; no separate keyword needed for the seeding side.

## `[when: ?t]` — new event-enumeration query

`getAssertionTicks(name, resolvedArgs)` is reused as-is. The new work is entirely in the binding/enumeration layer:

- `parseBracketModifiers`'s `at`/`tick` key needs to accept an unbound `VARIABLE` token, distinct from `[tick: N]`'s literal-only path, producing a new predicate (working name `WhenPredicate`) rather than reusing `AtTickPredicate`.
- **Enumeration ordering.** `?t`'s candidate ticks depend on its sibling args in the same predicate call already being resolved (`getAssertionTicks` needs concrete args) — unlike ordinary `agent`/`group`-typed variables, which are independently enumerable from `entityRegistry.get(type)` in any order. This makes tick variables the one *dependent* kind `RuleEvaluator.generateAllBindings` has to handle. Resolution: a one-time topological sort of `variablesToEnumerate`, gated behind "does this rule contain a tick variable at all" so rules without one take today's code path unchanged. The sort always succeeds — tick variables are never a prerequisite for anything else, so they're always sinks in the dependency graph, never intermediate nodes, so no cycle is possible by construction.
- **Semantics when confirmed:** enumerates discrete assertion *events* (bounded by reassertion count, typically small), not every tick the fact was continuously active (which would scale with how long the fact has been true — unbounded, and nobody in this design wants it). Reusing an already-bound `?t` (e.g. the same variable appearing in two `[when:]`-annotated predicates) becomes a boolean check via `FactRecord.wasAssertedAt(tick)`, not `AtTickPredicate`'s "evaluate as of this tick" (state) semantics — those are different questions and must not be conflated.
- `inferVariableTypes` already has a generic descent case for wrapped predicates (added for `AtTickPredicate`'s `.inner`) — only needs one addition: register the unbound tick variable as type `'tick'`.
- **Bugfix found in passing, worth bundling into this work:** `RuleCycleDetector.walkScoped` descends into `predicate.predicate` and `predicate.innerPredicate` for wrapped predicates, but `AtTickPredicate` (and by extension the new predicate) stores its wrapped predicate as `.inner` — a field name `walkScoped` never checks. This is a live, pre-existing blind spot (`data/stress/rules:121` uses `[at: -25]` on a real rule condition today, invisibly to cycle detection), not something this proposal introduces, but the new predicate would inherit it unless `walkScoped` also descends through `.inner`.

### Aggregate integration (`count|... [when: _t] ...|`)

Depends on the wildcard-naming work below — `_` can't provide the identity needed for a tick counting-variable without it. Once named wildcards exist, `AggregatePredicate.computeValue` needs a second *kind* of counting variable alongside today's type-pool kind: one keyed by `(predicateName, args)` and enumerated via `getAssertionTicks` instead of `entityRegistry.get(type)`, with the same combination-order dependency as the non-aggregate case. Gated the same way — an aggregate with no tick-kind counting variable takes today's flat `cartesian(entityLists)` path unchanged.

This is the piece that makes the original motivating "on-and-off friends" query expressible:

```klugh
rule "on-and-off friends don't get full trust"
  count|friendsWith(?SELF, ?OTHER) [when: _t]| > 3
  => trust(?SELF, ?OTHER) -= 10
```

---

## Aggregate wildcard consistency

Separate from tick binding, surfaced while designing it, but it's a prerequisite for using `[when:]` inside aggregates.

**The problem, with two real examples, not hypothetical ones:**

```
count|knows(?SELF, _) ^ trusts(?SELF, _)| >= 1
```
(from `docs/query-forms.md`) — both `_`s are `agent`-typed, so `rewriteAggregateArgs` joins them into one shared variable: this counts "knows and trusts the *same* person," not "knows someone and trusts someone (possibly different)."

```
count|?SELF.embarrassedThemselves(_, _) ^ inGroup(?SELF, _)| >= 1
```
(`engagement-mode-rules.klugh:240,244`, live in the reception scenario) — `embarrassedThemselves(agent, group)`'s two `_`s stay separate (different types), but its `group`-typed slot joins with `inGroup`'s `group`-typed `_`. That join is load-bearing: it's what makes the rule mean "someone embarrassed themselves in a group ?SELF is currently in," not "in some group, anywhere."

So: identity is currently inferred from **entity type**, shared across the whole conjunction — the only place in klugh where two things are treated as "the same" because they happen to share a type, rather than because an author wrote the same name. Everywhere else in the language, identity is name-based.

**Proposal:** named wildcards, `_name` — two occurrences of the same name join (validated to agree on inferred entity type; error if not), different names never join regardless of type.

**Sequencing to avoid regression, recommended but not yet confirmed:**
1. *Additive step* — add `_name` as new syntax. Bare `_` keeps today's type-joining behavior unchanged. Zero regression; both examples above keep working with no edits.
2. *Consistency step, separate and deferred* — bare `_` becomes always-fresh (matching name-based identity everywhere else in the language), requiring the two examples above to be rewritten with explicit shared names (`embarrassedThemselves(_, _g) ^ inGroup(?SELF, _g)`). Real but small, fully auditable migration (exactly two rule instances plus one doc example, confirmed by exhaustive grep — no other multi-`_`-same-type aggregate usage exists anywhere in the codebase).

Parser note: `_` lexes as a dedicated `WILDCARD` token today, distinct from identifiers (`_` immediately followed by an ident character currently falls through to normal identifier scanning) — needs a real `NAMED_WILDCARD` token. `rewriteAggregateArgs` (`RuleLoader.js`) needs its `typeToVar: Map<entityType, var>` restructured to `nameToVar: Map<name, var>` for the named case. `ActionParser.js` has its own separate, duplicated aggregate-parsing path (confirmed by the commit that fixed derived-predicate support inside `count|...|`) — any grammar change here needs applying twice.

---

## Performance

klugh parses `.klugh` source once at `loadRules`/`loadActions` time into a `Predicate` object tree; `ForwardChainer` evaluates that tree every tick without reparsing. So grammar/AST additions — new tokens, new predicate classes, new wildcard shapes — cost nothing at evaluation time for rules that don't use them; there's no code path connecting "the grammar exists" to "cost is paid," short of the feature actually appearing in a given rule.

The one part that does run every tick, every pass, per rule — confirmed uncached (`collectVariables()`/`inferVariableTypes()` recompute from scratch on every call) — is `RuleEvaluator.buildRuleApplications`. The tick-variable enumeration branch slots into a dispatch point (`variableTypes.get(name)` → choose an enumeration source) that already runs per-variable today; a `type === 'tick'` branch there costs non-tick variables nothing, they hit the exact line they hit now. Same argument for `AggregatePredicate.computeValue`'s counting-variable loop. The topological sort needed for enumeration ordering is gated behind "does this rule contain a tick variable at all," so it's skipped entirely, not just cheap, for every rule that doesn't use one of these forms.

---

## Open items before implementation — resolved

- **Unbounded "ever".** A dedicated `[ever]` keyword was kept rather than folding it into `[asserted-during: big]`. Because unbounded event and state checks coincide (a fact can only have been true if it was at some point asserted), `[ever]` reuses `wasEverTrueAtOrBefore` unchanged and the bare-`[history]` fixtures migrated to it behaviour-preservingly.
- **Wildcard sequencing.** Done in one pass: `_name` added *and* bare `_` made anonymous in the same change. No klugh data fixture relied on the old type-join; the two klugh tests and the doc examples that did were migrated in the same commit. The sibling reception project's `engagement-mode-rules` still relies on the old join and must migrate to a named wildcard when it re-vendors klugh.
- **`.inner` cycle fix.** Shipped first, as its own independent commit, ahead of the tick-binding predicates that all wrap via `.inner`.
- **Docs & fixtures.** `docs/query-forms.md`, `docs/semantics.md`, `docs/sensors.md`, `AGENTS.md`'s predicate table, and every demo/stress/landing-page fixture were migrated alongside the code.
