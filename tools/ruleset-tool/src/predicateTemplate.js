// Placeholder role variables (?A, ?B, …), one per argument — shared by the
// autocomplete and the predicate sidebar so inserted predicates look identical.
export function roleVars(arity) {
  return Array.from({ length: arity }, (_, i) => `?${String.fromCharCode(65 + i)}`);
}

export function predicateTemplate(p) {
  return `${p.name}(${roleVars(p.arity).join(', ')})`;
}

export function tierTemplate(p, tier) {
  return `${p.name}.${tier}(${roleVars(p.arity).join(', ')})`;
}
