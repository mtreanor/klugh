# Schema

The predicate schema and entity configuration are both JSON files loaded at startup. They are the single source of truth for what predicates exist, what types their arguments take, and what entities are available.

---

## Predicate schema

```json
{
  "predicates": {
    "knows":       { "type": "boolean",    "symmetric": true, "args": ["agent", "agent"] },
    "hasNeed":     { "type": "boolean",    "args": ["agent", "string"] },
    "hadConflict": { "type": "boolean",    "args": ["agent", "agent"] },
    "canHelp":     { "type": "derived",    "args": ["agent", "agent"] },
    "mood": {
      "type": "numeric", "args": ["agent"],
      "minValue": 0, "maxValue": 100, "default": 50,
      "tiers": {
        "low":    [0,  40],
        "medium": [40, 70],
        "high":   [70, 100]
      }
    },
    "drive": {
      "type": "numeric",
      "args": ["agent", "agent"],
      "minValue": 0, "maxValue": 999, "default": 0
    }
  }
}
```

Predicate names must not collide with entity type names or entity instance names — this is validated at load time.

### Predicate types

| Type | Description |
|------|-------------|
| `boolean` | Currently true or false. Stored in a fact store. Supports explicit negation. |
| `derived` | Computed at query time via backward chaining. Never stored as a fact. |
| `numeric` | A continuous value in `[minValue, maxValue]`, queryable by named tier or direct comparison. |
| `sensor` | Boolean truth computed on demand by application-layer code. Never stored. |
| `sensor-numeric` | Numeric value computed on demand by application-layer code. Never stored. Queryable by tier and comparison. |

### `annotations`

An optional object for application-layer metadata. The logic engine stores and passes it through opaquely — nothing in the core reads it. Application layers can define their own keys here.

```json
"toward": {
  "type": "numeric", "args": ["agent", "agent"],
  "minValue": 0, "maxValue": 999, "default": 0,
  "annotations": { "ephemeral": true }
}
```

### `symmetric`

Setting `"symmetric": true` on a two-argument predicate means that `knows(alice, carol)` and `knows(carol, alice)` are treated as equivalent. Asserting or retracting one direction propagates to the other. Only one direction needs to be declared in the state file.

---

## Entities

Entities are declared in `entities.json`, grouped by type. Each type maps entity names to optional per-instance configuration.

```json
{
  "agent": {
    "privateStore": true,
    "alice": {},
    "bob":   {},
    "carol": {}
  },
  "knowledge": {
    "karate":      {},
    "philosophy":  {}
  }
}
```

Argument type names in the predicate schema (`"agent"`, `"knowledge"`, etc.) match the type keys in `entities.json`. The exceptions are the types the engine populates itself: actions register as `action` entities from their [`info:` blocks](actions.md#info), and [occurrences](actions.md#occurrences) are minted at runtime — neither is declared here.

When a free variable's argument type has no registered entities at all, the engine cannot enumerate an extent for it, so it instead binds the variable from whatever facts match — [extent binding](actions.md#querying). This is how the occurrence `role` predicate gets a polymorphic value slot; it is not a general-purpose tool.

### Type-level configuration

Two keys are recognised at the entity-type level (alongside member definitions):

| Key | Default | Effect |
|-----|---------|--------|
| `privateStore` | `false` | Create a private fact store for every instance of this type. See [Private stores](private-stores.md). |
| `distinct` | `true` | Whether two logical variables of this type must be assigned different entities. Set `false` to allow self-pairings. Also controls within-predicate distinctness for that type's argument positions. |

```json
{
  "agent": {
    "privateStore": true,
    "distinct": true,
    "alice": {},
    "bob":   {}
  },
  "token": {
    "distinct": false,
    "coin": {}
  }
}
```

`distinct` affects binding generation during rule evaluation and queries — see [Binding constraints](rules.md#binding-constraints).
