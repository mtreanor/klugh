# Query forms

These predicate forms are valid in rule LHS conjunctions, queries, `define` definitions, and action preconditions. Multiple predicates are joined by `^`.

For negation operators (`-pred`, `not pred`, `~pred`, `not -pred`), see [Negation](negation.md). For private-store owner prefixes, see [Private stores](private-stores.md).

---

## Boolean fact

The default. True if the predicate is currently asserted in the relevant store.

```klugh
knows(?SELF, ?Y)
hasKnowledge(?Y, "karate")
?SELF.perceivedThreat(?SELF, ?OTHER)
```

---

## Historical

Adding `[history]` makes a predicate true if the fact was ever asserted, even if later retracted.

```klugh
rule "guilt when SELF has previously exploited Y"
  knows(?SELF, ?Y)
  ^ exploited(?SELF, ?Y) [history]
  => respectful(?SELF, ?Y) += 5.0
```

---

## Historical window

`[history: N]` restricts the historical check to the last N ticks.

```klugh
rule "remorse sharpens when exploitation was recent"
  knows(?SELF, ?Y)
  ^ exploited(?SELF, ?Y) [history: 3]
  => respectful(?SELF, ?Y) += 2.0
```

---

## Numeric tier

`predicate.tier(args)` is true when the predicate's current value falls within the named tier's range. Tiers are declared in the schema.

```klugh
rule "warmth toward someone when friendship is strong"
  knows(?SELF, ?Y)
  ^ friendship.strong(?SELF, ?Y)
  => respectful(?SELF, ?Y) += 3.0

?X.friendship.strong(?Y, ?X)    // tier query against ?X's private store
```

---

## Numeric value comparison

`predicate(args) > N`, `>= N`, `< N`, `<= N`, or `= N` compares the current numeric value directly against a threshold.

```klugh
rule "desperate when mood is very low"
  knows(?SELF, ?Y)
  ^ mood(?SELF) <= 20
  => exploitative(?SELF, ?Y) += 2.0

rule "confident when mood is high"
  knows(?SELF, ?Y)
  ^ mood(?SELF) >= 80
  => respectful(?SELF, ?Y) += 1.0
```

---

## Count

`|predicate(args)| > N` counts how many entity combinations satisfy the inner predicate, then compares the count to a threshold. Supports `< N`, `= N`, `>= N` as well. Use `_` for the positions being counted over.

```klugh
rule "popular when many agents feel warm toward SELF"
  |friendship.warm(_, ?SELF)| > 3
  => confident(?SELF) += 2.0

rule "isolated when SELF knows fewer than two agents"
  |knows(?SELF, _)| < 2
  => cautious(?SELF, ?Y) += 1.0
```

The type of each `_` position is inferred from the predicate schema, so non-agent entities (knowledge domains, items, etc.) are enumerated correctly.

---

## Temporal chain

`pred1 then pred2` is true when both predicates were asserted in that order (with any gap). `then[N]` tightens the window to N ticks between assertions.

```klugh
rule "awareness of moral failure follows exploitation"
  knows(?SELF, ?Y) then exploited(?SELF, ?Y)
  => cautious(?SELF, ?Y) += 1.5

rule "exploitation followed by respect, and history is honoured now"
  exploited(?SELF, ?Y) then[5] treatedWithRespect(?SELF, ?Y)
  ^ respectsHistory(?SELF, ?Y)
  => considerate(?SELF, ?Y) += 3.0
```

`then` binds tighter than `^`. A chain like `A then B ^ C` means `(A then B) ^ C`.

Temporal chains with private-store predicates are not supported.

---

## Importance

`[importance: N]` assigns a weight to a predicate in the LHS. When a rule is only partially satisfied, its contribution is scaled by the ratio of satisfied importance to total importance. Unweighted predicates have importance 1.

```klugh
rule "complex judgment"
  knows(?SELF, ?Y) [importance: 2.0]
  ^ exploited(?SELF, ?Y) [history]
  ^ friendship.strong(?SELF, ?Y) [importance: 0.5]
  => respectful(?SELF, ?Y) += 4.0
```
