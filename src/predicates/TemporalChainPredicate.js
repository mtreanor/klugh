import { Predicate } from '../Predicate.js';
import { LogicalVariable } from '../LogicalVariable.js';
import { toFactArg } from '../entityValue.js';

// True when there exists a sequence of ticks t0 < t1 < ... < tN such that each step's
// fact was asserted at the corresponding tick, and each gap is within the specified window.
//
// steps: [{ name, args, within? }, ...]
// The first step has no 'within'. Each subsequent step's 'within' is the max gap
// in ticks from the previous step's assertion tick (null = any gap).
export class TemporalChainPredicate extends Predicate {
  constructor(steps) {
    super();
    this.steps = steps;
  }

  evaluate(binding, evaluationContext) {
    const handler = evaluationContext.getHandler('factStore');
    const currentTick = evaluationContext.currentTick;
    const resolved = this.steps.map(step => ({
      name:   step.name,
      within: step.within ?? null,
      args:   step.args.map(a => toFactArg(binding.resolve(a))),
    }));
    return this.chainSatisfied(resolved, 0, -Infinity, currentTick, handler, evaluationContext);
  }

  // Recursively checks whether the chain is satisfiable starting from step i,
  // where the previous step was asserted at previousTick (-Infinity = first step).
  // For the first step, a `within` window is anchored against currentTick (i.e.
  // "was true within the last N ticks"); for subsequent steps it is a max gap from
  // the previous step's tick.
  chainSatisfied(steps, i, previousTick, currentTick, handler, evaluationContext) {
    if (i >= steps.length) return true;
    const { name, args, within } = steps[i];
    const ticks = handler.getAssertionTicks(name, args, evaluationContext);
    for (const tick of ticks) {
      if (i === 0 && within !== null) {
        if (tick < currentTick - within) continue;
        if (tick > currentTick) continue;
      } else {
        if (tick <= previousTick) continue;
        if (within !== null && tick > previousTick + within) continue;
      }
      if (this.chainSatisfied(steps, i + 1, tick, currentTick, handler, evaluationContext)) return true;
    }
    return false;
  }

  getVariables() {
    const seen = new Set();
    const vars = [];
    for (const { args } of this.steps) {
      for (const arg of args) {
        if (arg instanceof LogicalVariable && !seen.has(arg.name)) {
          seen.add(arg.name);
          vars.push(arg);
        }
      }
    }
    return vars;
  }

  describe(binding) {
    return this.steps.map((step, i) => {
      const argsStr = step.args.map(a => Predicate.renderArg(a, binding)).join(', ');
      const pred    = `${step.name}(${argsStr})`;
      if (i === 0) {
        return step.within !== null ? `${pred} [history: ${step.within}]` : pred;
      }
      const gap = step.within !== null ? `[${step.within}]` : '';
      return `then${gap} ${pred}`;
    }).join(' ');
  }

  toString() {
    return this.steps.map((step, i) => {
      const argsStr = step.args.map(a => a?.toString() ?? '_').join(', ');
      const pred    = `${step.name}(${argsStr})`;
      if (i === 0) {
        return step.within !== null ? `${pred} [history: ${step.within}]` : pred;
      }
      const gap = step.within !== null ? `[${step.within}]` : '';
      return `then${gap} ${pred}`;
    }).join(' ');
  }
}
