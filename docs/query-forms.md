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

`predicate(args) > N`, `>= N`, `< N`, `<= N`, `= N`, or `!= N` compares the current numeric value directly against a threshold.

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

## Predicate-to-predicate comparison

Either side of a comparison can be another predicate instead of a literal, so you can relate two facts directly. `==` is accepted as a synonym for `=`.

**Numeric vs numeric** — both operands must be `numeric` or `sensor-numeric`. All operators (`>`, `>=`, `<`, `<=`, `=`, `!=`) apply:

```klugh
rule "the stronger party intimidates the weaker"
  knows(?X, ?Y)
  ^ health(?X) > health(?Y)
  => intimidates(?X, ?Y) += 1.0
```

**Boolean vs boolean** — operands may be stored `boolean`, `derived`, or boolean `sensor` predicates; only `=` and `!=` apply. Each side resolves to a three-valued state — **true** (positive belief present), **false** (explicit disbelief present), or **unknown** (neither). Comparison is *state-equality*: `=` holds when both sides share the same state (including `unknown = unknown`), `!=` when they differ. `derived` and `sensor` operands are total — they resolve to **true**/**false** and never **unknown**.

```klugh
rule "reciprocity mismatch breeds resentment"
  knows(?X, ?Y)
  ^ trusts(?X, ?Y) != trusts(?Y, ?X)
  => resents(?X, ?Y) += 1.0
```

Variables in either operand are enumerated and the comparison filters the bindings, so neither side needs to be anchored by a separate positive predicate — though boolean comparison ranges over every entity combination, so anchor it (as above) when you don't intend a full cross-product.

::: warning Cost of derived/sensor operands
A `derived` operand runs a full backward-chaining proof every time the comparison is evaluated, and the comparison is evaluated once per enumerated binding. An *unanchored* boolean comparison with a derived operand therefore proves the derivation across the entire entity cross-product — potentially expensive. Anchor the comparison with a cheap positive premise (as in the example) so the binding space is narrowed before the derivation runs.
:::

Operands must be the same kind: numeric (`numeric`, `sensor-numeric`) or boolean (`boolean`, `derived`, `sensor`). Mixing kinds is rejected at load, as are ordering operators (`>`, `>=`, `<`, `<=`) on boolean operands.

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

## Aggregate

`fn|pred(args)| op rhs` computes an aggregate function over a numeric predicate across enumerated entities, then compares the result. Functions: `avg`, `sum`, `max`, `min`. Operators: `>`, `>=`, `<`, `<=`, `=`, `!=`. Use `_` for positions being enumerated; the type is inferred from the schema.

```klugh
rule "well-regarded when the average warmth among coworkers is high"
  avg|warmth(_, ?SELF) ^ coworker(_, ?SELF)| > 60
  => wellRegarded(?SELF) += 1.0

rule "someone is admired when their warmth exceeds average"
  warmth(?X, carol) > avg|warmth(_, carol)|
  => aboveAverageAdmirer(?X)

rule "carol is admired more than bob overall"
  avg|warmth(_, carol)| > avg|warmth(_, bob)|
  => moreAdmiredThanBob(carol)
```

**Group filtering** — add boolean predicates to the conjunction inside the pipes with `^`. Boolean predicates (including tier checks) act as filters; the one numeric predicate provides the values.

```klugh
avg|warmth(_, carol) ^ knows(_, carol)|  // average warmth among agents who know carol
avg|warmth(_, carol) ^ trust.high(_, carol)|  // average warmth among high-trust agents
```

**Wildcard sharing** — all `_` positions of the same entity type across the conjunction map to a single enumeration variable, so `warmth(_, carol) ^ knows(_, carol)` iterates one agent at a time through both predicates. `_` positions of different entity types each get their own variable.

**Aggregate as value expression** — an aggregate can appear on either side of any comparison, or on both sides. The result is the raw computed value (avg/sum/max/min), compared to a literal, a numeric predicate, or another aggregate.

**Empty match set** — if no entities contribute a value (all filtered out), the aggregate returns `null` and the comparison is `false` for all operators. Exception: `sum` is also `null` for an empty set (not 0).

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

The first step of a chain can carry a `[history: N]` window to restrict how far back the initial event is looked for:

```klugh
rule "recent betrayal followed by apology"
  betrayed(?X, ?Y) [history: 10] then apologized(?X, ?Y)
  => goodwill(?Y, ?X) += 3
```

Without `[history: N]`, the first step matches any assertion in the full history.

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
