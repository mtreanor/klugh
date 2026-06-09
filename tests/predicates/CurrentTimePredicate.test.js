import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryHandlers } from '../../src/QueryHandlers.js';
import { EvaluationContext } from '../../src/EvaluationContext.js';
import { ExternalAPIQueryHandler } from '../../src/queryHandlers/ExternalAPIQueryHandler.js';
import { CurrentTimePredicate } from '../../src/predicates/CurrentTimePredicate.js';
import { Binding } from '../../src/Binding.js';

class FixedTimeHandler extends ExternalAPIQueryHandler {
  constructor(hour) {
    super();
    this.hour = hour;
  }
  getCurrentTime() {
    return { getHours: () => this.hour };
  }
}

function buildEvaluationContext(hour) {
  const queryHandlers = new QueryHandlers();
  queryHandlers.register('externalAPI', {
    evaluate: (predicate, binding, evaluationContext) =>
      predicate.evaluateAgainstExternalAPI({ getCurrentTime: () => ({ getHours: () => hour }) }, binding, evaluationContext),
  });
  return new EvaluationContext(queryHandlers);
}

describe('CurrentTimePredicate', () => {
  it('is true when the current hour is within the range', () => {
    const predicate = new CurrentTimePredicate(9, 17);
    assert.ok(predicate.evaluate(new Binding(), buildEvaluationContext(12)));
  });

  it('is false when the current hour is outside the range', () => {
    const predicate = new CurrentTimePredicate(9, 17);
    assert.ok(!predicate.evaluate(new Binding(), buildEvaluationContext(20)));
  });

  it('is inclusive of fromHour and exclusive of toHour', () => {
    const predicate = new CurrentTimePredicate(9, 17);
    assert.ok(predicate.evaluate(new Binding(), buildEvaluationContext(9)));
    assert.ok(!predicate.evaluate(new Binding(), buildEvaluationContext(17)));
  });

  it('contributes no logical variables to the binding search', () => {
    const predicate = new CurrentTimePredicate(9, 17);
    assert.deepEqual(predicate.getVariables(), []);
  });
});
