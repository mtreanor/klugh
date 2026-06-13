# Quickstart

This walks through the basics from scratch: defining your world, loading it, querying it interactively, and then using it in application code.

---

## 1. Define entity types

Entities are the things your predicates talk about. Group them by type — types are what the evaluator uses to enumerate logical variables.

```json
// entities.json
{
  "agent": {
    "alice": {},
    "bob":   {},
    "carol": {}
  },
  "item": {
    "antiqueClock": {},
    "rarePainting": {}
  }
}
```

You can add instances later without breaking anything. If you want agents to hold private beliefs separate from the shared world store, opt in with `"privateStore": true`:

```json
{
  "agent": {
    "privateStore": true,
    "alice": {},
    "bob":   {}
  }
}
```

---

## 2. Define predicate types

The schema declares every predicate the system knows about — its type, argument types, and any extra properties.

```json
// predicates.json
{
  "predicates": {
    "knows":      { "type": "boolean",    "symmetric": true, "args": ["agent", "agent"] },
    "trusts":     { "type": "boolean",    "args": ["agent", "agent"] },
    "hasItem":    { "type": "boolean",    "args": ["agent", "item"] },
    "hadConflict":{ "type": "boolean",    "args": ["agent", "agent"] },
    "friendship": {
      "type": "numeric",
      "args": ["agent", "agent"],
      "minValue": 0, "maxValue": 100, "default": 50,
      "tiers": {
        "cold":   [0,  40],
        "neutral":[40, 70],
        "warm":   [70, 100]
      }
    }
  }
}
```

Argument type names must match the type keys in `entities.json`. The schema is validated at load time — unknown predicates or argument types will throw.

---

## 3. Author initial state

Facts go in a `state` file. The `world` block is the shared store; `private` blocks write to a specific entity's store.

```
// state
world
  knows(alice, bob)
  knows(alice, carol)
  friendship(alice, bob) = 85
  friendship(alice, carol) = 25
  hadConflict(alice, carol) [at: -3]   // happened 3 ticks ago
  -trusts(alice, carol)                // active disbelief, not just absence
  hasItem(alice, antiqueClock)
  hasItem(bob, rarePainting)

private alice
  friendship(bob, alice) = 60          // alice's private read on the relationship
```

Things worth knowing:

- `pred = N` sets a numeric value
- `[at: -N]` backdates a fact into history — useful for establishing prior events rules can look back on
- `-pred(args)` is explicit disbelief, stored as a fact (different from the fact simply being absent)
- `@ 0.8` sets strength (default 1.0); strength doesn't affect boolean truth evaluation, but it is stored on the fact record and accessible to application code — useful for representing confidence or intensity when your application needs to distinguish a weakly-held belief from a strong one

---

## 4. Try it in the REPL

The REPL loads a scenario and lets you query and assert interactively. Wire it to your data by pointing a `project.config.json` at your files:

```json
// project.config.json
{
  "active": "my-scenario",
  "scenarios": {
    "my-scenario": {
      "predicates":  "path/to/predicates.json",
      "entities":    "path/to/entities.json",
      "state":       "path/to/state",
      "definitions": "path/to/definitions"
    }
  }
}
```

Then run:

```
node src/repl.js
```

Some things to try:

```
// Who does alice know?
> knows(alice, ?Y)
  ?Y = bob
  ?Y = carol

// Friendship tiers
> friendship.warm(alice, ?Y)
  ?Y = bob

// Explicit disbelief
> -trusts(alice, ?Y)
  ?Y = carol

// Anyone alice knows where no trust has been explicitly refused?
> knows(alice, ?Y) ^ not -trusts(alice, ?Y)
  ?Y = bob

// Score partial satisfaction — helpful for seeing how close each binding is
> degree knows(alice, ?Y) ^ friendship.warm(alice, ?Y) ^ trusts(alice, ?Y)
  ?Y = bob   — 0.67 (67%)
    knows(alice, bob) ✓  friendship.warm(alice, bob) ✓  trusts(alice, bob) ✗

// Assert and then query
> assert trusts(alice, bob)
  ok
> trusts(alice, ?Y)
  ?Y = bob

// Inspect the world store
> facts

// Inspect alice's private store
> facts alice
```

---

## 5. Create an Interpreter in your application

Load the active scenario from `project.config.json` the same way the REPL does:

```javascript
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Interpreter } from './src/Interpreter.js';

const root   = dirname(fileURLToPath(import.meta.url));
const config   = JSON.parse(readFileSync(resolve(root, 'project.config.json'), 'utf-8'));
const scenario = config.scenarios[config.active];

const interp = new Interpreter({
  predicates:  resolve(root, scenario.predicates),
  entities:    resolve(root, scenario.entities),
  state:       resolve(root, scenario.state),
  definitions: scenario.definitions ? resolve(root, scenario.definitions) : null,
});
```

