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
