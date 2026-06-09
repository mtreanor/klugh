// Interface for numeric sensor implementations.
// Numeric sensors are declared in the predicate schema with type "sensor-numeric"
// and expose their value through numeric-tier and numeric-value predicates in rules.
// getValue() is called with fully-bound string arguments and must return
// { value: number, detail: string } — both fields are snapshotted into provenance
// at rule-evaluation time.
export class NumericSensor {
  getValue(resolvedArgs, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement getValue(resolvedArgs, evaluationContext)`);
  }
}
