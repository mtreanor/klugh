export class Stage {
  constructor({
    primingRules      = [],
    actionset,
    salienceFloor     = 0,
    selectionStrategy = null,
    routing,
    routesTo          = null,
    preHooks          = [],
    postHooks         = [],
  } = {}) {
    // routing is required — every stage declares its discipline explicitly, so
    // the routing mode is never an implicit default.
    if (routing !== 'branch' && routing !== 'collect') {
      throw new Error(`Stage routing is required and must be 'branch' or 'collect', got "${routing}"`);
    }
    // primingRules: an ordered array of { type: 'ruleset-single' | 'ruleset-fixpoint', name }
    // — same shape as preHooks/postHooks — run just before this stage scores its
    // actionset, to prime the ephemeral numerics its actions read as utility.
    // Almost always 'ruleset-single' (accumulating += rules); 'ruleset-fixpoint'
    // is available for the rare case priming needs a settled boolean derivation
    // first, but a fixpoint entry here still can't safely carry a +=/-= effect.
    this.primingRules      = primingRules;
    this.actionset         = actionset;
    this.salienceFloor     = salienceFloor;
    this.selectionStrategy = selectionStrategy;
    // Routing discipline:
    //   'branch'  — each winner routes individually. A winner follows its own
    //               action's routes-to when set; otherwise it falls back to the
    //               stage's routesTo. An action's `routes-to: end` is an explicit
    //               terminal that beats the stage default.
    //   'collect' — execute the whole winning group, settle, then route the
    //               *stage* once via routesTo (or, with no routesTo, terminate
    //               and fire the pipeline's postHooks once).
    this.routing           = routing;
    this.routesTo          = routesTo;
    this.preHooks          = preHooks;
    this.postHooks         = postHooks;
  }
}
