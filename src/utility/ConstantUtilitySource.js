export class ConstantUtilitySource {
  constructor(value) {
    this.value = value;
  }

  evaluate(_binding, _entityRegistry, _evaluationContext) {
    return this.value;
  }
}
