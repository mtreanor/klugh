# Klugh Authoring Idioms

Recurring patterns for modelling common scenarios in klugh.

---

## Private stores as epistemic containers

Treat an agent's private store as implicitly wrapping every fact in `knows(...)`. A fact in Alice's store like `likes(alice, "manilow")` should be read as *Alice believes that Alice likes Manilow* — not as a shared world-fact about Alice.

This means:

- Facts in the world store are **shared, objective** (or at least intersubjectively agreed).
- Facts in a private store are **the owning agent's beliefs** about those facts.
- The same predicate can appear in the world store and in multiple private stores with different values or strengths — representing genuine disagreement between agents.

### Knowledge transfer

Transfer a belief from one agent's store to another's using a rule whose effect writes into the receiver's private store:

```
rule "knowledge transfer"
  teaches(?SENDER, ?RECEIVER, ?TOPIC)
  ^ ?SENDER.likes(?X, ?TOPIC)
  => ?RECEIVER.likes(?X, ?TOPIC)
```

The transferred fact's provenance records the rule name and tick, capturing *how* the belief was acquired. If secondhand knowledge should be weaker than firsthand knowledge, set an explicit strength on the rule effect (e.g., `@ 0.7`).

---

## Argmax: find the entity with the highest value

There is no dedicated `argmax` syntax. Instead, combine a numeric predicate comparison with a `max` aggregate on the right-hand side:

```klugh
rule "identify carol's biggest admirer"
  warmth(?X, carol) = max|warmth(_, carol)|
  => biggestAdmirer(carol, ?X)
```

`?X` is enumerated over all agents. Only the agents whose `warmth` toward carol equals the aggregate maximum survive, so the rule fires once per agent tied at the top. Ties are included — this finds *all* entities that achieve the maximum, not just one.

### Wrapping argmax in a derived predicate

For readability and reuse, wrap the pattern in a `define` block:

```klugh
define "most admiring agent"
  warmth(?X, ?Y) = max|warmth(_, ?Y)|
  => mostAdmires(?X, ?Y)
```

Downstream rules and queries can then simply say `mostAdmires(?X, carol)` without restating the aggregate.

### Argmin works the same way

```klugh
define "least admiring agent"
  warmth(?X, ?Y) = min|warmth(_, ?Y)|
  => leastAdmires(?X, ?Y)
```
