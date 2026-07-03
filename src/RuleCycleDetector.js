// Dependency keys are scoped by store, not just predicate name. A premise that
// reads the world store and an effect that writes a private store (or vice
// versa) touch independent facts and cannot feed each other — keying them as
// `world:name` vs `private:name` keeps that distinction so a learning rule
// (world read → private belief write) is not mistaken for a self-cycle. Private
// owners collapse to a single `private` class: this stays conservative (it may
// over-link two private rules with different owners, never under-links), so
// genuine cross-store cycles are still caught.
function* walkScoped(predicate, scope) {
  // Negation wrappers (not, ~) are guards: asserting the inner predicate makes
  // them fail, so they do not create a dependency edge for cycle detection.
  if (predicate.predicateIsNegation) return;
  yield { predicate, scope };
  // A PrivatePredicate wraps an inner predicate evaluated against an owner's
  // private store; descend into it under the `private` scope.
  const innerScope = ('owner' in predicate && predicate.innerPredicate) ? 'private' : scope;
  if (predicate.predicate)      yield* walkScoped(predicate.predicate, scope);
  if (predicate.innerPredicate) yield* walkScoped(predicate.innerPredicate, innerScope);
  // AtTickPredicate (and future tick-binding wrappers) store their wrapped
  // predicate as `.inner`, evaluated at a shifted tick but the same store, so
  // it descends under the current scope. Without this, a rule condition like
  // `pred(?x) [tick: -25]` is invisible to cycle detection.
  if (predicate.inner)          yield* walkScoped(predicate.inner, scope);
}

function lhsBooleanNames(rule) {
  const names = new Set();
  for (const { predicate } of rule.predicateEntries) {
    for (const { predicate: p, scope } of walkScoped(predicate, 'world')) {
      if (p.steps) {
        for (const step of p.steps) names.add(`${scope}:${step.name}`);
      } else if (typeof p.name === 'string') {
        names.add(`${scope}:${p.name}`);
      }
    }
  }
  return names;
}

function rhsBooleanNames(rule) {
  const names = new Set();
  for (const effect of rule.effects) {
    // Only assert effects can keep a rule re-triggerable on the next pass.
    // Retract effects remove predicates, which reduces the set of satisfiable
    // rules rather than expanding it — they cannot sustain a cycle.
    if (effect.type === 'assert' && effect.name) {
      const scope = effect.owner ? 'private' : 'world';
      names.add(`${scope}:${effect.name}`);
    }
  }
  return names;
}

export class RuleCycleDetector {
  // Returns the cycle as an array of rule names if one is found, null otherwise.
  detect(rules) {
    const lhs = new Map(rules.map(r => [r, lhsBooleanNames(r)]));
    const rhs = new Map(rules.map(r => [r, rhsBooleanNames(r)]));

    // Build rule-to-rule adjacency: edge R1→R2 when R1's RHS ∩ R2's LHS ≠ ∅.
    const edges = new Map(rules.map(r => [r, []]));
    for (const r1 of rules) {
      const r1Rhs = rhs.get(r1);
      if (r1Rhs.size === 0) continue;
      for (const r2 of rules) {
        for (const name of r1Rhs) {
          if (lhs.get(r2).has(name)) {
            edges.get(r1).push(r2);
            break;
          }
        }
      }
    }

    // DFS cycle detection — returns the cycle path as rule names, or null.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map(rules.map(r => [r, WHITE]));
    const stack = [];

    const dfs = (rule) => {
      color.set(rule, GRAY);
      stack.push(rule);
      for (const neighbor of edges.get(rule)) {
        if (color.get(neighbor) === GRAY) {
          const idx = stack.indexOf(neighbor);
          return [...stack.slice(idx), neighbor].map(r => r.name);
        }
        if (color.get(neighbor) === WHITE) {
          const result = dfs(neighbor);
          if (result) return result;
        }
      }
      stack.pop();
      color.set(rule, BLACK);
      return null;
    };

    for (const rule of rules) {
      if (color.get(rule) === WHITE) {
        const cycle = dfs(rule);
        if (cycle) return cycle;
      }
    }
    return null;
  }
}
