const aggregators = {
  sum: values => values.reduce((a, b) => a + b, 0),
  avg: values => values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length,
  min: values => values.length === 0 ? 0 : Math.min(...values),
  max: values => values.length === 0 ? 0 : Math.max(...values),
};

export class AggregateUtilitySource {
  constructor(aggregator, sources) {
    this.aggregator = aggregator;
    this.sources    = sources;
  }

  evaluate(binding, entityRegistry, evaluationContext) {
    const values = this.sources.map(s => s.evaluate(binding, entityRegistry, evaluationContext));
    const fn = aggregators[this.aggregator];
    if (!fn) throw new Error(`Unknown aggregator: "${this.aggregator}"`);
    return fn(values);
  }
}
