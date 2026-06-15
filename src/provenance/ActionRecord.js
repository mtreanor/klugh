export class ActionRecord {
  constructor({ tick, action, binding, utilityBreakdown = null, planRecord = null }) {
    this.tick             = tick;
    this.action           = action;
    this.binding          = binding;
    this.utilityBreakdown = utilityBreakdown;
    this.planRecord       = planRecord;
  }
}
