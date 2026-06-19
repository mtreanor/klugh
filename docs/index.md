# klugh

A logic engine built for authorship. Describe relationships, beliefs, and history in a readable rule language; the engine evaluates them against an evolving world and tells you what follows.

```klugh
rule "kindness warms friendship"
  helped(?X, ?Y)
  => friendship(?Y, ?X) += 5

rule "forgiveness follows demonstrated change"
  hadConflict(?Y, ?SELF) then helped(?SELF, ?Y)
  ^ |helped(?SELF, _)| >= 2
  ^ not trusts(?Y, ?SELF)
  ^ friendship.cold(?Y, ?SELF)
  ^ readyToForgive(?Y, ?SELF)
  => friendship(?Y, ?SELF) += 8
```

Rules read like intent. Write hundreds of them and you get emergent behavior — social physics shaped by authored intuition, not hand-coded case logic.

---

## What it's built for

**Social simulation** — Characters with private beliefs, shared histories, and social norms encoded as rules. Behavior emerges from their interaction; no agent is hard-coded.

**Procedural content generation** — Score candidate content against world state and select whatever fits the moment. Dialogue lines, scene beats, encounters, items — any set of authored pieces ranked by how well they match current conditions.

**Interactive narrative** — Track what happened, who knows what, and what each agent believes. Drive story events by querying accumulated state rather than scripting sequences.

**Dialogue and response selection** — Agents reason from their own private fact stores. Two characters can hold incompatible beliefs about the same event and respond accordingly.

**Epistemic agent modeling** — Distinguish *knowing*, *believing*, *disbelieving*, and *not knowing*. An agent can simultaneously hold a belief and its negation under a permissive contradiction policy.

**Relationship and reputation systems** — Trust, affinity, faction standing as mutable numeric predicates with named tiers, queryable and rulable at any granularity.

**Rules-based worldbuilding tools** — Codify the internal logic of a world — social norms, institutional rules, physical laws — as authored predicates and let them run.

**Any domain where declarative rules should drive behavior over time** — education, ecology, economics, organizational modeling, autonomous agents.

---

## Designed for explanation

A klugh world is fully auditable. Every fact records why it exists — which rule asserted it, which action caused it, what utility motivated the choice. Every action record carries a utility breakdown tracing the score back to the predicates and rules that drove it. When an action fires as part of a plan, the plan record is carried on the action record, so the chain from intent to effect is always traversable.

This is a first-class design goal, not an afterthought. The interesting things that happen in a klugh world — emergent behaviors, unexpected interactions, narrative turns — should always be explainable after the fact. Every mechanism that produces state also produces the record of how and why it produced that state.

→ [Provenance](provenance.md) · [Action records](action-records.md) · [Plans](plans.md)

Runnable demo: `node examples/landing-page-demo.js` — simulates the scenario above and prints `why` / `explain` for `friendship(carol, alice)` through rule effects, action effects, derived premises, and private-store justifications.

---

klugh grew out of 15 years of social simulation research — [Comme il Faut, Ensemble, Game-O-Matic, and ESP](history.md) — and the recurring frustration of wanting a system expressive enough to capture social nuance yet simple enough to author at scale. This is that system.

[Quickstart →](quickstart/) · [Language overview](overview.md) · [History](history.md)
