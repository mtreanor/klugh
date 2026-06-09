export class NumericActuator {
  apply(resolvedArgs, value, operation, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement apply(resolvedArgs, value, operation, evaluationContext)`);
  }
}
