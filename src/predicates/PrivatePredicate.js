import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

// A predicate evaluated against a specific entity's private store.
// owner is either a LogicalVariable or a concrete entity name string.
export class PrivatePredicate extends Predicate {
  constructor(owner, innerPredicate, { isVariable = true } = {}) {
    super();
    this.owner           = owner;
    this.innerPredicate  = innerPredicate;
    this.isVariable      = isVariable;
  }

  evaluate(binding, evaluationContext) {
    const ownerName = this.resolveOwnerName(binding);
    if (ownerName == null) return false;

    const store = evaluationContext.privateStores?.get(ownerName);
    if (!store) return false;

    return this.innerPredicate.evaluate(binding, evaluationContext.scopedToStore(store));
  }

  resolveOwnerName(binding) {
    if (!this.isVariable) return this.owner;

    const resolved = binding.resolve(this.owner);
    if (resolved == null) return null;
    if (typeof resolved === 'object' && 'name' in resolved) return resolved.name;
    return resolved;
  }

  getVariables() {
    return this.innerPredicate.getVariables();
  }

  getBindingVariables() {
    return this.innerPredicate.getBindingVariables();
  }

  getRequiredBoundVariables() {
    return this.innerPredicate.getRequiredBoundVariables();
  }

  describe(binding) {
    const ownerStr = this.isVariable
      ? Predicate.renderArg(this.owner, binding)
      : this.owner;
    return `${ownerStr}.${this.innerPredicate.describe(binding)}`;
  }

  toString() {
    const ownerStr = this.isVariable ? this.owner.toString() : this.owner;
    return `${ownerStr}.${this.innerPredicate.toString()}`;
  }
}
