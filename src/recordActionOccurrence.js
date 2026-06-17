import { Fact } from './Fact.js';
import { LogicalVariable } from './LogicalVariable.js';

// Reifies an action occurrence in the live world: registers an `occurrence`
// entity and asserts the built-in vocabulary that makes the event queryable —
//
//   actionType(occ, <action name>)
//   role(occ, <roleName>, <value>)   — one per bound role, keyed by the role
//                                       variable's name (with '?' stripped)
//
// plus any contextFacts supplied by the decision process, where ?this_occurrence
// resolves to the occurrence (other args are taken as-is). Rules can derive
// further facts over these afterward.
//
// Returns the occurrence id (its entity name). Live-world only — occurrences are
// a record of what actually happened, not part of hypothetical planner search.
export function recordActionOccurrence(action, binding, world, {
  contextFacts   = [],
  occurrenceType = 'occurrence',
} = {}) {
  world.occurrenceSeq = (world.occurrenceSeq ?? 0) + 1;
  // Identifier-safe id (no '#': that is the DSL comment marker) so occurrences
  // can be referenced as bare identifiers in queries: role(occ1, ?r, ?v).
  const occId = `occ${world.occurrenceSeq}`;
  world.addEntity(occurrenceType, { name: occId });

  world.factStore.assert(new Fact('actionType', occId, action.name));

  for (const roleRef of action.roles ?? []) {
    const roleName = roleNameOf(roleRef);
    const resolved = binding.resolve(new LogicalVariable(roleName));
    if (resolved === undefined) continue;   // role variable not bound — skip it
    world.factStore.assert(new Fact('role', occId, roleName, toValue(resolved)));
  }

  for (const fact of contextFacts) {
    const args = fact.args.map(arg => (arg === '?this_occurrence' ? occId : arg));
    world.factStore.assert(new Fact(fact.name, ...args));
  }

  return occId;
}

function roleNameOf(roleRef) {
  if (typeof roleRef === 'string') return roleRef.startsWith('?') ? roleRef.slice(1) : roleRef;
  return roleRef.name;   // LogicalVariable
}

// Facts store entity arguments by name; an occurrence value is recorded as the
// bound entity's name (or the raw value for non-entity bindings).
function toValue(resolved) {
  return (resolved !== null && typeof resolved === 'object' && 'name' in resolved)
    ? resolved.name
    : resolved;
}
