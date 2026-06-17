# Actions

Actions are named, scoreable, executable units of behaviour. Unlike rules — which fire automatically at fixpoint — actions represent authored choices. The application layer enumerates candidates, scores them against the current world state, and decides which to execute.

An action file contains only `action` blocks:

```klugh
action "offer help"
  roles: ?SELF, ?Y
  preconditions
    knows(?SELF, ?Y)
    ^ not hostile(?SELF, ?Y)
  utility
    friendship(?SELF, ?Y)
    rule "need bonus"
      hasNeed(?Y, _)
      => 3.0
  content text: "?SELF offers to help ?Y"
  effects
    helpful(?SELF, ?Y)
    toward(?SELF, ?Y) += 5
```

---

## `roles:`

Optional. A comma-separated list of variable names for the action's participants.

```klugh
roles: ?SELF, ?Y
```

Roles are metadata for the application layer — they indicate which variables the caller should pre-bind before scoring. The engine does not enforce or validate them.

---

## `info:`

Optional. A list of facts that describe the action *itself*. Each action with an `info:` block is registered as an entity of type `action`, and its info facts are asserted into the world fact store — so the action catalog becomes queryable with ordinary klugh queries.

Inside an `info:` block, the variable `?this` refers to the action being defined. Because `?this` sits in subject position like any query variable, each declaration reads exactly like the query that would later find it:

```klugh
action "give"
  roles: ?SELF, ?Y
  info:
    tag(?this, generous)
    tag(?this, social)
    targets(?this, agent)
  effects
    gave(?SELF, ?Y)
```

This asserts `tag(give, generous)`, `tag(give, social)`, and `targets(give, agent)`, and registers `give` as an `action` entity.

### Querying the catalog

Once actions describe themselves, finding actions by spec is just querying — with partial bindings and full enumeration for free:

```javascript
interp.query('tag(?a, social)');                    // every action tagged social
interp.query('tag(?a, social) ^ tag(?a, generous)'); // actions that are both
interp.query('targets(?a, agent) ^ not tag(?a, aggressive)');  // NAF works too
interp.query('tag(?a, ?t)', { a: 'give' });          // enumerate one action's tags
```

The facts are ordinary facts, so they are **mutable** — `assert`/`retract` a tag at runtime to reclassify an action (e.g. a social norm shifts and `insult` is no longer `aggressive`).

### Rules

- **`?this` only.** Info facts describe a single action and must be ground; the only variable allowed is `?this`. Any other variable is a load-time error.
- **Plain positive facts.** An `info:` block holds simple `name(args)` facts — no negation, tiers, or comparisons.
- **Predicate and entity-type names must differ.** The info predicate (`tag`) and the entity type of its values cannot share a name. Name the value type distinctly — e.g. predicate `tag` with value type `actionTag` (instances `social`, `generous`, …) — and declare both in your schema/entities. klugh provides the mechanism; the vocabulary is yours.
- **Action names with spaces** (`"share a kind word"`) work as entity names; reference a specific action in a query with a string literal: `tag("share a kind word", social)`.

A runnable example is in `examples/action-info.js`.

---

## `preconditions`

Optional. A conjunction of predicates joined by `^`, using the same syntax as a rule LHS (see [Query forms](query-forms.md) and [Negation](negation.md)). Checked by `action.arePreconditionsMet(binding, ctx)`. When absent, the action is always eligible.

```klugh
preconditions
  knows(?SELF, ?Y)
  ^ not hostile(?SELF, ?Y)
```

The engine does not enforce preconditions automatically. The caller is responsible for checking them before executing an action.

---

## `utility`

Optional. One or more utility sources listed beneath the `utility` keyword. `action.score(binding, entityRegistry, ctx)` evaluates every source and returns their sum. Four source types are available and can be freely mixed in one action.

### Constant

A bare number. Contributes a fixed value regardless of world state.

```klugh
utility
  5.0
```

Negative constants are valid:

```klugh
utility
  -2.0
```

### Predicate

`predicateName(args)`. Reads the current value of a **numeric** predicate for the resolved argument values. If the predicate has no stored value, the schema default is used. Returns 0 when no numeric handler is registered.

```klugh
utility
  friendship(?SELF, ?Y)
```

### Rule

`rule "name" predicates… => weight`. Counts how many distinct bindings satisfy the predicate conjunction, then multiplies by the weight. Variables already bound by the caller are held fixed; free variables are enumerated over the entity registry.

```klugh
utility
  rule "knows many"
    knows(?SELF, ?Z)
    => 1.0
```

If `?SELF` is pre-bound and `?Z` is free, this scores 1.0 for each agent `?Z` that `?SELF` knows. Conjunctions work the same as in rules:

