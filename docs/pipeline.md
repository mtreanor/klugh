# Pipelines

A **pipeline** is a named, declarative layer over the engine. Where [actions](actions.md) give you scoreable units of behaviour and `scoreActionset` gives you one pass of *score → pick → execute*, a pipeline strings several of those passes together: a graph of **stages** connected by `routes-to` links, run from an entry stage to a terminal action in one call.

Each stage pairs an **impulse ruleset** with an **actionset**. Running a stage means: run its hooks, fire its impulse rules to prime scores, score the actionset, filter by a salience floor, pick winners with a selection strategy, execute them, and — if a winning action carries a `routes-to` — continue into the named child stage. When a winner has no `routes-to`, it is *terminal*: the pipeline's `postHooks` fire and that branch ends.

```javascript
import { Pipeline, Stage, PipelineRunner } from 'klugh';

const pipeline = new Pipeline('turn', {
  entry: 'choose-stage',
  stages: {
    'choose-stage': new Stage({ actionset: 'moves' }),
  },
});

new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });
```

::: tip DSL surface
The pipeline *structure* — stages, hooks, selection strategies — is constructed in JavaScript (`new Pipeline`, `new Stage`). The only pipeline-aware DSL is the `routes-to:` clause on an action, which names the stage to continue into. Everything else lives in your ordinary actionset and ruleset files.
:::

---

## Anatomy of a stage

```javascript
new Stage({
  ruleset:           'priming-rules',   // optional impulse ruleset, single-pass
  actionset:         'moves',           // required — the actions to score
  salienceFloor:     0.01,              // drop candidates scoring below this
  selectionStrategy: 'highestUtility',  // string or { type, groupBy }
  preHooks:          [],                // run before scoring
  postHooks:         [],                // run after a winner executes
});
```

