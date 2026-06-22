import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

// Computes an aggregate function (avg, sum, max, min) over a numeric predicate,
// filtered by a conjunction of boolean predicates, and compares the result to a
// right-hand side value expression.
//
// Counting variables (from `_` wildcards) are enumerated over entity lists; one
// counting variable is created per unique entity type across the conjunction, so
// `_` positions of the same type are implicitly joined.
//
// rhs shapes:
//   { kind: 'literal',   value }
//   { kind: 'numeric',   name, args }          — resolved via resolveNumericValue
//   { kind: 'aggregate', predicate }            — another AggregatePredicate (computeValue only)
export class AggregatePredicate extends Predicate {
  constructor(fn, filterPredicates, valuePred, countingVars, countingVarTypes, operator, rhs) {
    super();
    this.fn               = fn;               // 'avg' | 'sum' | 'max' | 'min'
    this.filterPredicates = filterPredicates; // Predicate[]
    this.valuePred        = valuePred;         // { name, args: (string|LogicalVariable)[] }
    this.countingVars     = countingVars;      // LogicalVariable[]
    this.countingVarTypes = countingVarTypes;  // Map<varName, entityType>
    this.operator         = operator;          // '>' | '>=' | '<' | '<=' | '=' | '!='
    this.rhs              = rhs;               // value expression or null (inner aggregate only)
  }

  evaluate(binding, evaluationContext) {
    const aggregateValue = this.computeValue(binding, evaluationContext);
    if (aggregateValue === null) return false;
    const rhsValue = this._resolveRhs(binding, evaluationContext);
    if (rhsValue === null) return false;
    return compareNumbers(aggregateValue, this.operator, rhsValue);
  }

  // Returns the raw aggregate value without performing the comparison. Used when
  // this predicate is itself the RHS of another aggregate.
  computeValue(binding, evaluationContext) {
    const entityRegistry = evaluationContext.entityRegistry;
    const entityLists    = this.countingVars.map(v => {
      const type = this.countingVarTypes.get(v.name) ?? 'agent';
      return entityRegistry.get(type) ?? [];
    });

    const values = [];
    for (const combination of cartesian(entityLists)) {
      let extendedBinding = binding;
      for (let i = 0; i < this.countingVars.length; i++) {
        extendedBinding = extendedBinding.extend(this.countingVars[i], combination[i]);
      }

      let passes = true;
      for (const pred of this.filterPredicates) {
        if (!pred.evaluate(extendedBinding, evaluationContext)) { passes = false; break; }
      }
      if (!passes) continue;

      const resolvedArgs = resolveArgs(this.valuePred.args, extendedBinding);
      const value        = evaluationContext.resolveNumericValue(this.valuePred.name, resolvedArgs);
      if (value !== null && value !== undefined) values.push(value);
    }

    return applyFn(this.fn, values);
  }

  getVariables() {
    const countingNames = new Set(this.countingVars.map(v => v.name));
    const seen = new Map();
    const add  = v => { if (v instanceof LogicalVariable && !countingNames.has(v.name)) seen.set(v.name, v); };

    for (const pred of this.filterPredicates) for (const v of pred.getVariables()) add(v);
    for (const arg of this.valuePred.args) add(arg);

    if (this.rhs?.kind === 'numeric') {
      for (const arg of this.rhs.args) add(arg);
    } else if (this.rhs?.kind === 'aggregate') {
      for (const v of this.rhs.predicate.getVariables()) add(v);
    }

    return [...seen.values()];
  }

  describe(binding) {
    const inner  = this._describeInner(binding);
    const rhsStr = this._describeRhs(binding);
    return `${this.fn}|${inner}| ${this.operator} ${rhsStr}`;
  }

  toString() {
    const valueStr  = `${this.valuePred.name}(${this.valuePred.args.map(a => a?.toString?.() ?? a).join(', ')})`;
    const filterStr = this.filterPredicates.map(p => p.toString()).join(' ^ ');
    const inner     = filterStr ? `${valueStr} ^ ${filterStr}` : valueStr;
    const rhsStr    = this._stringifyRhs();
    return `${this.fn}|${inner}| ${this.operator} ${rhsStr}`;
  }

  _resolveRhs(binding, evaluationContext) {
    const rhs = this.rhs;
    if (rhs.kind === 'literal')   return rhs.value;
    if (rhs.kind === 'numeric')   return evaluationContext.resolveNumericValue(rhs.name, resolveArgs(rhs.args, binding));
    if (rhs.kind === 'aggregate') return rhs.predicate.computeValue(binding, evaluationContext);
    return null;
  }

  _describeInner(binding) {
    const valueStr  = `${this.valuePred.name}(${this.valuePred.args.map(a => Predicate.renderArg(a, binding)).join(', ')})`;
    const filterStr = this.filterPredicates.map(p => p.describe(binding)).join(' ^ ');
    return filterStr ? `${valueStr} ^ ${filterStr}` : valueStr;
  }

  _describeRhs(binding) {
    const rhs = this.rhs;
    if (rhs.kind === 'literal')   return String(rhs.value);
    if (rhs.kind === 'numeric')   return `${rhs.name}(${rhs.args.map(a => Predicate.renderArg(a, binding)).join(', ')})`;
    if (rhs.kind === 'aggregate') return rhs.predicate.describe(binding);
    return '?';
  }

  _stringifyRhs() {
    const rhs = this.rhs;
    if (rhs.kind === 'literal')   return String(rhs.value);
    if (rhs.kind === 'numeric')   return `${rhs.name}(${rhs.args.map(a => a?.toString?.() ?? a).join(', ')})`;
    if (rhs.kind === 'aggregate') return rhs.predicate.toString();
    return '?';
  }
}

function resolveArgs(args, binding) {
  return args.map(arg => {
    if (!(arg instanceof LogicalVariable)) return arg;
    const value = binding.resolve(arg);
    return (value !== null && typeof value === 'object' && 'name' in value) ? value.name : value;
  });
}

function applyFn(fn, values) {
  if (values.length === 0) return null;
  switch (fn) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max': return Math.max(...values);
    case 'min': return Math.min(...values);
  }
}

function compareNumbers(left, operator, right) {
  switch (operator) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>':  return left >  right;
    case '<':  return left <  right;
    case '!=': return left !== right;
    default:   return left === right; // '='
  }
}

function* cartesian(lists) {
  if (lists.length === 0) { yield []; return; }
  const [head, ...tail] = lists;
  for (const item of head) {
    for (const rest of cartesian(tail)) yield [item, ...rest];
  }
}
