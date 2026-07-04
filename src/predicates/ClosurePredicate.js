import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { toFactArg } from '../entityValue.js';

const key = v => String(toFactArg(v));

// Bounded transitive closure: `pred(?X, ?Y, ...context) [degrees: N] [dist: ?d]`.
// `?Y` binds to every node reachable from `?X` by 1..N hops of `pred`, holding
// any context args (positions 2+) fixed across the walk. `?d`, if present, binds
// the shortest hop-count to each reached node.
//
// The recursion is sealed inside this one predicate's evaluation (a bounded
// frontier BFS), so it needs no change to RuleCycleDetector — and `this.name`
// (the edge relation) makes the closure's dependency on that relation visible to
// both cycle detectors, exactly as any leaf predicate would.
//
// The edge relation may be any binary predicate — stored boolean, derived, or
// sensor — which is why neighbours are found by *evaluating* the edge against
// candidate targets rather than only reading the fact store.
export class ClosurePredicate extends Predicate {
  constructor(name, args, degrees, distVar, edgePredicate, edgeVars, toType) {
    super();
    this.name          = name;         // edge relation name (also the cycle-detection key)
    this.args          = args;         // [from, to, ...context]
    this.degrees       = degrees;      // max hops N
    this.distVar       = distVar;      // LogicalVariable | null
    this.edgePredicate = edgePredicate; // Predicate over [__cfrom, __cto, ...context]
    this.fromVar       = edgeVars.from; // LogicalVariable('__cfrom')
    this.toVar         = edgeVars.to;   // LogicalVariable('__cto')
    this.toType        = toType;       // entity type of the target, for candidate enumeration
  }

  get fromArg() { return this.args[0]; }
  get toArg()   { return this.args[1]; }

  // Nodes directly reachable from `node` via the edge relation, honouring any
  // context args bound in `binding`. Evaluates the edge per candidate target so
  // stored / derived / sensor relations all work uniformly.
  _neighbours(node, binding, evaluationContext) {
    const candidates = evaluationContext.entityRegistry?.get(this.toType) ?? [];
    const out = [];
    for (const cand of candidates) {
      const b = binding.extend(this.fromVar, node).extend(this.toVar, cand);
      if (this.edgePredicate.evaluate(b, evaluationContext)) out.push(cand);
    }
    return out;
  }

  // BFS from the resolved `from`. Returns Map(key -> { node, dist }) of reachable
  // nodes with their shortest hop-count, excluding the origin.
  _reachable(binding, evaluationContext) {
    const out = new Map();
    const from = binding.resolve(this.fromArg);
    if (from === undefined || from === null) return out;

    const originKey = key(from);
    const visited = new Set([originKey]);
    let frontier = [from];
    for (let d = 1; d <= this.degrees && frontier.length > 0; d++) {
      const next = [];
      for (const node of frontier) {
        for (const nb of this._neighbours(node, binding, evaluationContext)) {
          const k = key(nb);
          if (!visited.has(k)) {
            visited.add(k);
            out.set(k, { node: nb, dist: d });
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  // The reachable node values (for aggregate counting-variable enumeration).
  reachableNodes(binding, evaluationContext) {
    return [...this._reachable(binding, evaluationContext).values()].map(r => r.node);
  }

  // Enumeration hook for RuleEvaluator: one entry per reachable node consistent
  // with any already-bound/ground `to` and `dist`, each a list of [variable,
  // value] assignments to add (only for the free outputs).
  enumerate(binding, evaluationContext) {
    const reachable = this._reachable(binding, evaluationContext);
    const toIsVar   = this.toArg instanceof LogicalVariable;
    const toBound   = toIsVar ? binding.resolve(this.toArg) : this.toArg;
    const distBound = this.distVar ? binding.resolve(this.distVar) : undefined;

    const rows = [];
    for (const { node, dist } of reachable.values()) {
      if (toIsVar) {
        if (toBound !== undefined && key(toBound) !== key(node)) continue;
      } else if (key(this.toArg) !== key(node)) {
        continue; // ground target must match
      }
      if (this.distVar && distBound !== undefined && distBound !== dist) continue;

      const assignments = [];
      if (toIsVar && toBound === undefined)                  assignments.push([this.toArg, node]);
      if (this.distVar && distBound === undefined)           assignments.push([this.distVar, dist]);
      rows.push(assignments);
    }
    return rows;
  }

  // Shortest path of node values from `from` to the resolved `to` (inclusive),
  // or null if `to` is not reachable within the bound. Used for provenance.
  shortestPath(binding, evaluationContext) {
    const from = binding.resolve(this.fromArg);
    const to   = this.toArg instanceof LogicalVariable ? binding.resolve(this.toArg) : this.toArg;
    if (from == null || to == null) return null;
    const fromKey = key(from), toKey = key(to);
    if (fromKey === toKey) return null;

    const parent    = new Map([[fromKey, null]]);
    const nodeByKey = new Map([[fromKey, from]]);
    let frontier = [from];
    for (let d = 1; d <= this.degrees && frontier.length > 0; d++) {
      const next = [];
      for (const node of frontier) {
        for (const nb of this._neighbours(node, binding, evaluationContext)) {
          const k = key(nb);
          if (parent.has(k)) continue;
          parent.set(k, key(node));
          nodeByKey.set(k, nb);
          if (k === toKey) {
            const path = [];
            for (let cur = toKey; cur !== null; cur = parent.get(cur)) path.unshift(nodeByKey.get(cur));
            return path;
          }
          next.push(nb);
        }
      }
      frontier = next;
    }
    return null;
  }

  evaluate(binding, evaluationContext) {
    const to = this.toArg instanceof LogicalVariable ? binding.resolve(this.toArg) : this.toArg;
    if (to === undefined || to === null) return false;
    const hit = this._reachable(binding, evaluationContext).get(key(to));
    if (!hit) return false;
    if (this.distVar) {
      const d = binding.resolve(this.distVar);
      if (d !== undefined && d !== hit.dist) return false;
    }
    return true;
  }

  getVariables() {
    const vars = this.args.filter(a => a instanceof LogicalVariable);
    if (this.distVar) vars.push(this.distVar);
    return vars;
  }

  _modifiers() {
    return this.distVar ? `[degrees: ${this.degrees}] [dist: ?${this.distVar.name}]` : `[degrees: ${this.degrees}]`;
  }

  describe(binding) {
    const argsStr = this.args.map(a => Predicate.renderArg(a, binding)).join(', ');
    return `${this.name}(${argsStr}) ${this._modifiers()}`;
  }

  toString() {
    const argsStr = this.args.map(a => a?.toString?.() ?? '_').join(', ');
    return `${this.name}(${argsStr}) ${this._modifiers()}`;
  }
}
