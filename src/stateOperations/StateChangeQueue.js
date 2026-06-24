import { applyStateChange } from './applyStateChange.js';

export class StateChangeQueue {
  constructor() {
    this.deliberation = [];
    this.tickEnd      = [];
  }

  enqueue(operation, binding, queryHandlers, { flush = 'deliberation', deltaOverride = null, privateStores = null, provenance = null, world = null, action = null } = {}) {
    this.queueFor(flush).push({ operation, binding, queryHandlers, deltaOverride, privateStores, provenance, world, action });
  }

  apply(operation, binding, queryHandlers, { deltaOverride = null, privateStores = null } = {}) {
    applyStateChange(operation, binding, queryHandlers, { deltaOverride, privateStores });
  }

  flush(flushPoint, queryHandlers, privateStores = null) {
    if (flushPoint === 'deliberation') this.flushDeliberation(queryHandlers, privateStores);
    else if (flushPoint === 'tickEnd') this.flushTickEnd(queryHandlers, privateStores);
    else throw new Error(`Unknown flush point: "${flushPoint}"`);
  }

  clear(flushPoint = null) {
    if (flushPoint === null) {
      this.deliberation = [];
      this.tickEnd      = [];
      return;
    }
    if (flushPoint === 'deliberation') this.deliberation = [];
    else if (flushPoint === 'tickEnd') this.tickEnd = [];
    else throw new Error(`Unknown flush point: "${flushPoint}"`);
  }

  queueFor(flushPoint) {
    if (flushPoint === 'deliberation') return this.deliberation;
    if (flushPoint === 'tickEnd')      return this.tickEnd;
    throw new Error(`Unknown flush point: "${flushPoint}"`);
  }

  flushDeliberation(queryHandlers, privateStores = null) {
    for (const entry of this.deliberation) {
      const { operation, binding, deltaOverride, provenance, world, action } = entry;
      const stores = entry.privateStores ?? privateStores;

      if (operation.type === 'adjust-numeric' && !operation.owner) {
        const delta = deltaOverride ?? operation.delta;
        const args  = operation.resolveArgs(binding);
        queryHandlers.getHandler('numeric').adjustValue(operation.name, args, delta, null, provenance);
        continue;
      }

      applyStateChange(operation, binding, queryHandlers, { deltaOverride, privateStores: stores, world, action });
    }

    this.deliberation = [];
  }

  flushTickEnd(queryHandlers, privateStores = null) {
    for (const { operation, binding, deltaOverride, privateStores: entryStores, provenance, world, action } of this.tickEnd) {
      applyStateChange(operation, binding, queryHandlers, {
        deltaOverride,
        privateStores: entryStores ?? privateStores,
        provenance,
        world,
        action,
      });
    }
    this.tickEnd = [];
  }
}
