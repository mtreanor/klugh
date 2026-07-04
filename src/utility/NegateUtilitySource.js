// Unary minus over a utility source.
export class NegateUtilitySource {
  constructor(operand) {
    this.operand = operand;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    return -this.operand.evaluate(binding, entityRegistry, evaluationContext);
  }

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const operand = this.operand.scoreWithBreakdown(binding, entityRegistry, evaluationContext);
    return { type: 'negate', operand, score: -operand.score };
  }
}
