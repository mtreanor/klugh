import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';

// Event-enumeration check: `pred(args) [when: ?t]` binds `?t` to every tick at
// which the fact became true — one binding per assertion event (reassertions
// after a retraction included), not per tick the fact was continuously active.
//
// During binding generation the tick variable is a *dependent* enumeration
// source: its candidate ticks come from getAssertionTicks(name, resolvedArgs),
// so the fact's other args must be bound first. RuleEvaluator orders tick
// variables last (they are always enumeration sinks) to guarantee this.
//
// By evaluation time the tick variable is already bound, so evaluate() is a
// point check — was the fact asserted at that tick? That also handles a reused,
// already-bound tick variable (the same `?t` on two `[when:]` predicates, or
// one filtered by `?t = N`) as a boolean test, without re-enumerating.
export class WhenPredicate extends Predicate {
  constructor(name, args, tickVar) {
    super();
    this.name    = name;
    this.args    = args;
    this.tickVar = tickVar;
  }

  evaluate(binding, evaluationContext) {
    const tick = binding.resolve(this.tickVar);
    if (tick === null || tick === undefined) return false;
    return evaluationContext.getHandler('factStore').wasAssertedAt(this, binding, tick, evaluationContext);
  }

  // Candidate ticks for enumerating this predicate's tick variable — the ticks
  // at which the fact (with its other args resolved) was asserted.
  assertionTicks(binding, evaluationContext) {
    return evaluationContext.getHandler('factStore').assertionTicksFor(this, binding, evaluationContext);
  }

  getVariables() {
    const vars = this.args.filter(a => a instanceof LogicalVariable);
    vars.push(this.tickVar);
    return vars;
  }

  describe(binding) {
    const argsStr = this.args.map(a => Predicate.renderArg(a, binding)).join(', ');
    return `${this.name}(${argsStr}) [when: ${Predicate.renderArg(this.tickVar, binding)}]`;
  }

  toString() {
    const argsStr = this.args.map(a => a?.toString() ?? '_').join(', ');
    return `${this.name}(${argsStr}) [when: ?${this.tickVar.name}]`;
  }
}
