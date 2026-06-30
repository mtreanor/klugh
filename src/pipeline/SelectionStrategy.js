export function selectCandidates(candidates, strategy) {
  const s = typeof strategy === 'string' ? { type: strategy } : (strategy ?? { type: 'highestUtility' });

  if (s.type === 'highestUtility') {
    if (!s.groupBy) {
      return candidates.length > 0 ? [candidates[0]] : [];
    }
    return selectGrouped(candidates, s.groupBy);
  }

  throw new Error(`Unknown selection strategy type: "${s.type}"`);
}

function selectGrouped(candidates, groupBy) {
  if (typeof groupBy !== 'string') {
    throw new Error('Pattern form of groupBy is not yet implemented');
  }

  const best = new Map();
  for (const candidate of candidates) {
    const key = resolveKey(candidate.binding, groupBy);
    if (key === null) continue;
    if (!best.has(key) || candidate.score > best.get(key).score) {
      best.set(key, candidate);
    }
  }
  return [...best.values()];
}

function resolveKey(binding, varName) {
  const value = binding.assignments.get(varName);
  if (value == null) return null;
  return typeof value === 'object' && 'name' in value ? value.name : String(value);
}
