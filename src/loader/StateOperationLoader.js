import { LogicalVariable } from '../LogicalVariable.js';
import { StateOperation } from '../stateOperations/StateOperation.js';

export class StateOperationLoader {
  constructor(predicateSchema = null) {
    this.predicateSchema = predicateSchema;
  }

  buildStateOperation(data) {
    if (data.type === 'new-entity') {
      const nameArg = data.nameArg && typeof data.nameArg === 'string' && data.nameArg.startsWith('?')
        ? new LogicalVariable(data.nameArg.slice(1))
        : data.nameArg;
      return new StateOperation('new-entity', null, [], { entityType: data.entityType, nameArg });
    }

    if (data.type === 'record') {
      const bindVar = data.bindVar && typeof data.bindVar === 'string' && data.bindVar.startsWith('?')
        ? new LogicalVariable(data.bindVar.slice(1))
        : null;
      if (!bindVar) throw new Error('record() requires a variable argument, e.g. record(?occ)');
      return new StateOperation('record', null, [], { bindVar });
    }

    if (this.predicateSchema && !this.predicateSchema.hasDefinition(data.name)) {
      throw new Error(`Unknown predicate "${data.name}" in state operation — not defined in the predicate schema`);
    }

    const args  = this.resolveArgs(data.args ?? []);
    const owner = data.ownerVar
      ? new LogicalVariable(data.ownerVar.slice(1))
      : data.ownerEntity ?? null;

    const schemaType = this.predicateSchema?.getDefinition(data.name)?.type;

    // Actuator dispatch — checked before fact-store operations.
    if (schemaType === 'actuator') {
      const negated = (data.type === 'retract') || (data.negated ?? false);
      return new StateOperation('actuate', data.name, args, { negated });
    }
    if (schemaType === 'actuator-numeric') {
      if (data.type === 'adjust-numeric') {
        const op = data.delta >= 0 ? '+=' : '-=';
        return new StateOperation('actuate-numeric', data.name, args, {
          delta: data.delta, numericOperation: op,
        });
      }
      if (data.type === 'set-numeric') {
        return new StateOperation('actuate-numeric', data.name, args, {
          value: data.value, numericOperation: '=',
        });
      }
    }

    switch (data.type) {
      case 'assert':
        return new StateOperation('assert', data.name, args, {
          owner, ownerIsVariable: !!data.ownerVar, strength: data.strength ?? 1.0,
          negated: data.negated ?? false,
        });
      case 'retract':
        return new StateOperation('retract', data.name, args, {
          owner, ownerIsVariable: !!data.ownerVar, strength: data.strength ?? 1.0,
          negated: data.negated ?? false,
        });
      case 'adjust-numeric':
        return new StateOperation('adjust-numeric', data.name, args, {
          delta: data.delta, owner, ownerIsVariable: !!data.ownerVar,
        });
      case 'set-numeric':
        return new StateOperation('set-numeric', data.name, args, {
          value: data.value, owner, ownerIsVariable: !!data.ownerVar, strength: data.strength ?? 1.0,
        });
      default:
        throw new Error(`Unknown state operation type: "${data.type}"`);
    }
  }

  resolveArgs(args) {
    return args.map(arg => {
      if (arg === null) return null;
      if (typeof arg === 'string' && arg.startsWith('?')) return new LogicalVariable(arg.slice(1));
      return arg;
    });
  }
}
