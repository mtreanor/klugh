import { RuleLoader } from '../../../src/loader/RuleLoader.js';
import { RuleCycleDetector } from '../../../src/RuleCycleDetector.js';
import { readFile } from './ruleFile.js';
import { parseRuleBlocks } from './ruleFile.js';

// Full validation of a candidate rule against a scenario:
//   1. lex/parse the DSL             → syntax errors
//   2. build against the schema      → unknown predicate / tier / bad comparison
//   3. cycle-detect with the ruleset → non-terminating rule sets are blocked
// Unbound private-store owners surface as warnings (not hard failures).
//
// `rulesetPath` (optional) is the file the rule will live in; existing rules
// there are included in cycle detection. `excludeName` skips a rule being edited.
export function validateRule({ ctx, name, comment, body, rulesetPath = null, excludeName = null }) {
  const errors = [];
  const warnings = [];

  if (!name || !name.trim()) errors.push('Rule name is required.');
  if (!body || !body.trim()) errors.push('Rule body is required.');
  if (errors.length) return { ok: false, errors, warnings };

  const loader = new RuleLoader(ctx.schema);
  const source = `rule ${JSON.stringify(name)}\n${body}`;

  let parsed;
  try {
    const result = ctx.ruleParser.parse(source);
    if (!result.rules || result.rules.length === 0) {
      errors.push('Could not parse a rule from the input.');
      return { ok: false, errors, warnings };
    }
    if (result.rules.length > 1) {
      errors.push('Input contains more than one rule — add them one at a time.');
      return { ok: false, errors, warnings };
    }
    parsed = result.rules[0];
  } catch (err) {
    errors.push(`Syntax error: ${err.message}`);
    return { ok: false, errors, warnings };
  }

  // Build against the schema, capturing unbound-owner console.warn output.
  let candidate;
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    candidate = loader.buildRule(parsed);
  } catch (err) {
    errors.push(err.message);
    return { ok: false, errors, warnings };
  } finally {
    console.warn = originalWarn;
  }

  // Cycle detection against the rest of the target ruleset.
  if (rulesetPath) {
    const others = buildExistingRules(ctx, loader, rulesetPath, excludeName ?? name);
    const cycle = new RuleCycleDetector().detect([...others, candidate]);
    if (cycle) {
      errors.push(`Adding this rule would create a non-terminating cycle: ${cycle.join(' → ')}`);
      return { ok: false, errors, warnings };
    }
  }

  return { ok: true, errors, warnings, name: candidate.name };
}

// Build every rule currently in a file, skipping the one named `excludeName`
// and any that fail to build (they can't participate in cycle detection).
function buildExistingRules(ctx, loader, path, excludeName) {
  let text;
  try {
    text = readFile(path);
  } catch {
    return [];
  }
  const rules = [];
  for (const block of parseRuleBlocks(text)) {
    if (block.name === excludeName) continue;
    try {
      const { rules: parsed } = ctx.ruleParser.parse(`rule ${JSON.stringify(block.name)}\n${block.bodyText}`);
      if (parsed[0]) rules.push(loader.buildRule(parsed[0]));
    } catch {
      // Skip unparsable/unbuildable existing rules.
    }
  }
  return rules;
}
