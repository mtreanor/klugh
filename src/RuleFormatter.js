import { Predicate } from './Predicate.js';
import { StateOperation } from './stateOperations/StateOperation.js';

export function formatBoundRule(rule, binding, {
  effectName   = null,
  scaledDelta  = null,
  satisfactionScore  = null,
} = {}) {
  const lines = [`rule "${rule.name}"`];

  rule.predicateEntries.forEach(({ predicate, importance }, index) => {
    const prefix = index === 0 ? '  ' : '  ^ ';
    let line = prefix + predicate.describe(binding);
    if (importance !== 1.0) line += ` [importance: ${importance}]`;
    lines.push(line);
  });

  const effects = rule.effects
    .filter(operation => effectName === null || operation.name === effectName)
    .map(operation => formatBoundOperation(operation, binding, {
      scaledDelta: operation.name === effectName ? scaledDelta : null,
    }));

  lines.push(`  => ${effects.join(', ')}`);

  if (satisfactionScore !== null && satisfactionScore < 1.0) {
    lines.push(`  (truth: ${satisfactionScore.toFixed(2)})`);
  }

  return lines.join('\n');
}

function formatBoundOperation(operation, binding, { scaledDelta = null } = {}) {
  if (operation instanceof StateOperation && operation.type === 'adjust-numeric' && scaledDelta !== null) {
    const argsStr = operation.args.map(a => Predicate.renderArg(a, binding)).join(', ');
    return `${operation.name}(${argsStr}) += ${scaledDelta.toFixed(2)}`;
  }
  return operation.describe(binding);
}
