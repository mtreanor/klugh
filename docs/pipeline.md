# Pipelines

A **pipeline** is a named, declarative layer over the engine. Where [actions](actions.md) give you scoreable units of behaviour and `scoreActionset` gives you one pass of *score → pick → execute*, a pipeline strings several of those passes together: a graph of **stages** connected by `routes-to` links, run from an entry stage to a terminal action in one call.

Each stage pairs **priming rules** with an **actionset**. Running a stage means: run its hooks, fire its priming rules to prime scores, score the actionset, filter by a salience floor, pick winners with a selection strategy, execute them, and — if a winning action carries a `routes-to` — continue into the named child stage. When a winner has no `routes-to`, it is *terminal*: the pipeline's `postHooks` fire and that branch ends.

```javascript
import { Pipeline, Stage, PipelineRunner } from 'klugh';

const pipeline = new Pipeline('turn', {
  entry: 'choose-stage',
  stages: {
    'choose-stage': new Stage({ actionset: 'moves', routing: 'branch' }),
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
  primingRules:      [{ type: 'ruleset-single', name: 'score-rules' }],  // optional, run before scoring
  actionset:         'moves',           // required — the actions to score
  routing:           'branch',          // required — 'branch' or 'collect'
  salienceFloor:     0.01,              // drop candidates scoring below this
  selectionStrategy: 'highestUtility',  // string or { type, groupBy }
  preHooks:          [],                // run before scoring
  postHooks:         [],                // run after a winner executes
});
```

| Field | Purpose |
|-------|---------|
| `primingRules` | An ordered array of `{ type: 'ruleset-single' \| 'ruleset-fixpoint', name }` — same shape as `preHooks`/`postHooks` — run just before this stage scores its actionset. Almost always `'ruleset-single'`: typically `+=` accumulation into ephemeral numerics that the actions then read as utility. Unlike `postHooks` rulesets, `'ruleset-single'` does **not** loop to fixpoint. |
| `actionset` | The named actionset to score for this stage. |
| `salienceFloor` | Candidates scoring below this are discarded. Defaults to `0`. |
| `selectionStrategy` | How winners are picked from the scored candidates — see [Selection strategies](#selection-strategies). Falls back to the pipeline's strategy, then `highestUtility`. |
| `routing` | **Required.** `'branch'` or `'collect'` — see [Routing disciplines](#routing-disciplines-branch-vs-collect). |
| `routesTo` | Stage-level destination (a stage name or array). In `collect` routing it is *the* route; in `branch` routing it is the **default** route for winners whose action carries no `routes-to` of its own. |
| `preHooks` / `postHooks` | Ordered [hooks](#hooks) that run before scoring / after a winner executes (`branch`) or once after the group (`collect`). |

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
    'rest-stage': new Stage({ actionset: 'moves', routing: 'branch' }),
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
      routing: 'branch',
      // After alice greets bob, swap so bob is ?SELF for the response.
      postHooks: [{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }],
    }),
    'respond-stage': new Stage({ actionset: 'respond', routing: 'branch' }),
  },
});

new PipelineRunner(engine).run(pipeline, { SELF: 'alice', OTHER: 'bob' });
// 1. initiate-stage: alice greets bob, routes to respond-stage.
// 2. swap-roles hook: ?SELF=bob, ?OTHER=alice.
// 3. respond-stage: bob picks the higher-scoring of "greet back" / "ignore".
```

The route follows the winning action's `routes-to`. The child stage runs its own hooks and priming rules, scores its actionset against the (swapped) binding, and selects a winner — which may itself be terminal or route onward. Only a terminal action fires the pipeline's `postHooks`; routing actions do not.

::: tip Fan-out routing
A `routes-to` may name several child stages (an array, in JS). Their candidates are **pooled** and one selection runs across the union, using the pipeline-level strategy. A single named route uses that child stage's own strategy.
:::

---

## Routing disciplines: branch vs collect

The examples above use the **branch** discipline: each winning action carries its own continuation, so a stage with *N* winners produces up to *N* independent continuations, and each child stage scores against the world *as that one winner left it*. This is right for agent-turn pipelines — alice greets bob, bob responds; one actor's choice hands to the next.

A winner's continuation is resolved as `action.routes-to ?? stage.routesTo`: an action's own `routes-to` wins, and when it has none the winner falls back to the **stage default**. Because the next stage is so often the same for every action in a stage, set it once on the stage and only annotate the actions that diverge:

```javascript
new Stage({
  actionset: 'initiate',
  routing: 'branch',
  routesTo: 'respond-stage',   // default continuation for this stage's winners
});
```

To make a single action **terminal** despite a stage default — ending that branch and firing the pipeline's `postHooks` — route it to the reserved sentinel `end`:

```klugh
action "wait"
  roles: ?SELF: agent
  utility 0.2
  routes-to: end          // beats the stage default; this branch stops here