Switching scenarios is a one-line change in `project.config.json` — set `"active"` to any key in `"scenarios"`.

The constructor also accepts a plain directory path if you want to skip the config entirely:

```javascript
const interp = new Interpreter('./data/demo');
```

### Querying

`query()` returns all fully-satisfied bindings:

```javascript
// All agents alice knows
const bindings = interp.query('knows(alice, ?Y)');
for (const b of bindings) {
  console.log(b.resolve('Y').name);  // 'bob', 'carol'
}

// Ground check — does alice know bob?
const [match] = interp.query('knows(alice, bob)');
if (match) { ... }

// Pre-bind a variable
const results = interp.query('knows(?X, ?Y)', { X: 'alice' });

// Query from an entity's private-store perspective
const aliceView = interp.query('friendship.warm(?X, ?Y)', {}, { scopedTo: 'alice' });
```

`evaluateDegrees()` scores every binding by partial satisfaction — useful when rules or decisions should fire even if conditions are only partially met:

```javascript
const scored = interp.evaluateDegrees(
  'knows(alice, ?Y) ^ friendship.warm(alice, ?Y) ^ trusts(alice, ?Y)'
);
for (const app of scored) {
  console.log(app.binding.resolve('Y').name, app.satisfactionScore);
}
```

### Asserting facts

```javascript
interp.assert('trusts(alice, bob)');
interp.assert('friendship(alice, carol) += 10');
interp.assert('not knows(alice, carol)');
```

---

## 6. Load and run rules

Rules are authored in a separate file and loaded via the parser. The `ForwardChainer` runs them to fixpoint, calling your callback for each fired application. You decide whether to apply the effects.

```javascript
import { readFileSync } from 'fs';
import { ForwardChainer } from './src/ForwardChainer.js';
import { applyStateChange } from './src/stateOperations/applyStateChange.js';

// Load rules from a file
const ruleSource = readFileSync('./data/rules', 'utf-8');
const { rules } = interp.ruleLoader.load(interp.ruleParser.parse(ruleSource));

// Run to fixpoint, applying all fully-satisfied rules
const chainer = new ForwardChainer();
const ctx = interp.world.createEvaluationContext();

chainer.run(rules, ctx, /* startingBinding */ null, (application) => {
  if (!application.isFullySatisfied()) return false;

  for (const effect of application.rule.effects) {
    applyStateChange(effect, application.binding, interp.world.queryHandlers, {
      privateStores: interp.world.privateStores,
    });
  }
  return true;  // signal that a change was committed — triggers another pass
});
```

### Importance and partial truth

Conditions in a rule can be weighted with `[importance: N]`. When only some conditions hold, `application.satisfactionScore` is the ratio of satisfied importance to total importance — a number between 0 and 1. `isFullySatisfied()` is just `satisfactionScore === 1.0`.

```
rule "guilt lingers — stronger when conflict was recent"
  knows(?SELF, ?Y)          [importance: 1.0]
  ^ hadConflict(?SELF, ?Y) [history]    [importance: 3.0]
  ^ trusts(?SELF, ?Y)       [importance: 1.0]
  => respectful(?SELF, ?Y) += 5.0
```

In the callback you can use `satisfactionScore` to threshold or scale:

```javascript
chainer.run(rules, ctx, null, (application) => {
  if (application.satisfactionScore < 0.5) return false;  // ignore weak matches

  for (const effect of application.rule.effects) {
    applyStateChange(effect, application.binding, interp.world.queryHandlers, {
      privateStores: interp.world.privateStores,
    });
  }
  return true;
});
```

Whether to fire on partial satisfaction — and what to do with `satisfactionScore` — is entirely up to your application.

### Pre-binding variables

To pre-bind `?SELF` (so rules only fire for one agent at a time):

```javascript
import { Binding } from './src/Binding.js';
import { LogicalVariable } from './src/LogicalVariable.js';

const alice = interp.world.entityRegistry.get('agent').find(e => e.name === 'alice');
const startingBinding = new Binding().extend(new LogicalVariable('SELF'), alice);

chainer.run(rules, ctx, startingBinding, (application) => { ... });
```

---

## 7. Do things based on evolving state

Once rules have run and state has changed, query the world to drive application behaviour:

