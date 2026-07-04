import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { toFactArg } from '../entityValue.js';

// Compares two already-bound operands: a bound variable against a literal or
// another bound variable — e.g. `?d <= 2`, `?t = 5`, `?SELF != ?ENEMY`. It is a
// pure filter: it binds nothing and requires both operands to be bound by other
// (positive) predicates. `=` / `!=` compare by value/identity (any type);
// ordering operators require both sides to be numbers.
export class VariableComparisonPredicate extends Predicate {
  constructor(left, operator, right) {
    super();
    this.left     = left;      // LogicalVariable
    this.operator = operator;  // '=' | '!=' | '>' | '>=' | '<' | '<='
    this.right    = right;     // LogicalVariable | literal (number/string)
  }

  evaluate(binding, _evaluationContext) {
    const lv = binding.resolve(this.left);
    if (lv === undefined) return false;
    const rv = this.right instanceof LogicalVariable ? binding.resolve(this.right) : this.right;
    if (rv === undefined) return false;

    const l = toFactArg(lv);
    const r = toFactArg(rv);
    switch (this.operator) {
      case '=':  return l === r;
      case '!=': return l !== r;
      case '>':  case '>=':
      case '<':  case '<=':
        if (typeof l !== 'number' || typeof r !== 'number') return false;
        return this.operator === '>'  ? l >  r
             : this.operator === '>=' ? l >= r
             : this.operator === '<'  ? l <  r
             :                          l <= r;
    }
    return false;
  }

  getVariables() {
    const vars = [this.left];
    if (this.right instanceof LogicalVariable) vars.push(this.right);
    return vars;
  }

  // A comparison tests but never binds; both operands must be bound elsewhere.
  getBindingVariables()       { return []; }
  getRequiredBoundVariables() { return this.getVariables(); }

  describe(binding) {
    return `${Predicate.renderArg(this.left, binding)} ${this.operator} ${Predicate.renderArg(this.right, binding)}`;
  }

  toString() {
    const r = this.right instanceof LogicalVariable ? `?${this.right.name}` : this.right;
    return `?${this.left.name} ${this.operator} ${r}`;
  }
}
