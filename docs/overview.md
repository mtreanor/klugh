# klugh for logic programmers

klugh is a Datalog-style rule engine with four extensions that don't appear together in any standard system: a temporal fact store, four-valued negation, per-entity epistemic stores, and graded truth scoring.

---

## The base

The core is recognisable Datalog: conjunctive rule bodies, no function symbols, typed variables enumerated from a closed domain, closed-world assumption, and both forward chaining (rules fired to fixpoint) and backward chaining (derived predicates proved on demand). If you know Datalog, the rule syntax is immediately readable.

---

## What is different

### Mutable store with full event history

Unlike Datalog (monotonic) and unlike Prolog's `assert/retract` (which just adds or removes), klugh maintains an append-only event log. Every assertion and retraction is recorded with a tick. This means you can query not just current state but historical state:

```
exploited(?X, ?Y) [history]       // was this ever true?
exploited(?X, ?Y) [history: 5]    // was it true within the last 5 ticks?
exploited(?X, ?Y) then[3] trusts(?X, ?Y)  // did these happen in order, within 3 ticks?
```

Facts can also be backdated at load time (`[at: -10]`), establishing prior history without replaying a simulation.

### Four-valued negation

Standard Datalog has NAF. klugh has four distinct operators:

| Operator | Meaning |
|----------|---------|
| `pred` | positive belief is present |
| `-pred` | explicit disbelief is present (stored fact, not mere absence) |
| `not pred` | positive belief is absent (NAF) |
| `~pred` | positive absent OR explicit disbelief present |

`-pred` is a stored fact — asserting `-trusts(alice, bob)` is different from the absence of `trusts(alice, bob)`. Under the default `lastWins` contradiction policy `~pred` and `not pred` are equivalent, but under `allow` policy both `pred` and `-pred` can coexist, making the store genuinely paraconsistent (in the Belnap sense). This matters when modeling agents that hold contradictory beliefs.

### Per-entity epistemic stores

Every entity can have a private fact store, separate from the shared world store. Predicates are routed to a store by owner prefix:

```
?SELF.perceivedThreat(?Y, ?SELF)   // query SELF's private store
alice.friendship.strong(bob, alice) // ground owner, tier query
```

Each private store has its own contradiction policy. This gives you a natural model for agent belief states that are subjective, incomplete, and potentially inconsistent — without polluting the world store.

### Graded truth and importance weighting

Conditions in a rule can carry importance weights. When a conjunction is only partially satisfied, the system computes a `satisfactionScore` — the ratio of satisfied importance to total importance. This is not theorem proving; it is closer to utility scoring. The application decides whether to fire on partial satisfaction and how to use the degree:

```
rule "guilt lingers"
  knows(?SELF, ?Y)          [importance: 1.0]
  ^ exploited(?SELF, ?Y) [history]    [importance: 3.0]
  ^ trusts(?SELF, ?Y)       [importance: 1.0]
  => respectful(?SELF, ?Y) += 5.0
```

`evaluateDegrees()` exposes this for queries too, returning every binding ranked by how well it satisfies the conjunction — useful for ranking options rather than filtering to a binary yes/no.

---

## What is absent

No function symbols. No disjunctive heads. No stable model semantics. No general-purpose constraint solving. klugh is decidable and procedurally evaluated against a single world — it is not trying to find a model, it is maintaining one.

---

## The niche

klugh is designed for applications that need to track evolving, time-stamped belief states across multiple agents with private perspectives, and to query or score those states with nuance that binary logic cannot express. The combination of temporal history, paraconsistent epistemic stores, and graded truth in a Datalog-shaped system is the specific thing it offers that no standard logic programming language does.
