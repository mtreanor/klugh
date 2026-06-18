import { Fact } from '../Fact.js';
import { Binding } from '../Binding.js';
import { applyStateChange } from '../stateOperations/applyStateChange.js';
import { StateOperationLoader } from './StateOperationLoader.js';

export class StateLoader {
  constructor(predicateSchema = null) {
    this.stateOperationLoader = new StateOperationLoader(predicateSchema);
  }

  load({ worldState, privateStates }, world) {
    const groundBinding = new Binding();

    for (const entry of worldState) {
      this.applyEntry(entry, world.factStore, groundBinding, world);
    }

    for (const [entityName, assertions] of privateStates) {
      const store = world.getPrivateStore(entityName);
      if (!store) {
        throw new Error(`Entity "${entityName}" has no private store — declare privateStore on its entity type`);
      }
      for (const entry of assertions) {
        this.applyEntry(entry, store, groundBinding, world);
      }
    }
  }

  applyEntry(entry, defaultStore, groundBinding, world) {
    if (entry.tick !== undefined) {
      // Backdating must preserve the fact's value (set-numeric) and polarity
      // (-pred) just like the non-backdated path does.
      const fact = entry.type === 'set-numeric'
        ? Fact.withValue(entry.name, entry.args, entry.value)
        : new Fact(entry.name, ...entry.args, { negated: entry.negated ?? false });
      defaultStore.assertAt(fact, entry.tick, null, entry.strength ?? 1.0);
      return;
    }

    const operation = this.stateOperationLoader.buildStateOperation(entry);
    const targetFactStore = (entry.ownerVar || entry.ownerEntity) ? null : defaultStore;

    applyStateChange(operation, groundBinding, world.queryHandlers, {
      privateStores:   world.privateStores,
      targetFactStore,
    });
  }
}

// Backward-compatible alias.
export class WorldStateLoader extends StateLoader {
  load(worldState, world) {
    super.load({ worldState, privateStates: new Map() }, world);
  }
}
