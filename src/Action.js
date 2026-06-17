import { LogicalVariable } from './LogicalVariable.js';
import { applyStateChange } from './stateOperations/applyStateChange.js';
import { ActionRecord } from './provenance/ActionRecord.js';
import { ActionEffectProvenance } from './provenance/ActionEffectProvenance.js';

export class Action {
  constructor(name, {
    roles          = [],
    info           = [],
    preconditions  = [],
    effects        = [],
    utilitySources = [],
    content        = null,
  } = {}) {
    this.name            = name;
    this.roles           = roles;
    this.info            = info;   // facts declared about the action itself: [{ name, args }]
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

  scoreWithBreakdown(binding, entityRegistry, evaluationContext) {
    const breakdown = this.utilitySources.map(s => s.scoreWithBreakdown(binding, entityRegistry, evaluationContext));
    const score     = breakdown.reduce((total, b) => total + b.score, 0);
    return { score, breakdown };
  }

  enqueue(stateChangeQueue, binding, queryHandlers, { privateStores = null, provenance = null } = {}) {
    for (const operation of this.effects) {
      stateChangeQueue.enqueue(operation, binding, queryHandlers, { flush: 'tickEnd', privateStores, provenance });
    }
  }

  execute(binding, queryHandlers, stateChangeQueue = null, { privateStores = null, world = null, utilityBreakdown = null, planRecord = null } = {}) {
    if (this.effects.length === 0) return;

    let provenance = null;
    if (world) {
      const record = new ActionRecord({
        tick: world.tickTracker.currentTick,
        action: this,
        binding,
        utilityBreakdown,
        planRecord,
      });
      world.actionLog.push(record);
      provenance = new ActionEffectProvenance(record);
    }

    if (stateChangeQueue) {
      this.enqueue(stateChangeQueue, binding, queryHandlers, { privateStores, provenance });
      return;
    }
    for (const operation of this.effects) {
      applyStateChange(operation, binding, queryHandlers, { privateStores, provenance });
    }
  }

  toString() {
    return this.name;
  }
}
