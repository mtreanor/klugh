import { Binding } from '../Binding.js';

let nextId = 1;

export class PlanRecord {
  constructor({ goal, plannedSteps, plannedAtTick }) {
    this.id            = nextId++;
    this.goal          = goal;
    this.plannedSteps  = plannedSteps;
    this.plannedAtTick = plannedAtTick;
    this.status        = 'active';
  }

  checkGoal(world) {
    const evalCtx = world.createEvaluationContext();
    const binding = new Binding();
    const satisfied = this.goal.every(p => p.evaluate(binding, evalCtx));
    if (satisfied) this.status = 'succeeded';
    return satisfied;
  }

  succeed()  { this.status = 'succeeded'; }
  fail()     { this.status = 'failed'; }
  abandon()  { this.status = 'abandoned'; }
}
