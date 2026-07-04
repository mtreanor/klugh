# Negation

The system provides four negation operators, each with a distinct meaning. Understanding the difference between them — particularly between *absence* and *active disbelief* — is central to writing correct rules.

---

## Positive (no operator)

True when the positive belief is **currently asserted** in the relevant store.

```klugh
knows(?SELF, ?Y)
```

---

## Explicit negation (`-pred`)

True when an **explicit disbelief** is currently present — a fact stored with `negated: true`. On the LHS this tests for the presence of that disbelief; on the RHS it asserts one.

```klugh
rule "back off when contact is explicitly declined"
  knows(?SELF, ?Y)
  ^ -wantsContact(?Y)
  => away(?SELF, ?Y) += 5.0
```

Explicit disbelief is a stored fact, not just the absence of positive belief. A world where neither `wantsContact(alice)` nor `-wantsContact(alice)` is present is different from a world where `-wantsContact(alice)` has been actively asserted.

---

## Negation as failure (`not pred`)

True when the **positive belief is absent** from the store — regardless of whether explicit disbelief is present. On the RHS, `not pred` retracts the positive belief.

```klugh
rule "lean in when no hostility is on record"
  knows(?SELF, ?Y)
  ^ not hostile(?SELF, ?Y)
  => toward(?SELF, ?Y) += 1.5
```

NAF does not distinguish between "not known to be true" and "known to be false". It fires whenever the positive form is missing.

---

## Not-negated (`not -pred`)

True when **no explicit disbelief** has been asserted — regardless of whether positive belief is present. On the RHS, `not -pred` retracts the explicit disbelief.

```klugh
rule "approach unless explicitly refused"
  knows(?SELF, ?Y)
  ^ not -wantsContact(?Y)
  => toward(?SELF, ?Y) += 0.5
```

This fires for anyone who has not been explicitly marked as not wanting contact.

---

## Weak negation (`~pred`)

True when the **positive belief is absent OR explicit disbelief is present**. On the LHS only — there is no RHS form for weak negation.

```klugh
rule "cautious when trust is unconfirmed"
  knows(?SELF, ?Y)
  ^ ~trusts(?Y, ?SELF)
  => away(?SELF, ?Y) += 2.0
```

Under `lastWins` contradiction policy, asserting `-pred` always retracts `pred`, so `not pred` and `~pred` behave identically. The difference emerges under `allow` policy, where both can coexist — `~pred` then fires even when `pred` is present (as long as `-pred` is also there), while `not pred` does not. See [Private stores](private-stores.md#contradiction-policy).

---

## Summary

| Operator | LHS: fires when | RHS: effect |
|----------|----------------|-------------|
| `pred` | positive belief present | assert positive belief |
| `-pred` | explicit disbelief present | assert explicit disbelief |
| `not pred` | positive belief absent | retract positive belief |
| `not -pred` | explicit disbelief absent | retract explicit disbelief |
| `~pred` | positive absent OR explicit disbelief present | (LHS only) |

---

## Variable binding and negation

Variables inside a negation predicate must already be bound by a positive predicate earlier in the conjunction — they are not enumerated. This applies to `not`, `-`, and `~`.

```klugh
rule "correct — ?Y is already bound by knows"
  knows(?SELF, ?Y)
  ^ not hostile(?SELF, ?Y)
  => toward(?SELF, ?Y) += 1.5

rule "incorrect — ?Z would never be bound"
  not hostile(?SELF, ?Z)    // ?Z is unbound — always evaluates false
  => ...
```

This is the standard *safety* (range-restriction) condition that Datalog and ASP enforce. klugh flags it at **load time**: a rule with a variable that appears only inside a negation, with no positive premise to bind it, emits a warning naming the variable (it will never fire unless that variable is supplied via a starting binding). The runtime — the rule yielding no applications — is the secondary safety net, mirroring how cycle detection warns at load and falls back to a runtime guard.
