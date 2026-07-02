import { readFileSync } from 'fs';
import { PredicateSchema } from '../../../src/PredicateSchema.js';
import { EntityNameValidator } from '../../../src/EntityNameValidator.js';
import { RuleParser } from '../../../src/loader/RuleParser.js';
import { loadProjectConfig, resolveScenarioPaths } from './config.js';
import { parseRuleBlocks } from './ruleFile.js';

// Load a scenario's predicate schema, entity names, and a RuleParser bound to both.
// These are the shared inputs for autocomplete, parsing, matching, and validation.
export function loadScenarioContext(name) {
  const config = loadProjectConfig();
  const scenario = config.scenarios[name];
  if (!scenario) throw new Error(`Unknown scenario "${name}"`);
  const paths = resolveScenarioPaths(scenario);
  if (!paths.predicates) throw new Error(`Scenario "${name}" has no predicates file`);

  const schema = new PredicateSchema(JSON.parse(readFileSync(paths.predicates, 'utf-8')));

  let entityNames = new Set();
  if (paths.entities) {
    const entitiesData = JSON.parse(readFileSync(paths.entities, 'utf-8'));
    ({ entityNames } = EntityNameValidator.validate(entitiesData, schema));
  }

  const ruleParser = new RuleParser(schema, { entityNames });
  return { name, scenario, paths, schema, entityNames, ruleParser };
}

// List every scenario in the project config, tagged with whether it has rulesets.
export function listScenarios() {
  const config = loadProjectConfig();
  return Object.entries(config.scenarios).map(([name, s]) => ({
    name,
    active: name === config.active,
    rulesets: Object.keys(s.rulesets ?? {}),
    actionsets: Object.keys(s.actionsets ?? {}),
    hasPredicates: !!s.predicates,
  }));
}

// Serialize the predicate schema into a compact form the frontend uses for
// autocomplete: name, type, arg types, arity, and tier names.
export function schemaForClient(schema) {
  const predicates = [];
  for (const [name, def] of schema.definitions) {
    predicates.push({
      name,
      type: def.type,
      args: def.args ?? [],
      arity: (def.args ?? []).length,
      tiers: def.tiers ? Object.keys(def.tiers) : [],
      symmetric: !!def.symmetric,
    });
  }
  predicates.sort((a, b) => a.name.localeCompare(b.name));
  return predicates;
}

// Parse one rule block's body in isolation so a single malformed rule doesn't
// break the whole file. Returns { parsed } or { parseError }.
export function parseBlock(ruleParser, block) {
  const source = `rule ${JSON.stringify(block.name)}\n${block.bodyText}`;
  try {
    const { rules } = ruleParser.parse(source);
    return { parsed: rules[0] ?? null };
  } catch (err) {
    return { parseError: err.message };
  }
}

// Load every rule from a scenario's rulesets, as blocks enriched with parse output.
// Returns { rulesets: [{ name, path, rules: [...] }] }.
export function loadRulesets(ctx) {
  const rulesets = [];
  for (const [rsName, path] of Object.entries(ctx.paths.rulesets)) {
    let text = '';
    let fileError = null;
    try {
      text = readFileSync(path, 'utf-8');
    } catch (err) {
      fileError = err.message;
    }
    const blocks = fileError ? [] : parseRuleBlocks(text);
    const rules = blocks.map((b, i) => {
      const { parsed, parseError } = parseBlock(ctx.ruleParser, b);
      return {
        id: `${rsName}::${i}`,
        ruleset: rsName,
        name: b.name,
        comment: b.comment,
        bodyText: b.bodyText,
        predicateCount: parsed ? (parsed.predicates?.length ?? 0) : null,
        effectCount: parsed ? (parsed.effects?.length ?? 0) : null,
        parsed,
        parseError,
      };
    });
    rulesets.push({ name: rsName, path, rules, fileError });
  }
  return rulesets;
}