```klugh
utility
  rule "need bonus"
    hasNeed(?Y, _)
    ^ not hostile(?SELF, ?Y)
    => 3.0
```

### Aggregate

`aggregator sources…`. One of `sum`, `avg`, `min`, or `max` followed by any number of atomic sources (constants, predicates, rule sources). Aggregate sources cannot be nested.

```klugh
utility
  sum
    friendship(?SELF, ?Y)
    rule "need bonus"
      hasNeed(?Y, _)
      => 3.0
    2.0
```

| Aggregator | Behaviour |
|------------|-----------|
| `sum` | Total of all sources. Empty list → 0. |
| `avg` | Mean of all sources. Empty list → 0. |
| `min` | Smallest value. Empty list → 0. |
| `max` | Largest value. Empty list → 0. |

`sum`, `avg`, `min`, and `max` are reserved as aggregator keywords and cannot be used as predicate names in a utility block.

---

## `content`

Optional. A single content item attached to the action.

Currently the only content type is `text`:

```klugh
content text: "?SELF offers to help ?Y"
```

`TextContentItem.render(binding)` substitutes uppercase variable references (e.g. `?SELF`, `?Y`) with their bound values. Entity objects render as their `.name` string. Unbound variable placeholders are left unchanged. Access the item via `action.content` — returns `null` when absent.

---

## `effects`

Optional. One or more state operations using the same syntax as a rule RHS (see [State files](state.md#state-operations)). Applied immediately by `action.execute()` or staged by `action.enqueue()`. When absent, `action.effects` is an empty array.

```klugh
effects
  helpful(?SELF, ?Y)
  toward(?SELF, ?Y) += 5
  not hostile(?SELF, ?Y)
```

All effect types are valid: assert, retract (`not pred`), explicit disbelief (`-pred`), set-numeric (`= N`), adjust-numeric (`+= N` / `-= N`), and private-store prefixed variants (`?OWNER.pred(args)`).

---

## Loading actionsets

Declare named actionsets in `project.config.json` under your scenario:

```json
{
  "active": "my-scenario",
  "scenarios": {
    "my-scenario": {
      "predicates": "data/predicates.json",
      "entities":   "data/entities.json",
      "state":      "data/state",
      "actionsets": {
        "dialogue": "data/actions/dialogue",
        "combat":   "data/actions/combat"
      }
    }
  }
}
```

All actionsets are loaded at `Interpreter` construction time. Score one by name:

```javascript
const candidates = interp.scoreActionset('dialogue', { SELF: 'alice' });
// candidates: [{ action, binding, score }, ...] sorted by score descending
```

`scoreActionset` enumerates all free variables in each action against the entity registry, checks preconditions, sums utility sources, and returns sorted results. The first entry is the highest-scoring eligible candidate.

```javascript
const [best] = interp.scoreActionset('dialogue', { SELF: 'alice' });
if (best) {
  console.log(best.action.content?.render(best.binding) ?? best.action.name);
  best.action.execute(best.binding, interp.world.queryHandlers, null, {
    privateStores: interp.world.privateStores,
  });
}
```

Pass `minimumScore` to filter out low-scoring candidates:

```javascript
const candidates = interp.scoreActionset('dialogue', { SELF: 'alice' }, { minimumScore: 0 });
```

---

## Action API

| Method / property | Description |
|-------------------|-------------|
| `arePreconditionsMet(binding, ctx)` | Returns `true` if every precondition holds for the given binding |
| `score(binding, entityRegistry, ctx)` | Sums all utility sources and returns a number |
| `scoreWithBreakdown(binding, entityRegistry, ctx)` | Returns `{ score, breakdown }` — the total and a per-source node tree; see [Action records](action-records.md) |
| `execute(binding, queryHandlers, queue?, opts?)` | Applies effects immediately; enqueues them at `tickEnd` when a `StateChangeQueue` is supplied. `opts` accepts `{ privateStores, world, utilityBreakdown }` — pass `world` to record provenance |
| `enqueue(queue, binding, queryHandlers, opts?)` | Stages all effects at `tickEnd` without applying them |
| `collectVariables()` | Returns all `LogicalVariable` instances referenced in preconditions and effects |
| `action.content` | The `ContentItem` attached to the action, or `null` |
| `action.roles` | Array of role variable name strings (e.g. `['?SELF', '?Y']`) |
| `action.info` | Array of declared info facts about the action: `[{ name, args }]` |
| `action.name` | The action's string name |

For details on provenance, action records, and utility breakdowns see [Action records](action-records.md) and [Provenance](provenance.md).
