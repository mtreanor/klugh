export class QueryHandler {
  evaluate(predicate, binding, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement evaluate(predicate, binding, evaluationContext)`);
  }
}
