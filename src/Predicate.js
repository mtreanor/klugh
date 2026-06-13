import { LogicalVariable } from './LogicalVariable.js';

export class Predicate {
  evaluate(binding, evaluationContext) {
    throw new Error(`${this.constructor.name} must implement evaluate(binding, evaluationContext)`);
  }

  // Returns the LogicalVariables present in this predicate.
  // The RuleEvaluator uses this to know what to search over.
  getVariables() {
    throw new Error(`${this.constructor.name} must implement getVariables()`);
  }

  // Variables this predicate can positively bind during rule enumeration.
  // Negation forms override this to return [] — they test, but never bind.
  getBindingVariables() {
    return this.getVariables();
  }

  // Variables this predicate needs some other (positive) predicate to bind.
  // Used by the RuleEvaluator to reject rules whose negated variables can
  // never be bound — per the language contract, such negations are false.
  getRequiredBoundVariables() {
    return [];
  }

  // Returns a human-readable string with all logical variables substituted for
  // their bound values. Used by display code to render rule applications.
  // Subclasses override this; the default falls back to toString().
  describe(binding) {
    return this.toString();
  }

  // Resolves one predicate argument against a binding for display purposes.
  // LogicalVariables are replaced with their bound value; null becomes '_'.
  static renderArg(arg, binding) {
    if (arg === null) return '_';
    if (arg instanceof LogicalVariable) {
      const value = binding.resolve(arg);
      if (value === null || value === undefined) return '_';
      if (typeof value === 'object' && 'name' in value) return value.name;
      return String(value);
    }
    return String(arg);
  }
}
