import { Binding } from '../Binding.js';
import { RuleEvaluator } from '../RuleEvaluator.js';
import { inferVariableTypes } from '../inferVariableTypes.js';
import { PlanRecord } from '../provenance/PlanRecord.js';
import { PriorityQueue } from './PriorityQueue.js';

export class Planner {
  constructor(actions, schema) {
    this.actions       = actions;
    this.schema        = schema;
    this.ruleEvaluator = new RuleEvaluator();
  }

  // Generator that yields each plan found, in order of increasing cost.
  // Continues searching after each yield so callers can collect multiple plans.
  // options:
  //   cost(action, binding, snapshot) → number   — step cost; defaults to 0 (BFS order)
  //   validators: [(steps, initialSnapshot) => boolean]  — filter; plans failing any validator are skipped
  *findPlans(goalPredicates, initialSnapshot, { cost, validators = [] } = {}) {
    const queue   = new PriorityQueue();
    const visited = new Set();
    const initKey = initialSnapshot.stateKey();
    queue.push({ snapshot: initialSnapshot, steps: [], totalCost: 0, key: initKey }, 0);

    while (queue.size > 0) {
      const { snapshot, steps, totalCost, key } = queue.pop();
      // Lazy visited check: skip if a cheaper path already processed this state.
      // Goal states are intentionally never added to visited so that multiple
      // distinct paths to the same goal state can each be yielded.
      if (visited.has(key)) continue;

      const evalCtx = snapshot.createEvaluationContext();

      if (this._isGoalSatisfied(goalPredicates, evalCtx)) {
        if (validators.every(v => v(steps, initialSnapshot))) yield steps;
        continue;
      }

      visited.add(key);

      for (const { action, binding, stepCost } of this._expand(snapshot, evalCtx, cost)) {
        const next    = snapshot.apply(action, binding);
        const nextKey = next.stateKey();
        if (visited.has(nextKey)) continue;
        const newCost = totalCost + stepCost;
        queue.push({ snapshot: next, steps: [...steps, { action, binding }], totalCost: newCost, key: nextKey }, newCost);
      }
    }
  }

  // Returns the first (lowest-cost) plan, or null if none exists.
  findPlan(goalPredicates, initialSnapshot, options = {}) {
    const { value, done } = this.findPlans(goalPredicates, initialSnapshot, options).next();
    return done ? null : value;
  }

  // Like findPlan but always returns an object.
  // On success: { steps, nearestMiss: null }
  // On failure: { steps: null, nearestMiss: Predicate[] } — goal predicates still unsatisfied
  //             in the closest state the search reached
  findPlanDetailed(goalPredicates, initialSnapshot, { cost, validators = [] } = {}) {
    const queue   = new PriorityQueue();
    const visited = new Set();
    const initKey = initialSnapshot.stateKey();
    queue.push({ snapshot: initialSnapshot, steps: [], totalCost: 0, key: initKey }, 0);

    const emptyBinding     = new Binding();
    let nearestMiss        = goalPredicates;
    let bestSatisfiedCount = -1;

    while (queue.size > 0) {
      const { snapshot, steps, totalCost, key } = queue.pop();
      if (visited.has(key)) continue;

      const evalCtx     = snapshot.createEvaluationContext();
      const unsatisfied = goalPredicates.filter(p => !p.evaluate(emptyBinding, evalCtx));
      const satisfied   = goalPredicates.length - unsatisfied.length;

      if (satisfied > bestSatisfiedCount) {
        bestSatisfiedCount = satisfied;
        nearestMiss        = unsatisfied;
      }

      if (unsatisfied.length === 0) {
        if (validators.every(v => v(steps, initialSnapshot))) return { steps, nearestMiss: null };
        continue;
      }

      visited.add(key);

      for (const { action, binding, stepCost } of this._expand(snapshot, evalCtx, cost)) {
        const next    = snapshot.apply(action, binding);
        const nextKey = next.stateKey();
        if (visited.has(nextKey)) continue;
        const newCost = totalCost + stepCost;
        queue.push({ snapshot: next, steps: [...steps, { action, binding }], totalCost: newCost, key: nextKey }, newCost);
      }
    }

    return { steps: null, nearestMiss };
  }

  _expand(snapshot, evalCtx, cost) {
    const results = [];
    for (const action of this.actions) {
      const variableTypes = inferVariableTypes(action.preconditions, this.schema);
      const bindings = this.ruleEvaluator.generateAllBindings(
        action.collectVariables(),
        variableTypes,
        snapshot.entityRegistry,
        new Binding(),
        evalCtx,
        action.preconditions
      );
      for (const binding of bindings) {
        if (!action.arePreconditionsMet(binding, evalCtx)) continue;
        results.push({ action, binding, stepCost: cost ? cost(action, binding, snapshot) : 0 });
      }
    }
    return results;
  }

  _isGoalSatisfied(goalPredicates, evalCtx) {
    const emptyBinding = new Binding();
    return goalPredicates.every(p => p.evaluate(emptyBinding, evalCtx));
  }

  // Kept for backward compatibility
  isGoalSatisfied(goalPredicates, evaluationContext) {
    return this._isGoalSatisfied(goalPredicates, evaluationContext);
  }

  commit(steps, goalPredicates, world) {
    const record = new PlanRecord({
      goal:          goalPredicates,
      plannedSteps:  steps,
      plannedAtTick: world.tickTracker.currentTick,
    });
    world.planLog.push(record);
    return record;
  }

  commitFailedAttempt(goalPredicates, world) {
    const record = new PlanRecord({
      goal:          goalPredicates,
      plannedSteps:  [],
      plannedAtTick: world.tickTracker.currentTick,
    });
    record.fail();
    world.planLog.push(record);
    return record;
  }
}