```

`end` is reserved: no stage may be named `end`, and the runner throws if one is.

Generation/transform pipelines want the opposite: apply the **whole group**, settle, then advance once. "Pick one mechanic per edge, *then* add a single win condition against the finished set." That is the **collect** discipline, set on the `Stage`:

```javascript
new Stage({
  actionset: 'micro-rhetoric',
  selectionStrategy: { type: 'highestUtility', groupBy: 'E' },
  routing: 'collect',      // required: 'branch' or 'collect'
  routesTo: 'structure',   // the stage routes once, after the whole group
});
```

A `collect` stage executes every selected winner, runs its `postHooks` **once**, then routes the *stage* once via `routesTo` (which the child sees with the stage's incoming binding — the group has no single winner to carry a binding onward). With no `routesTo`, the group is terminal and the pipeline's `postHooks` fire once.

| | `branch` | `collect` |
|---|---|---|
| route source | each winner's `action.routes-to ?? stage.routesTo` | the stage's `routesTo` |
| route fires | once per winner | once per stage |
| `postHooks` | after **each** winner | once, after the **group** |
| child's starting binding | that winner's (post-hook) binding | the stage's incoming binding |
| terminal | action with no route and no stage default, or `routes-to: end` | stage with no `routesTo` |

Routing always re-scores the destination against **fresh derivations** — a stage mutates the world the next one queries, so derived-fact caches are invalidated between stages.

::: tip Collect fan-out
A collect stage's `routesTo` may also be an array — each named child then runs **independently**, once, with the same post-group binding (no pooled selection; that's a branch-mode feature).
:::

---

## Hooks

Hooks run at stage boundaries and the pipeline edges. Each hook is a small tagged object; a stage threads its binding through them in order.

| Hook | Shape | Effect |
|------|-------|--------|
| Ruleset (single) | `{ type: 'ruleset-single', name: 'priming-rules' }` | Runs a ruleset **single-pass**, scoped to the current binding (`Engine.runRulesetSingle`). The only safe option for rules with `+=`/`-=` effects — a fixpoint pass would keep re-firing a satisfiable accumulating rule every pass, driving the value to its min/max clamp instead of applying once. Does not transform the binding. |
| Ruleset (fixpoint) | `{ type: 'ruleset-fixpoint', name: 'consequences' }` | Runs a ruleset **to fixpoint**, unscoped (`Engine.runRulesetFixpoint`). Used for world-state settling — e.g. propagating the effects a stage just produced. Safe for idempotent assert/retract effects; not for `+=`/`-=`. Does not transform the binding. |
| Swap-roles | `{ type: 'swap-roles', roles: ['SELF', 'OTHER'] }` | Atomically swaps two binding variables. Both values are read before either is written, so the swap is simultaneous. Used for turn-alternating exchanges. |

Note the two ways a stage runs rules, both using the same two mechanisms:

- **`primingRules` on the `Stage`** — almost always `'ruleset-single'` entries, run **once**, for priming utility (e.g. `score(?X) += …` into ephemeral numerics). A `'ruleset-fixpoint'` entry here is possible but still can't safely carry a `+=`/`-=` effect, since it isn't scoped to this stage's binding either.
- **Hooks** (`preHooks` / `postHooks`) — either mechanism, by `type`. `'ruleset-fixpoint'` is the common case, for settling world state; `'ruleset-single'` is available when a hook ruleset needs `+=`/`-=` accumulation scoped to the current binding instead.

### Binding scope and `requires`

A ruleset hook's *starting binding* — which variables it runs scoped to — depends on its `type` and whether it declares `requires`:

| Hook | Scope when it runs |
|------|-------------------|
| `'ruleset-fixpoint'`, no `requires` | **Unscoped.** Runs fully aggregate over world state. This is deliberate — threading the current binding through would constrain any same-typed free variable in the ruleset to differ from what's already bound, quietly breaking rules meant to apply globally. |
| `'ruleset-single'`, no `requires` | Scoped to the **whole** incoming binding (e.g. a `?SELF`-scoped priming pass). |
| either, with `requires: [...]` | Runs **only when every named variable is bound** this firing, scoped to *just* those variables — nothing else leaks in. |

`requires` turns a hook into a conditional, self-scoping step. Its main use is the **`occ` binding**: in `branch` routing, when a winning action mints an occurrence (via a `record()` effect — see [Action records](action-records.md)), the runner binds that occurrence as `occ` for the stage's `postHooks`. A postHook that should only fire for actions that actually recorded declares it:

```javascript
new Stage({
  actionset: 'moves',
  routing: 'branch',
  postHooks: [{ type: 'ruleset-fixpoint', name: 'annotate-occurrence', requires: ['occ'] }],
});
```

Most actions mint no occurrence, so `occ` is unbound and the hook skips cleanly; when an action does record, the hook runs scoped to exactly that `occ`. The `occ` binding is a `branch`-only convenience — a `collect` stage can execute several recording winners at once, so "the" minted occurrence isn't well-defined there and is not provided.

---

## Selection strategies

A strategy decides which scored candidates win. The default, `'highestUtility'`, takes the single top-scoring candidate. Add a `groupBy` to instead take **one winner per group** — useful when a stage enumerates many targets and you want the best action *per target* rather than one overall.

`groupBy` comes in two forms.

### String form — group by a binding variable

The string names a role variable. Candidates are grouped by that variable's bound value; the highest scorer in each group wins.

```javascript
new Stage({
  actionset: 'respond',
  routing: 'branch',
  selectionStrategy: { type: 'highestUtility', groupBy: 'OTHER' },
});
```

With `?SELF` pre-bound and `?OTHER` free, the stage enumerates a candidate per `?OTHER`. Grouping by `OTHER` yields one winner *for each* `?OTHER` — so `alice` responds to every agent she could respond to, picking her best action toward each.

### Pattern form — group by a key read from world state

When the grouping key isn't a binding variable but something you must *look up*, give `groupBy` a `{ pattern, key }` object. For each candidate, the `pattern` query runs with the candidate's binding as its starting point; free variables in the pattern are enumerated from world state. Candidates are grouped by the `key` variable resolved from those query results, and the highest scorer per key wins.

```javascript
new Stage({
  actionset: 'judge-acts',
  routing: 'branch',
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
| `new Stage({ primingRules, actionset, salienceFloor, selectionStrategy, routing, routesTo, preHooks, postHooks })` | Builds one stage. `actionset` and `routing` are required; `routing` is `'branch'` or `'collect'`. `routesTo` (a stage name or array) is the route in `collect`, and the default route for `branch` winners whose action has no `routes-to`. `primingRules`, `preHooks`, and `postHooks` are hook arrays. |
| `new PipelineRunner(engine)` | Wraps an engine for execution. |
| `runner.run(pipeline, initialBinding)` | Runs the pipeline from its entry stage with the given starting binding (e.g. `{ SELF: 'alice' }`). |
| `selectCandidates(candidates, strategy, engine?)` | The selection primitive. `engine` is required only for the pattern form of `groupBy`. |

See [Actions](actions.md) for how candidates are scored, [Rules](rules.md) for ruleset semantics, and [Action records](action-records.md) for the breakdowns a stage's scoring produces.
