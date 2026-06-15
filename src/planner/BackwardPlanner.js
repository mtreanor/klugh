import { Binding } from '../Binding.js';
import { RuleEvaluator } from '../RuleEvaluator.js';
import { FactPredicate } from '../predicates/FactPredicate.js';
import { PrivatePredicate } from '../predicates/PrivatePredicate.js';
import { NegationPredicate } from '../predicates/NegationPredicate.js';
import { inferVariableTypes } from '../inferVariableTypes.js';

// A ground goal fact: { name, args, negated, owner }
// owner is null for public facts, or an entity name string for private facts.
// negated: true means "this fact must NOT be present" (NAF goal).

function groundFactKey({ name, args, negated, owner }) {
  return `${owner ?? ''}:${negated ? '-' : ''}${name}(${args.join(',')})`;
}

function goalKey(goalFacts) {
  return goalFacts.map(groundFactKey).sort().join('|');
}

function groundFactMatches(a, b) {
  return a.name === b.name
    && a.owner === b.owner
    && a.negated === b.negated
    && a.args.length === b.args.length
    && a.args.every((v, i) => v === b.args[i]);
}

function resolveArg(arg, binding) {
  const resolved = binding.resolve(arg);
  return resolved?.name ?? resolved;
}

// Convert a klugh predicate object (with a ground binding) to a goal fact tuple.
// Supports FactPredicate, PrivatePredicate, and NegationPredicate wrapping either.
function normalizeGroundPredicate(predicate, binding) {
  if (predicate instanceof NegationPredicate) {
    const inner = normalizeGroundPredicate(predicate.predicate, binding);
    return { ...inner, negated: true };
  }
  if (predicate instanceof PrivatePredicate) {
    const ownerName = predicate.resolveOwnerName(binding) ?? predicate.owner;
    const inner     = predicate.innerPredicate;
    return {
      name:    inner.name,
      args:    inner.args.map(a => resolveArg(a, binding)),
      negated: false,
      owner:   ownerName,
    };
  }
  if (predicate instanceof FactPredicate) {
    return {
      name:    predicate.name,
      args:    predicate.args.map(a => resolveArg(a, binding)),
      negated: false,
      owner:   null,
    };
  }
  throw new Error(`BackwardPlanner: unsupported predicate type: ${predicate.constructor.name}`);
}

function factSatisfiedInInitial(goalFact, initialSnapshot) {
  const store = goalFact.owner
    ? initialSnapshot.privateStores.get(goalFact.owner)
    : initialSnapshot.factStore;
  if (!store) return goalFact.negated;
  return goalFact.negated
    ? !store.contains(goalFact.name, ...goalFact.args)
    : store.contains(goalFact.name, ...goalFact.args);
}

function resolveOperationOwner(operation, binding) {
  if (!operation.owner) return null;
  if (!operation.ownerIsVariable) return operation.owner;
  const resolved = binding.resolve(operation.owner);
  return resolved?.name ?? resolved ?? null;
}

export class BackwardPlanner {
  constructor(actions, schema) {
    this.actions       = actions;
    this.schema        = schema;
    this.ruleEvaluator = new RuleEvaluator();
  }

  findPlan(goalPredicates, initialSnapshot) {
    const emptyBinding  = new Binding();
    const initialGoal   = goalPredicates.map(p => normalizeGroundPredicate(p, emptyBinding));
    const initialKey    = goalKey(initialGoal);

    const queue   = [{ goal: initialGoal, steps: [] }];
    const visited = new Set([initialKey]);

    while (queue.length > 0) {
      const { goal, steps } = queue.shift();

      if (goal.every(g => factSatisfiedInInitial(g, initialSnapshot))) return steps;

      const unsatisfied = goal.find(g => !factSatisfiedInInitial(g, initialSnapshot));
      const evalCtx     = initialSnapshot.createEvaluationContext();

      for (const action of this.actions) {
        const bindings = this.ruleEvaluator.generateAllBindings(
          action.collectVariables(),
          inferVariableTypes(action.preconditions, this.schema),
          initialSnapshot.entityRegistry,
          new Binding(),
          evalCtx,
          action.preconditions
        );

        for (const binding of bindings) {
          const groundEffects = this.resolveGroundEffects(action, binding);

          if (!groundEffects.some(e => groundFactMatches(e, unsatisfied))) continue;

          const achieved    = groundEffects.filter(e => goal.some(g => groundFactMatches(e, g)));
          const remaining   = goal.filter(g => !achieved.some(e => groundFactMatches(e, g)));
          const newSubgoals = this.resolveGroundPreconditions(action, binding)
            .filter(p => !factSatisfiedInInitial(p, initialSnapshot));

          const newGoal = [...remaining, ...newSubgoals];
          const key     = goalKey(newGoal);
          if (visited.has(key)) continue;
          visited.add(key);

          queue.push({ goal: newGoal, steps: [{ action, binding }, ...steps] });
        }
      }
    }

    return null;
  }

  resolveGroundEffects(action, binding) {
    return action.effects
      .filter(op => op.type === 'assert')
      .map(op => ({
        name:    op.name,
        args:    op.resolveArgs(binding),
        negated: op.negated ?? false,
        owner:   resolveOperationOwner(op, binding),
      }));
  }

  resolveGroundPreconditions(action, binding) {
    return action.preconditions.map(({ predicate }) =>
      normalizeGroundPredicate(predicate, binding)
    );
  }
}
