# Sensor predicates

Sensors are predicates whose truth is computed by application-layer code at evaluation time rather than looked up in a fact store. They let rules reason about runtime state — spatial proximity, environmental readings, external signals — that has no natural home in the fact store.

There are two sensor types. They share the same authoring process but expose different interfaces in rules.

---

## Boolean sensors (`type: "sensor"`)

A boolean sensor evaluates to true or false. In a rule LHS it is written exactly like any other boolean predicate.

**Schema declaration:**

```json
"near": { "type": "sensor", "args": ["agent", "agent"] }
```

**In rules:**

```klugh
rule "approach when nearby"
  near(?SELF, ?Y)
  ^ knows(?SELF, ?Y)
  => toward(?SELF, ?Y) += 3.0
```

---

## Numeric sensors (`type: "sensor-numeric"`)

A numeric sensor produces a continuous value. In rules it supports the same tier and comparison syntax as a stored `numeric` predicate. The schema must declare the full numeric contract — `minValue`, `maxValue`, `default`, and any tiers.

**Schema declaration:**

```json
"distance": {
  "type": "sensor-numeric",
  "args": ["agent", "agent"],
  "minValue": 0, "maxValue": 999, "default": 999,
  "tiers": {
    "near": [0,  4],
    "far":  [4, 999]
  }
}
```

**In rules:**

```klugh
rule "wariness when far"
  distance.far(?SELF, ?Y)
  ^ knows(?SELF, ?Y)
  => away(?SELF, ?Y) += 2.0

rule "urgency when very close"
  knows(?SELF, ?Y)
  ^ distance(?SELF, ?Y) < 2
  => toward(?SELF, ?Y) += 5.0
```

---

## Implementing a sensor

Sensors are implemented in application-layer code by extending the appropriate base class:

```javascript
// Boolean sensor
import { Sensor } from '@engine/logic/Sensor.js';

export class NearSensor extends Sensor {
  evaluate([a, b], evaluationContext) {
    // ... compute result
    return { result: dist <= this.threshold, detail: `distance(${a},${b}) = ${dist}` };
  }
}

// Numeric sensor
import { NumericSensor } from '@engine/logic/NumericSensor.js';

export class DistanceSensor extends NumericSensor {
  getValue([a, b], evaluationContext) {
    // ... compute value
    return { value: dist, detail: `distance(${a},${b}) = ${dist}` };
  }
}
```

Sensors are registered on the `SensorQueryHandler` at world-setup time:

```javascript
sensorHandler.register('near', new NearSensor());
sensorHandler.registerNumeric('distance', new DistanceSensor());
```

The `detail` string is snapshotted into `SensorProvenance` at the moment the rule is evaluated — not re-evaluated when inspecting history later.

Any runtime context a sensor needs (agent positions, external API responses, etc.) should be made available through the `evaluationContext` via a dedicated `QueryHandler` registered on the world. Sensors should not hold mutable world-state directly.

---

## Limitations

Sensors are stateless and ephemeral — they have no persistent record in any fact store. This rules out all predicate forms that depend on stored history or stored negation:

| Feature | Works with sensors? | Reason |
|---------|---------------------|--------|
| Plain positive use in rule LHS | ✓ | |
| Numeric tier (`pred.tier(args)`) | ✓ sensor-numeric only | |
| Numeric comparison (`pred(args) >= N`) | ✓ sensor-numeric only | |
| Importance weighting (`[importance: N]`) | ✓ | |
| Binding generation (unbound variables) | ✓ | Variables are enumerated by the rule evaluator; the sensor is called per candidate |
| As premise in `define` | ✓ | Sensor predicates are valid premises in `define` blocks |
| `[ever]` / `[asserted-during: N]` / `[during: N]` / `[when: ?t]` | ✗ | Requires a stored fact record |
| `then` (temporal chain) | ✗ | Requires historical assertion timestamps |
| Explicit negation (`-pred`) | ✗ | Explicit disbelief is a stored fact; sensors have no storage |
| Negation as failure (`not pred`) | ✗ | Absence-from-store is undefined for sensors |
| Weak negation (`~pred`) | ✗ | Combination of the two forms above |
| `not -pred` | ✗ | Requires stored negation record |
| Count (`\|pred\|`) | ✗ | Counts scan the fact store |
| Private-store prefix (`?X.pred(...)`) | ✗ | Private stores are fact stores; sensors route through the sensor handler |
| State operations (assert / adjust / retract) | ✗ | Sensors are read-only from the logic layer |
| As `define` conclusion | ✗ | The conclusion of a `define` must be `type: "derived"` |

Sensors cannot be asserted or retracted in state files. Their value is always computed fresh.
