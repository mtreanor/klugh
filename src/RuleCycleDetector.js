function* walkPredicates(predicate) {
  yield predicate;
  // Negation wrappers (not, ~) are guards: asserting the inner predicate makes
  // them fail, so they do not create a dependency edge for cycle detection.
  if (predicate.predicateIsNegation) return;
  if (predicate.predicate)      yield* walkPredicates(predicate.predicate);
  if (predicate.innerPredicate) yield* walkPredicates(predicate.innerPredicate);
}

function lhsBooleanNames(rule) {
  const names = new Set();
  for (const { predicate } of rule.predicateEntries) {
    for (const p of walkPredicates(predicate)) {
      if (p.steps) {
        for (const step of p.steps) names.add(step.name);
      } else if (typeof p.name === 'string') {
        names.add(p.name);
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
      names.add(effect.name);
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
