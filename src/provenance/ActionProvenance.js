export class ActionProvenance {
  constructor(actionName, binding) {
    this.type       = 'action-effect';
    this.actionName = actionName;
    this.binding    = binding;
  }
}
