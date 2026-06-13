import { LogicalVariable } from './LogicalVariable.js';
import { applyStateChange } from './stateOperations/applyStateChange.js';

export class Action {
  constructor(name, {
    roles          = [],
    preconditions  = [],
    effects        = [],
    utilitySources = [],
    content        = null,
  } = {}) {
    this.name            = name;
    this.roles           = roles;
    this.preconditions   = preconditions;
    this.effects         = effects;
    this.stateOperations = effects;
    this.utilitySources  = utilitySources;
    this.content         = content;
  }

  collectVariables() {
    const seen      = new Set();
    const variables = [];
    const add = v => { if (!seen.has(v.name)) { seen.add(v.name); variables.push(v); } };
    for (const { predicate } of this.preconditions) {
      for (const v of predicate.getVariables()) add(v);
    }
    for (const effect of this.effects) {
      for (const arg of effect.args ?? []) {
        if (arg instanceof LogicalVariable) add(arg);
      }
    }
    return variables;
  }

  arePreconditionsMet(binding, evaluationContext) {
    return this.preconditions.every(({ predicate }) => predicate.evaluate(binding, evaluationContext));
  }

  score(binding, entityRegistry, evaluationContext) {
    return this.utilitySources.reduce(
      (total, source) => total + source.evaluate(binding, entityRegistry, evaluationContext),
      0
    );
  }

  enqueue(stateChangeQueue, binding, queryHandlers, { privateStores = null, provenance = null } = {}) {
    for (const operation of this.effects) {
      stateChangeQueue.enqueue(operation, binding, queryHandlers, { flush: 'tickEnd', privateStores, provenance });
    }
  }

  execute(binding, queryHandlers, stateChangeQueue = null, privateStores = null) {
    if (stateChangeQueue) {
      this.enqueue(stateChangeQueue, binding, queryHandlers, { privateStores });
      return;
    }
    for (const operation of this.effects) {
      applyStateChange(operation, binding, queryHandlers, { privateStores });
    }
  }

  toString() {
    return this.name;
  }
}
