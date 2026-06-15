# klugh

A logic engine built for authorship. Describe relationships, beliefs, and history in a readable rule language; the engine evaluates them against an evolving world and tells you what follows.

```klugh
rule "forgiveness follows demonstrated change"
  hostile(?SELF, ?Y) then helped(?SELF, ?Y)
  ^ |helped(?SELF, _)| >= 2
  => trusts(?Y, ?SELF) += 5.0
  => ?Y.perceivedChange(?SELF) += 3.0
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

klugh grew out of 15 years of social simulation research — [Comme il Faut, Ensemble, Game-O-Matic, and ESP](history.md) — and the recurring frustration of wanting a system expressive enough to capture social nuance yet simple enough to author at scale. This is that system.

[Quickstart →](quickstart.md) · [Language overview](overview.md) · [History](history.md)
