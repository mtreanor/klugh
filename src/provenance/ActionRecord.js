export class ActionRecord {
  constructor({ tick, actionName, binding, utilityBreakdown = null }) {
    this.tick             = tick;
    this.actionName       = actionName;
    this.binding          = binding;
    this.utilityBreakdown = utilityBreakdown;
  }
}
