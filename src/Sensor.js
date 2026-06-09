// Interface for all sensor implementations.
// Sensors are declared in the predicate schema with type "sensor" and
// implemented in the consuming layer (e.g. game/sensors/).
// evaluate() is called with fully-bound string arguments and must return
// { result: boolean, detail: string } — detail is snapshotted into
// provenance at rule-evaluation time.
export class Sensor {
  evaluate(resolvedArgs, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement evaluate(resolvedArgs, evaluationContext)`);
  }
}
