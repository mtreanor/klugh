import { QueryHandler } from '../QueryHandler.js';

// Holds Sensor and NumericSensor instances registered by the consuming layer.
//
// Boolean sensors  — register(name, sensor)         sensor.evaluate() → { result, detail }
// Numeric sensors  — registerNumeric(name, sensor)  sensor.getValue() → { value, detail }
export class SensorQueryHandler extends QueryHandler {
  constructor() {
    super();
    this._sensors        = new Map();
    this._numericSensors = new Map();
  }

  register(name, sensor) {
    this._sensors.set(name, sensor);
  }

  registerNumeric(name, sensor) {
    this._numericSensors.set(name, sensor);
  }

  // ── Boolean sensors ──────────────────────────────────────────────────────────

  // Called by SensorPredicate.evaluate(). Caches the full outcome on the
  // predicate instance so explain() can snapshot provenance without a second call.
  evaluate(predicate, resolvedArgs, evaluationContext) {
    const sensor = this._sensors.get(predicate.name);
    if (!sensor) throw new Error(`No sensor registered for "${predicate.name}"`);
    const outcome = sensor.evaluate(resolvedArgs, evaluationContext);
    predicate._cachedOutcome = { ...outcome, resolvedArgs };
    return outcome.result;
  }

  // ── Numeric sensors ──────────────────────────────────────────────────────────

  // Called by SensorNumericTierPredicate. Uses the schema to map the computed
  // value to a tier name, matching the behaviour of NumericStateQueryHandler.
  evaluateTier(predicate, resolvedArgs, evaluationContext) {
    const sensor = this._numericSensors.get(predicate.name);
    if (!sensor) throw new Error(`No numeric sensor registered for "${predicate.name}"`);
    const outcome = sensor.getValue(resolvedArgs, evaluationContext);
    const result  = evaluationContext.predicateSchema.matchesTier(predicate.name, outcome.value, predicate.tier);
    predicate._cachedOutcome = { ...outcome, resolvedArgs, result };
    return result;
  }

  // Resolves the raw computed value of a numeric sensor, for predicate-vs-predicate
  // comparisons (ComparisonPredicate) where the sensor is one operand.
  getNumericValue(name, resolvedArgs, evaluationContext) {
    const sensor = this._numericSensors.get(name);
    if (!sensor) throw new Error(`No numeric sensor registered for "${name}"`);
    return sensor.getValue(resolvedArgs, evaluationContext).value;
  }

  // Called by SensorNumericComparisonPredicate.
  evaluateComparison(predicate, resolvedArgs, evaluationContext) {
    const sensor = this._numericSensors.get(predicate.name);
    if (!sensor) throw new Error(`No numeric sensor registered for "${predicate.name}"`);
    const outcome = sensor.getValue(resolvedArgs, evaluationContext);
    const v       = outcome.value;
    const t       = predicate.threshold;
    let result;
    if      (predicate.operator === '>=') result = v >= t;
    else if (predicate.operator === '<=') result = v <= t;
    else if (predicate.operator === '>')  result = v >  t;
    else if (predicate.operator === '<')  result = v <  t;
    else if (predicate.operator === '!=') result = v !== t;
    else                                  result = v === t;
    predicate._cachedOutcome = { ...outcome, resolvedArgs, result };
    return result;
  }
}
