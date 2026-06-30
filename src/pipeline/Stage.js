export class Stage {
  constructor({
    ruleset           = null,
    actionset,
    salienceFloor     = 0,
    selectionStrategy = null,
    preHooks          = [],
    postHooks         = [],
  } = {}) {
    this.ruleset           = ruleset;
    this.actionset         = actionset;
    this.salienceFloor     = salienceFloor;
    this.selectionStrategy = selectionStrategy;
    this.preHooks          = preHooks;
    this.postHooks         = postHooks;
  }
}