```javascript
// Check a condition
const [aliceTrustedByBob] = interp.query('trusts(bob, alice)');
if (aliceTrustedByBob) { ... }

// Get all warm friendships
const warm = interp.query('friendship.warm(?X, ?Y)');

// Score relationships to rank choices — returns all bindings sorted by satisfactionScore desc,
// including partial matches. Each entry has .binding, .satisfactionScore, and .predicateResults.
const options = interp.evaluateDegrees(
  'knows(?SELF, ?Y) ^ trusts(?SELF, ?Y) ^ friendship.warm(?SELF, ?Y)',
  { SELF: 'alice' }
);
const bestOption = options[0]?.binding.resolve('Y');
// options[0].satisfactionScore — how well the top candidate satisfies the conjunction
// options[0].predicateResults — per-predicate breakdown of what held and what didn't
```

State persists on the `Interpreter` instance between calls — assert facts, run rules, and query in whatever order your simulation or application loop needs.

---

## 8. Author and select actions

Actions are authored choices — preconditions check eligibility, utility sources score candidates, and effects update world state when one is selected.

### Write an actions file

```
// data/actions
action "offer help"
  roles: ?SELF, ?Y
  preconditions
    knows(?SELF, ?Y)
    ^ not hostile(?SELF, ?Y)
  utility
    friendship(?SELF, ?Y)
    rule "need bonus"
      hasNeed(?Y, _)
      => 3.0
  content text: "?SELF offers to help ?Y"
  effects
    helpful(?SELF, ?Y)
    toward(?SELF, ?Y) += 5

action "rest"
  roles: ?SELF
  utility
    -2.0
  content text: "?SELF rests alone"
  effects
    rested(?SELF)
```

`offer help` is a binary action (`?SELF` and `?Y`) — it requires knowing someone and gains utility from friendship and their unmet needs. `rest` is unary — always available but mildly penalised, so it only wins when nothing better is possible.

### Load the actions

```javascript
import { readFileSync } from 'fs';
import { ActionParser } from './src/loader/ActionParser.js';
import { ActionLoader } from './src/loader/ActionLoader.js';

const { actions } = new ActionLoader().load(
  new ActionParser().parse(readFileSync('./data/actions', 'utf-8'))
);
```

### Score and select

Enumerate candidate (action, binding) pairs, check preconditions, score each, then pick the best.

```javascript
import { Binding } from './src/Binding.js';
import { LogicalVariable } from './src/LogicalVariable.js';

const world  = interp.world;
const ctx    = world.createEvaluationContext();
const agents = world.entityRegistry.get('agent') ?? [];

// Fix ?SELF to alice — we're choosing an action for her
const alice = agents.find(e => e.name === 'alice');
const selfBinding = new Binding().extend(new LogicalVariable('SELF'), alice);

const candidates = [];

for (const action of actions) {
  // For unary actions (no ?Y), the starting binding is complete
  // For binary actions, try every eligible ?Y
  const hasY = action.collectVariables().some(v => v.name === 'Y');
  const partnerCandidates = hasY ? agents : [null];

  for (const partner of partnerCandidates) {
    const binding = partner
      ? selfBinding.extend(new LogicalVariable('Y'), partner)
      : selfBinding;

    if (!action.arePreconditionsMet(binding, ctx)) continue;

    const score = action.score(binding, world.entityRegistry, ctx);
    candidates.push({ action, binding, score });
  }
}

// Rank by score descending
candidates.sort((a, b) => b.score - a.score);
const best = candidates[0];

if (best) {
  const label = best.action.content?.render(best.binding) ?? best.action.name;
  console.log(`Selected: ${label}  (score ${best.score.toFixed(2)})`);
  best.action.execute(best.binding, world.queryHandlers);
}
```

With the state from step 3 (`friendship(alice, bob) = 85`, `hasNeed` absent), `offer help` for alice→bob will score 85 (friendship only) and win over `rest` at −2.

### Deferred execution

If multiple agents act in the same tick, stage effects in a `StateChangeQueue` and flush once all decisions are made:

```javascript
import { StateChangeQueue } from './src/stateOperations/StateChangeQueue.js';

const queue = new StateChangeQueue();

// Each agent selects their best action and enqueues it
best.action.execute(best.binding, world.queryHandlers, queue);
// ... repeat for other agents ...

// Commit all effects at end of tick
queue.flush('tickEnd', world.queryHandlers);
```

Effects enqueued this way are not visible to other agents' scoring decisions in the same tick — consistent with a simultaneous-action model.

---

## What's next

For the full language reference — negation operators, numeric comparisons, count queries, temporal chains, derived predicates, private stores, sensor predicates, and the complete action spec — see [language.md](language.md).
