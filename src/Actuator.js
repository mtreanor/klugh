export class Actuator {
  actuate(resolvedArgs, negated, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement actuate(resolvedArgs, negated, evaluationContext)`);
  }
}
