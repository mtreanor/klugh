import { Fact } from '../Fact.js';
import { LogicalVariable } from '../LogicalVariable.js';

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
  world           = null,
  action          = null,
} = {}) {
  if (operation.type === 'new-entity') {
    return applyNewEntity(operation, binding, world);
  }
  if (operation.type === 'remove-entity') {
    return applyRemoveEntity(operation, binding, world);
  }
  if (operation.type === 'record') {
    return applyRecord(operation, binding, world, action, provenance);
  }

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
    case 'assert': {
      const negated = operation.negated ?? false;
      const alreadyActive = factStore.query(operation.name, ...resolvedArgs).some(f => f.negated === negated);
      factStore.assert(new Fact(operation.name, ...resolvedArgs, { negated }), strength, provenance);
      return !alreadyActive;
    }
    case 'retract': {
      const negated = operation.negated ?? false;
      const wasActive = factStore.query(operation.name, ...resolvedArgs).some(f => f.negated === negated);
      factStore.retract(new Fact(operation.name, ...resolvedArgs, { negated }), provenance);
      return wasActive;
    }
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

function resolveNameTemplate(template, binding) {
  return template.replace(/\{\?([A-Z][A-Z0-9_]*)\}/g, (_, varName) => {
    const resolved = binding.resolve(new LogicalVariable(varName));
    if (resolved == null) return `_${varName}_`;
    return (typeof resolved === 'object' && 'name' in resolved) ? resolved.name : String(resolved);
  });
}

function applyNewEntity(operation, binding, world) {
  if (!world) throw new Error('new entity requires a world');

  let entityName;
  if (operation.explicitName != null) {
    entityName = typeof operation.explicitName === 'string' && operation.explicitName.includes('{?')
      ? resolveNameTemplate(operation.explicitName, binding)
      : operation.explicitName;
    const existing = world.entityRegistry.get(operation.entityType);
    if (existing?.some(e => e.name === entityName)) return { name: entityName, created: false };
  } else if (operation.nameArg instanceof LogicalVariable) {
    const seq = (world.entitySeq ?? 0) + 1;
    world.entitySeq = seq;
    entityName = `${operation.entityType}_${seq}`;
  } else if (operation.nameArg != null) {
    entityName = operation.nameArg;
    const existing = world.entityRegistry.get(operation.entityType);
    if (existing?.some(e => e.name === entityName)) return { name: entityName, created: false };
  } else {
    const seq = (world.entitySeq ?? 0) + 1;
    world.entitySeq = seq;
    entityName = `${operation.entityType}_${seq}`;
  }

  world.addEntity(operation.entityType, { name: entityName });
  return { name: entityName, created: true };
}

function applyRemoveEntity(operation, binding, world) {
  if (!world) throw new Error('remove entity requires a world');

  let entityName;
  if (operation.nameArg instanceof LogicalVariable) {
    const resolved = binding.resolve(operation.nameArg);
    if (resolved == null) throw new Error('remove entity: variable is unbound');
    entityName = (typeof resolved === 'object' && 'name' in resolved) ? resolved.name : resolved;
  } else {
    entityName = operation.nameArg;
  }

  return world.removeEntity(operation.entityType, entityName);
}

function applyRecord(operation, binding, world, action, provenance) {
  if (!world) throw new Error('record() requires a world');
  if (!action) throw new Error('record() is only valid in action effects');

  world.occurrenceSeq = (world.occurrenceSeq ?? 0) + 1;
  const occId = `occ${world.occurrenceSeq}`;
  world.addEntity('occurrence', { name: occId });

  world.factStore.assert(new Fact('actionType', occId, action.name), 1.0, provenance);

  for (const roleRef of action.roles ?? []) {
    const roleName = roleNameOf(roleRef);
    const resolved = binding.resolve(new LogicalVariable(roleName));
    if (resolved === undefined) continue;
    const value = (resolved !== null && typeof resolved === 'object' && 'name' in resolved)
      ? resolved.name : resolved;
    world.factStore.assert(new Fact('role', occId, roleName, value), 1.0, provenance);
  }

  return occId;
}

function roleNameOf(roleRef) {
  if (roleRef !== null && typeof roleRef === 'object' && 'variable' in roleRef) {
    return roleRef.variable.slice(1);
  }
  if (typeof roleRef === 'string' && roleRef.startsWith('?')) return roleRef.slice(1);
  return roleRef;
}

export function applyEffects(effects, binding, queryHandlers, {
  privateStores = null,
  provenance    = null,
  world         = null,
  action        = null,
} = {}) {
  let currentBinding = binding;
  let changed = false;

  for (const effect of effects) {
    const result = applyStateChange(effect, currentBinding, queryHandlers, {
      privateStores, provenance, world, action,
    });

    if (effect.type === 'new-entity' && result && typeof result === 'object' && 'name' in result) {
      if (result.created) changed = true;
      if (effect.nameArg instanceof LogicalVariable) {
        currentBinding = currentBinding.extend(effect.nameArg, { name: result.name });
      }
    } else if (effect.type === 'record' && typeof result === 'string') {
      changed = true;
      currentBinding = currentBinding.extend(effect.bindVar, { name: result });
    } else if (result) {
      changed = true;
    }
  }

  return changed;
}
