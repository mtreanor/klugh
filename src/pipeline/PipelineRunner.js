import { Binding } from '../Binding.js';
import { RuleEvaluator } from '../RuleEvaluator.js';
import { applyStateChange } from '../stateOperations/applyStateChange.js';
import { selectCandidates } from './SelectionStrategy.js';

export class PipelineRunner {
  constructor(engine) {
    this.engine        = engine;
    this.ruleEvaluator = new RuleEvaluator();
  }

  run(pipeline, initialBinding = {}) {
    const binding = this.engine.resolveBinding(initialBinding);
    this._runHooks(pipeline.preHooks, binding);
    this._runStage(pipeline, pipeline.entry, binding);
  }

  // Runs one stage from scratch: preHooks → impulses → score → select → commit.
  _runStage(pipeline, stageName, binding) {
    const stage = pipeline.stages[stageName];
    if (!stage) throw new Error(`Pipeline "${pipeline.name}": stage "${stageName}" not found`);

    const stageBinding = this._runHooks(stage.preHooks, binding);
    if (stage.ruleset) this._applyImpulses(stage.ruleset, stageBinding);

    const strategy = stage.selectionStrategy ?? pipeline.selectionStrategy ?? 'highestUtility';
    const floor    = stage.salienceFloor ?? 0;

    const candidates = this.engine.scoreActionset(stage.actionset, this._toPartial(stageBinding))
      .filter(c => c.score >= floor);
    const winners = selectCandidates(candidates, strategy);

    for (const winner of winners) {
      this._commitAndRoute(pipeline, stageName, winner);
    }
  }

  // Executes a selected candidate, fires postHooks, then either routes to child
  // stages (pooling their candidates and selecting one) or fires pipeline postHooks
  // when terminal.
  _commitAndRoute(pipeline, stageName, candidate) {
    const stage = pipeline.stages[stageName];

    this.engine.execute(candidate);
    const outBinding = this._runHooks(stage.postHooks, candidate.binding);

    if (candidate.action.routesTo) {
      const childStageNames = [].concat(candidate.action.routesTo);
      const pool = [];

      for (const childStageName of childStageNames) {
        const childStage = pipeline.stages[childStageName];
        if (!childStage) throw new Error(`Pipeline "${pipeline.name}": stage "${childStageName}" not found (routed from "${candidate.action.name}")`);

        const childBinding = this._runHooks(childStage.preHooks, outBinding);
        if (childStage.ruleset) this._applyImpulses(childStage.ruleset, childBinding);

        const childCandidates = this.engine.scoreActionset(childStage.actionset, this._toPartial(childBinding))
          .filter(c => c.score >= (childStage.salienceFloor ?? 0));
        pool.push(...childCandidates.map(c => ({ ...c, _stageName: childStageName })));
      }

      // When multiple stages are pooled, use the pipeline-level strategy; with
      // a single route, the child stage's own strategy applies.
      const childStrategy = childStageNames.length === 1
        ? (pipeline.stages[childStageNames[0]].selectionStrategy ?? pipeline.selectionStrategy ?? 'highestUtility')
        : (pipeline.selectionStrategy ?? 'highestUtility');

      const childWinners = selectCandidates(pool, childStrategy);
      for (const childWinner of childWinners) {
        this._commitAndRoute(pipeline, childWinner._stageName, childWinner);
      }
    } else {
      this._runHooks(pipeline.postHooks, outBinding);
    }
  }

  // Runs an impulse ruleset single-pass with the given binding, applying all
  // fully-satisfied rule firings. Used for += accumulation into ephemeral
  // numerics before scoring — must NOT be run via engine.runRuleset, which
  // loops to fixpoint and never terminates on accumulating rules.
  _applyImpulses(rulesetName, binding) {
    const rules = this.engine.rulesets.get(rulesetName);
    if (!rules) return;
    const ctx    = this.engine.world.createEvaluationContext();
    const active = this.ruleEvaluator.evaluate(rules, this.engine.world.entityRegistry, ctx, binding, this.engine.schema);
    for (const [rule, applications] of active) {
      for (const application of applications) {
        if (!application.isFullySatisfied()) continue;
        for (const effect of rule.effects) {
          applyStateChange(effect, application.binding, this.engine.world.queryHandlers, {
            privateStores: this.engine.world.privateStores,
          });
        }
      }
    }
  }

  // Runs a hook array in order, threading the binding through any hooks that
  // transform it (swap-roles). Returns the final binding.
  _runHooks(hooks, binding) {
    let current = binding;
    for (const hook of hooks) {
      const next = this._applyHook(hook, current);
      if (next != null) current = next;
    }
    return current;
  }

  _applyHook(hook, binding) {
    if (hook.type === 'ruleset') {
      this.engine.runRuleset(hook.name);
      return null;
    }
    if (hook.type === 'swap-roles') {
      return this._swapRoles(hook.roles, binding);
    }
    throw new Error(`Unknown hook type: "${hook.type}"`);
  }

  // Atomically swaps two role variables in a binding. Both values are read from
  // the incoming binding before either is written, so the swap is simultaneous.
  _swapRoles([a, b], binding) {
    const aVal = binding.assignments.get(a);
    const bVal = binding.assignments.get(b);
    const next = new Map(binding.assignments);
    if (bVal !== undefined) next.set(a, bVal); else next.delete(a);
    if (aVal !== undefined) next.set(b, aVal); else next.delete(b);
    return new Binding(next);
  }

  _toPartial(binding) {
    const partial = {};
    for (const [name, value] of binding.assignments) partial[name] = value;
    return partial;
  }
}
