import { applyArithmetic } from '../numericOps.js';

// Infix arithmetic over utility sources: `+`, `-`, `/`. (`*` stays its own
// ProductUtilitySource.) Operands are ordinary utility sources, which already
// return 0 for a missing value, so a missing term contributes 0 to the score
// rather than nulling it. Division by zero yields 0, keeping the total finite.
export class ArithmeticUtilitySource {
  constructor(op, left, right) {
    this.op    = op;
    this.left  = left;
    this.right = right;
  }

  _combine(l, r) {
    return applyArithmetic(this.op, l, r, 0);
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    return this._combine(
      this.left.evaluate(binding, entityRegistry, evaluationContext),
      this.right.evaluate(binding, entityRegistry, evaluationContext),
    );
  }

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const left  = this.left.scoreWithBreakdown(binding, entityRegistry, evaluationContext);
    const right = this.right.scoreWithBreakdown(binding, entityRegistry, evaluationContext);
    return { type: 'arithmetic', op: this.op, left, right, score: this._combine(left.score, right.score) };
  }
}
