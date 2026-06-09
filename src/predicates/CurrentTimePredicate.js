import { Predicate } from '../Predicate.js';

// Checks whether the current hour of day falls within [fromHour, toHour).
// This is the first example of a predicate that is answered by the external world
// rather than the agent's fact store.
export class CurrentTimePredicate extends Predicate {
  constructor(fromHour, toHour) {
    super();
    this.fromHour = fromHour;
    this.toHour = toHour;
  }

  evaluate(binding, evaluationContext) {
    return evaluationContext.getHandler('externalAPI').evaluate(this, binding, evaluationContext);
  }

  evaluateAgainstExternalAPI(handler, binding, evaluationContext) {
    const hour = handler.getCurrentTime().getHours();
    return hour >= this.fromHour && hour < this.toHour;
  }

  getVariables() {
    return [];
  }

  toString() {
    return `currentTimeBetween(${this.fromHour}, ${this.toHour})`;
  }
}
