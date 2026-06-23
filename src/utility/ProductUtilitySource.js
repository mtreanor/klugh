export class ProductUtilitySource {
  constructor(left, right) {
    this.left  = left;
    this.right = right;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    return this.left.evaluate(binding, entityRegistry, evaluationContext)
         * this.right.evaluate(binding, entityRegistry, evaluationContext);
  }

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const left  = this.left.scoreWithBreakdown(binding, entityRegistry, evaluationContext);
    const right = this.right.scoreWithBreakdown(binding, entityRegistry, evaluationContext);
    return { type: 'product', left, right, score: left.score * right.score };
  }
}
