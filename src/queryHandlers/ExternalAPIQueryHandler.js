import { QueryHandler } from '../QueryHandler.js';

export class ExternalAPIQueryHandler extends QueryHandler {
  evaluate(predicate, binding, evaluationContext) {
    return predicate.evaluateAgainstExternalAPI(this, binding, evaluationContext);
  }

  getCurrentTime() {
    return new Date();
  }
}