| Field | Purpose |
|-------|---------|
| `ruleset` | An **impulse** ruleset run *single-pass* before scoring — typically `+=` accumulation into ephemeral numerics that the actions then read as utility. Unlike `postHooks` rulesets, it does **not** loop to fixpoint. |
| `actionset` | The named actionset to score for this stage. |
| `salienceFloor` | Candidates scoring below this are discarded. Defaults to `0`. |
| `selectionStrategy` | How winners are picked from the scored candidates — see [Selection strategies](#selection-strategies). Falls back to the pipeline's strategy, then `highestUtility`. |
| `preHooks` / `postHooks` | Ordered [hooks](#hooks) that run before scoring / after a winner executes. |

A `Pipeline` carries the same `preHooks` / `postHooks` / `selectionStrategy` at the top level. The pipeline's `preHooks` run once at the start; its `postHooks` run each time a **terminal** action executes.

---

## Example 1 — a single stage

The simplest pipeline is one stage with one terminal action. The runner scores the actionset for the starting binding, picks the highest-scoring eligible candidate, and executes it.

```klugh
// actions/moves.klugh
actionset "moves"

action "rest"
  roles: ?SELF: agent
  utility
    fatigue(?SELF)
  effects
    rested(?SELF)
    fatigue(?SELF) -= 10
```

```javascript
import { Pipeline, Stage, PipelineRunner } from 'klugh';

const pipeline = new Pipeline('turn', {
  entry: 'rest-stage',
  stages: {
    'rest-stage': new Stage({ actionset: 'moves' }),
  },
});

new PipelineRunner(engine).run(pipeline, { SELF: 'alice' });
// alice rests; fatigue drops by 10.
```

With no `routes-to` on `rest`, the action is terminal: the pipeline ends after it executes (and any pipeline `postHooks` fire).

---

## Example 2 — two stages with a responding character

Routing lets one character's choice hand off to another character's reaction. The first stage's winning action carries `routes-to: respond-stage`; before the child stage scores, a `swap-roles` hook flips `?SELF` and `?OTHER` so the *other* agent becomes the actor.

```klugh
// actions/initiate.klugh
actionset "initiate"

action "greet"
  roles: ?SELF: agent, ?OTHER: agent
  preconditions
    knows(?SELF, ?OTHER)
  utility
    friendship(?SELF, ?OTHER)
  effects
    greeted(?SELF, ?OTHER)
  routes-to: respond-stage
```

```klugh
// actions/respond.klugh
actionset "respond"

action "greet back"
  roles: ?SELF: agent, ?OTHER: agent
  utility
    friendship(?SELF, ?OTHER)
  effects
    greeted(?SELF, ?OTHER)

action "ignore"
  roles: ?SELF: agent, ?OTHER: agent
  utility
    0.2
  effects
    snubbed(?SELF, ?OTHER)
```

```javascript
import { Pipeline, Stage, PipelineRunner } from 'klugh';

const pipeline = new Pipeline('exchange', {
  entry: 'initiate-stage',
  stages: {
    'initiate-stage': new Stage({
      actionset: 'initiate',
      // After alice greets bob, swap so bob is ?SELF for the response.
      postHooks: [{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }],
    }),
    'respond-stage': new Stage({ actionset: 'respond' }),
  },
});

new PipelineRunner(engine).run(pipeline, { SELF: 'alice', OTHER: 'bob' });
// 1. initiate-stage: alice greets bob, routes to respond-stage.
// 2. swap-roles hook: ?SELF=bob, ?OTHER=alice.
// 3. respond-stage: bob picks the higher-scoring of "greet back" / "ignore".
```

The route follows the winning action's `routes-to`. The child stage runs its own hooks and impulse ruleset, scores its actionset against the (swapped) binding, and selects a winner — which may itself be terminal or route onward. Only a terminal action fires the pipeline's `postHooks`; routing actions do not.

::: tip Fan-out routing
A `routes-to` may name several child stages (an array, in JS). Their candidates are **pooled** and one selection runs across the union, using the pipeline-level strategy. A single named route uses that child stage's own strategy.
:::

---

## Hooks

Hooks run at stage boundaries and the pipeline edges. Each hook is a small tagged object; a stage threads its binding through them in order.

| Hook | Shape | Effect |
|------|-------|--------|
| Ruleset | `{ type: 'ruleset', name: 'consequences' }` | Runs a consequence ruleset **to fixpoint** (`engine.runRuleset`). Used for world-state settling — e.g. propagating the effects a stage just produced. Does not transform the binding. |
| Swap-roles | `{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }` | Atomically swaps two binding variables. Both values are read before either is written, so the swap is simultaneous. Used for turn-alternating exchanges. |

Note the two ways a stage runs rules:

- **`ruleset` on the `Stage`** — an *impulse* pass, run **once**, for priming utility (e.g. `score(?X) += …` into ephemeral numerics). Must not loop, or accumulating rules would never terminate.
- **`ruleset` *hook*** (in `preHooks` / `postHooks`) — a *consequence* pass, run **to fixpoint**, for settling world state.

---

## Selection strategies

A strategy decides which scored candidates win. The default, `'highestUtility'`, takes the single top-scoring candidate. Add a `groupBy` to instead take **one winner per group** — useful when a stage enumerates many targets and you want the best action *per target* rather than one overall.

`groupBy` comes in two forms.

### String form — group by a binding variable

The string names a role variable. Candidates are grouped by that variable's bound value; the highest scorer in each group wins.

```javascript
new Stage({
  actionset: 'respond',
  selectionStrategy: { type: 'highestUtility', groupBy: 'OTHER' },
});
```

With `?SELF` pre-bound and `?OTHER` free, the stage enumerates a candidate per `?OTHER`. Grouping by `OTHER` yields one winner *for each* `?OTHER` — so `alice` responds to every agent she could respond to, picking her best action toward each.

### Pattern form — group by a key read from world state

When the grouping key isn't a binding variable but something you must *look up*, give `groupBy` a `{ pattern, key }` object. For each candidate, the `pattern` query runs with the candidate's binding as its starting point; free variables in the pattern are enumerated from world state. Candidates are grouped by the `key` variable resolved from those query results, and the highest scorer per key wins.

```javascript
new Stage({
  actionset: 'judge-acts',
  selectionStrategy: {
    type: 'highestUtility',
    groupBy: { pattern: 'role(?ACT, ?actor)', key: 'actor' },
  },
});
```

Here each candidate judges some occurrence `?ACT`, but we want one judgement per distinct *actor* — and the actor is recorded in world state as `role(?ACT, ?actor)`, not carried directly in the binding. The pattern resolves `?actor` from the `role` fact for each candidate's `?ACT`; grouping by `actor` collapses every act by the same agent into a single group, and the highest-scoring act wins it.

A candidate can match several result bindings and so participate in several groups — one winner is still chosen per distinct key. The pattern form needs world-state access, so the runner passes the engine through automatically.

---

## API

| Call | Description |
|------|-------------|
| `new Pipeline(name, { entry, selectionStrategy, preHooks, postHooks, stages })` | Builds a pipeline. `stages` maps stage names to `Stage` instances; `entry` names the first. |
| `new Stage({ ruleset, actionset, salienceFloor, selectionStrategy, preHooks, postHooks })` | Builds one stage. `actionset` is required. |
| `new PipelineRunner(engine)` | Wraps an engine for execution. |
| `runner.run(pipeline, initialBinding)` | Runs the pipeline from its entry stage with the given starting binding (e.g. `{ SELF: 'alice' }`). |
| `selectCandidates(candidates, strategy, engine?)` | The selection primitive. `engine` is required only for the pattern form of `groupBy`. |

See [Actions](actions.md) for how candidates are scored, [Rules](rules.md) for ruleset semantics, and [Action records](action-records.md) for the breakdowns a stage's scoring produces.
