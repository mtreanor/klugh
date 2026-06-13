import { Fact } from '../Fact.js';

function buildStubEvaluationContext(factStore, queryHandlers) {
  return {
    getActiveFactStore() { return factStore; },
    getHandler(name) { return queryHandlers.getHandler(name); },
    currentTick: factStore.currentTick,
  };
}

function resolveOwnerName(operation, binding) {
  if (!operation.owner) return null;
  if (!operation.ownerIsVariable) return operation.owner;

  const resolved = binding.resolve(operation.owner);
  if (resolved == null) return null;
  if (typeof resolved === 'object' && 'name' in resolved) return resolved.name;
  return resolved;
}

function getTargetStores(operation, binding, queryHandlers, privateStores, targetFactStore = null) {
  if (targetFactStore) {
    return {
      factStore: targetFactStore,
      evaluationContext: buildStubEvaluationContext(targetFactStore, queryHandlers),
    };
  }

  if (!operation.owner) {
    const factStore = queryHandlers.getHandler('factStore').factStore;
    return {
      factStore,
      evaluationContext: buildStubEvaluationContext(factStore, queryHandlers),
    };
  }

  const ownerName = resolveOwnerName(operation, binding);
  if (!ownerName) {
    throw new Error(`Cannot apply private state change: owner variable is unbound`);
  }

  const factStore = privateStores?.get(ownerName);
  if (!factStore) {
    throw new Error(`Entity "${ownerName}" has no private store`);
  }

  return {
    factStore,
    evaluationContext: buildStubEvaluationContext(factStore, queryHandlers),
  };
}

export function applyStateChange(operation, binding, queryHandlers, {
  deltaOverride   = null,
  privateStores   = null,
  targetFactStore = null,
  provenance      = null,
} = {}) {
  const resolvedArgs = operation.resolveArgs(binding);

  // Actuator operations route to the actuator handler, not the fact store.
  if (operation.type === 'actuate') {
    const ctx = { getHandler: name => queryHandlers.getHandler(name) };
    queryHandlers.getHandler('actuator').fire(operation.name, resolvedArgs, operation.negated ?? false, ctx);
    return;
  }
  if (operation.type === 'actuate-numeric') {
    const ctx = { getHandler: name => queryHandlers.getHandler(name) };
    const value = deltaOverride ?? operation.delta ?? operation.value;
    queryHandlers.getHandler('actuator').fireNumeric(operation.name, resolvedArgs, value, operation.numericOperation, ctx);
    return;
  }

  const { factStore, evaluationContext } = getTargetStores(
    operation, binding, queryHandlers, privateStores, targetFactStore
  );
  const strength = operation.strength ?? 1.0;

  switch (operation.type) {
    case 'assert':
      factStore.assert(new Fact(operation.name, ...resolvedArgs, { negated: operation.negated ?? false }), strength, provenance);
      return;
    case 'retract':
      factStore.retract(new Fact(operation.name, ...resolvedArgs, { negated: operation.negated ?? false }), provenance);
      return;
    case 'adjust-numeric': {
      const numeric = queryHandlers.getHandler('numeric');
      return numeric.adjustValue(operation.name, resolvedArgs, deltaOverride ?? operation.delta, evaluationContext, provenance);
    }
    case 'set-numeric': {
      const numeric = queryHandlers.getHandler('numeric');
      const changed = numeric.setValue(operation.name, resolvedArgs, operation.value, evaluationContext, provenance);
      if (strength !== 1.0) {
        const record = factStore.factHistory.findLast(r =>
          r.isCurrentlyActive() &&
          r.fact.name === operation.name &&
          r.fact.args.length === resolvedArgs.length &&
          r.fact.args.every((arg, i) => arg === resolvedArgs[i])
        );
        if (record) record.strength = strength;
      }
      return changed;
    }
    default:
      throw new Error(`Unknown state operation type: "${operation.type}"`);
  }
}
