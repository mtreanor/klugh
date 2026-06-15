export class ConstantUtilitySource {
  constructor(value) {
    this.value = value;
  }

  evaluate(_binding, _entityRegistry, _evaluationContext) {
    return this.value;
  }

  scoreWithBreakdown(_binding, _entityRegistry, _evaluationContext) {
    return { type: 'constant', value: this.value, score: this.value };
  }
}
