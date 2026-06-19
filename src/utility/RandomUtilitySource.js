// Draws a uniform random value in [min, max). The randomness is non-deterministic
// by nature, but the draw is pulled from an injectable RNG on the evaluation
// context (defaulting to Math.random), so embedders and tests can seed it for
// reproducible runs. The value is drawn exactly once per evaluate / scoreWithBreakdown
// call, and scoreWithBreakdown records the drawn value — so the breakdown never
// reports a number that differs from the score it contributed.
export class RandomUtilitySource {
  constructor(min, max) {
    this.min = min;
    this.max = max;
  }

  draw(evaluationContext) {
    const rng = evaluationContext?.random ?? Math.random;
    return this.min + rng() * (this.max - this.min);
  }

  evaluate(_binding, _entityRegistry, evaluationContext) {
    return this.draw(evaluationContext);
  }

  scoreWithBreakdown(_binding, _entityRegistry, evaluationContext) {
    const value = this.draw(evaluationContext);
    return { type: 'random', min: this.min, max: this.max, value, score: value };
  }
}
