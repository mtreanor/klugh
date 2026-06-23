import { LogicalVariable } from './LogicalVariable.js';
import { applyStateChange } from './stateOperations/applyStateChange.js';
import { ActionRecord } from './provenance/ActionRecord.js';
import { ActionEffectProvenance } from './provenance/ActionEffectProvenance.js';
import { recordActionOccurrence } from './recordActionOccurrence.js';
import { THIS_ACTION, THIS_OCCURRENCE } from './actionVariables.js';

// True when applying this operation needs the occurrence — i.e. it references
// ?this_occurrence anywhere in its arguments. Such operations are skipped when
// no occurrence was recorded for the execution.
function operationReferencesOccurrence(operation) {
  return (operation.args ?? []).some(arg => arg instanceof LogicalVariable && arg.name === THIS_OCCURRENCE);
}

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
    this.roleTypes       = new Map(roles.map(r => [r.variable.slice(1), r.type]));
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
    // ?this_action / ?this_occurrence are implicit bindings, never enumerated.
    const add = v => {
      if (v.name === THIS_ACTION || v.name === THIS_OCCURRENCE) return;
      if (!seen.has(v.name)) { seen.add(v.name); variables.push(v); }
    };
    for (const { predicate } of this.preconditions) {
      for (const v of predicate.getVariables()) add(v);
    }
    for (const effect of this.effects) {
      for (const arg of effect.args ?? []) {
        if (arg instanceof LogicalVariable) add(arg);
      }
    }
    for (const { variable } of this.roles) {
      const name = variable.slice(1);
      if (!seen.has(name) && name !== THIS_ACTION && name !== THIS_OCCURRENCE) {
        seen.add(name);
        variables.push(new LogicalVariable(name));
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

  // The action's own `action` entity — what ?this_action binds to. Falls back to
  // a bare { name } when no world (or no registered entity) is available, which
  // resolves identically for fact matching (entities are keyed by name).
  entityValue(world) {
    const registered = world?.entityRegistry?.get('action')?.find(e => e.name === this.name);
    return registered ?? { name: this.name };
  }

  // Extends a binding with the implicit action variables before effects run.
  // ?this_action is always bound; ?this_occurrence only when an occurrence was
  // recorded for this execution.
  bindImplicitVariables(binding, world, occurrenceId) {
    let extended = binding.extend(new LogicalVariable(THIS_ACTION), this.entityValue(world));
    if (occurrenceId != null) {
      extended = extended.extend(new LogicalVariable(THIS_OCCURRENCE), occurrenceId);
    }
    return extended;
  }

  // Effects to apply. When no occurrence was recorded, effects that reference
  // ?this_occurrence are dropped — their occurrence annotations have nothing to
  // hang on, while every other effect still applies.
  applicableEffects(hasOccurrence) {
    if (hasOccurrence) return this.effects;
    return this.effects.filter(op => !operationReferencesOccurrence(op));
  }

  execute(binding, queryHandlers, stateChangeQueue = null, { privateStores = null, world = null, utilityBreakdown = null, planRecord = null, recordOccurrence = false, occurrenceFacts = [] } = {}) {
    if (this.effects.length === 0) return;

    let provenance   = null;
    let occurrenceId = null;
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

      // Reify the occurrence and link it to the action record, so the event is
      // queryable and traceable back to what motivated it.
      if (recordOccurrence) {
        record.occurrence = recordActionOccurrence(this, binding, world, { contextFacts: occurrenceFacts });
        occurrenceId      = record.occurrence;
      }
    }

    const effectBinding = this.bindImplicitVariables(binding, world, occurrenceId);
    const operations    = this.applicableEffects(occurrenceId != null);

    if (stateChangeQueue) {
      for (const operation of operations) {
        stateChangeQueue.enqueue(operation, effectBinding, queryHandlers, { flush: 'tickEnd', privateStores, provenance });
      }
      return;
    }
    for (const operation of operations) {
      applyStateChange(operation, effectBinding, queryHandlers, { privateStores, provenance });
    }
  }

  toString() {
    return this.name;
  }
}
