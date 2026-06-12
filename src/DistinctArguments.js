import { NegationPredicate } from './predicates/NegationPredicate.js';
import { TemporalChainPredicate } from './predicates/TemporalChainPredicate.js';
import { CountPredicate } from './predicates/CountPredicate.js';

function findEntityByName(name, entityRegistry) {
  for (const entities of entityRegistry.values()) {
    const match = entities.find(e => e?.name === name);
    if (match !== undefined) return match;
  }
  return null;
}

function resolveArgValue(arg, binding, entityRegistry) {
  const term = binding.resolve(arg);
  if (term === null) return null;
  if (typeof term === 'string') {
    return findEntityByName(term, entityRegistry) ?? term;
  }
  return term;
}

function argumentsAreDistinct(binding, name, args, schema, entityRegistry, entityTypeConfig) {
  const argTypes = schema?.getDefinition(name)?.args;
  if (!argTypes) return true;

  const values = args.map(arg => resolveArgValue(arg, binding, entityRegistry));

  for (let i = 0; i < values.length; i++) {
    const typeI = argTypes[i];
    if (!typeI || typeI === 'string') continue;
    if (entityTypeConfig?.get(typeI)?.distinct === false) continue;
    for (let j = i + 1; j < values.length; j++) {
      if (typeI !== argTypes[j]) continue;
      const left = values[i];
      const right = values[j];
      if (left !== null && right !== null && left === right) return false;
    }
  }
  return true;
}

function collectArgumentChecks(predicate) {
  if (predicate instanceof NegationPredicate) {
    return collectArgumentChecks(predicate.predicate);
  }
  if (predicate instanceof TemporalChainPredicate) {
    return predicate.steps.map(step => ({ name: step.name, args: step.args }));
  }
  if (predicate instanceof CountPredicate) {
    return collectArgumentChecks(predicate.innerPredicate);
  }
  if (predicate.name && predicate.args) {
    return [{ name: predicate.name, args: predicate.args }];
  }
  return [];
}

export function predicateSatisfiesDistinctArguments(binding, predicate, schema, entityRegistry, entityTypeConfig) {
  return collectArgumentChecks(predicate).every(
    check => argumentsAreDistinct(binding, check.name, check.args, schema, entityRegistry, entityTypeConfig)
  );
}

export function bindingSatisfiesDistinctArguments(binding, predicates, schema, entityRegistry, entityTypeConfig) {
  return predicates.every(
    pred => predicateSatisfiesDistinctArguments(binding, pred, schema, entityRegistry, entityTypeConfig)
  );
}
