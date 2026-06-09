import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { Interpreter } from './Interpreter.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const config   = JSON.parse(readFileSync(join(repoRoot, 'project.config.json'), 'utf-8')).logic;

const paths = {
  predicates: resolve(repoRoot, config.predicates),
  entities:   resolve(repoRoot, config.entities),
  state:      resolve(repoRoot, config.state),
  definitions: config.definitions ? resolve(repoRoot, config.definitions) : null,
};

const interp = new Interpreter(paths);

const predNames   = [...interp.schema.definitions.keys()];
const entityNames = [...interp.world.entityRegistry.values()].flat().map(e => e.name ?? e);
const variables   = ['?X', '?Y', '?Z', '?W', '?K', '?SELF'];

function completer(line) {
  // After a dot: complete tier names — e.g. "friendship." or "friendship.str"
  const dotMatch = line.match(/^(.*?\b([\w-]+))\.([\w-]*)$/);
  if (dotMatch) {
    const [, prefix, predName, partial] = dotMatch;
    const def = interp.schema.getDefinition(predName);
    if (def?.tiers) {
      const hits = Object.keys(def.tiers)
        .filter(t => t.startsWith(partial))
        .map(t => `${prefix}.${t}`);
      return [hits, line];
    }
  }

  // Inside open parens: complete entity names and variables
  const opens  = (line.match(/\(/g) || []).length;
  const closes = (line.match(/\)/g) || []).length;
  if (opens > closes) {
    const partial = line.match(/[^,()\s]*$/)[0];
    const prefix  = line.slice(0, line.length - partial.length);
    const hits = [...entityNames, ...variables]
      .filter(c => c.startsWith(partial))
      .map(c => prefix + c);
    return [hits, line];
  }

  // Default: predicate name at end of line (handles ~pred and |pred for negation/count)
  const partial = line.match(/[\w-]*$/)[0];
  const prefix  = line.slice(0, line.length - partial.length);
  const hits = predNames
    .filter(p => p.startsWith(partial))
    .map(p => prefix + p);
  return [hits, line];
}

function formatBinding(binding) {
  if (binding.assignments.size === 0) return '(ground)';
  return [...binding.assignments.entries()]
    .map(([k, v]) => `?${k} = ${v?.name ?? v}`)
    .join(', ');
}

function formatArg(arg) {
  return typeof arg === 'string' ? `"${arg}"` : arg;
}

function activeRecords(factStore) {
  const seen    = new Set();
  const records = [];

  for (let i = factStore.factHistory.length - 1; i >= 0; i--) {
    const record = factStore.factHistory[i];
    if (!record.isCurrentlyActive()) continue;

    const key = JSON.stringify([record.fact.negated, record.fact.name, ...record.fact.args]);
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }

  return records.sort((a, b) => {
    const byName = a.fact.name.localeCompare(b.fact.name);
    if (byName !== 0) return byName;
    const byArgs = a.fact.args.map(String).join(',').localeCompare(b.fact.args.map(String).join(','));
    if (byArgs !== 0) return byArgs;
    return Number(a.fact.negated) - Number(b.fact.negated);
  });
}

function formatRecord(record) {
  const prefix  = record.fact.negated ? '-' : '';
  const argsStr = record.fact.args.map(formatArg).join(', ');
  let line = record.fact.value !== null
    ? `${prefix}${record.fact.name}(${argsStr}) = ${record.fact.value}`
    : `${prefix}${record.fact.name}(${argsStr})`;
  if (record.strength !== 1.0) line += ` @ ${record.strength}`;
  return line;
}

function printStore(label, factStore) {
  const records = activeRecords(factStore);
  console.log(`[${label}]`);
  if (records.length === 0) {
    console.log('  (empty)');
    return;
  }
  for (const record of records) {
    console.log(`  ${formatRecord(record)}`);
  }
}

function handleFactsCommand(args) {
  const { world } = interp;

  if (args.length === 0) {
    printStore('world', world.factStore);
    return;
  }

  if (args.length === 1 && args[0] === 'all') {
    printStore('world', world.factStore);
    for (const name of [...world.privateStores.keys()].sort()) {
      console.log();
      printStore(name, world.privateStores.get(name));
    }
    return;
  }

  for (let i = 0; i < args.length; i++) {
    const name  = args[i];
    const store = world.getPrivateStore(name);
    if (!store) throw new Error(`"${name}" has no private store`);
    if (i > 0) console.log();
    printStore(name, store);
  }
}

function printEntities() {
  const { world } = interp;
  const types = [...world.entityRegistry.keys()].sort();
  const hasAnyPrivateStore = world.privateStores.size > 0;

  if (hasAnyPrivateStore) {
    console.log('* — private store');
    console.log();
  }

  for (const typeName of types) {
    const members = world.entityRegistry.get(typeName) ?? [];
    console.log(`[${typeName}]`);
    if (members.length === 0) {
      console.log('  (none)');
      continue;
    }
    for (const entity of [...members].sort((a, b) => a.name.localeCompare(b.name))) {
      const marker = world.hasPrivateStore(entity.name) ? ' *' : '';
      console.log(`  ${entity.name}${marker}`);
    }
  }
}

function formatPredicateResults(application) {
  return application.predicateResults
    .map(({ predicate, importance, satisfied }) => {
      const label = predicate.describe(application.binding);
      const imp = importance !== 1.0 ? ` [${importance}]` : '';
      return `${label}${imp} ${satisfied ? '✓' : '✗'}`;
    })
    .join('  ');
}

function printDegreeResults(applications) {
  const visible = applications.filter(a => a.truthDegree > 0);
  if (visible.length === 0) {
    console.log('  (no results)');
    return;
  }
  for (const app of visible) {
    const pct = (app.truthDegree * 100).toFixed(0);
    console.log(`  ${formatBinding(app.binding)}  —  ${app.truthDegree.toFixed(2)} (${pct}%)`);
    console.log(`    ${formatPredicateResults(app)}`);
  }
  console.log(`  — ${visible.length} binding${visible.length === 1 ? '' : 's'}`);
}

console.log('Logic interpreter ready. Ctrl+D to exit.');
console.log();
console.log('  query:     knows(?X, ?Y) ^ friendship.strong(alice, ?Y)');
console.log('  negation:  not trusts(alice, ?Y)  |  -trusts(alice, carol)  |  ~trusts(alice, carol)');
console.log('  degree:    degree knows(alice, ?Y) ^ friendship.strong(alice, ?Y)');
console.log('  as:        as alice: canPair(alice, ?Y)   — query from an entity\'s private-store perspective');
console.log('  assert:    assert knows(alice, carol) | assert -trusts(alice, carol) | assert friendship(alice, carol) = 75');
console.log('  facts:     facts | facts all | facts alice | facts alice bob');
console.log('  entities:  entities');
console.log();

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ', completer });
rl.prompt();

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) { rl.prompt(); return; }

  try {
    if (text.startsWith('assert ')) {
      interp.assert(text.slice('assert '.length).trim());
      console.log('  ok');
    } else if (text === 'facts' || text.startsWith('facts ')) {
      handleFactsCommand(text === 'facts' ? [] : text.slice('facts '.length).trim().split(/\s+/));
    } else if (text === 'entities') {
      printEntities();
    } else if (text.startsWith('degree ')) {
      printDegreeResults(interp.evaluateDegrees(text.slice('degree '.length).trim()));
    } else if (/^as \w+:/.test(text)) {
      const colonIdx  = text.indexOf(':');
      const scopedTo  = text.slice('as '.length, colonIdx).trim();
      const queryText = text.slice(colonIdx + 1).trim();
      const bindings  = interp.query(queryText, {}, { scopedTo });
      console.log(`  [as ${scopedTo}]`);
      if (bindings.length === 0) {
        console.log('  (no results)');
      } else {
        for (const b of bindings) {
          console.log(b.assignments.size === 0 ? '  true' : `  ${formatBinding(b)}`);
        }
        console.log(`  — ${bindings.length} result${bindings.length === 1 ? '' : 's'}`);
      }
    } else {
      const bindings = interp.query(text);
      if (bindings.length === 0) {
        console.log('  (no results)');
      } else {
        for (const b of bindings) {
          if (b.assignments.size === 0) {
            console.log('  true');
          } else {
            console.log(`  ${formatBinding(b)}`);
          }
        }
        console.log(`  — ${bindings.length} result${bindings.length === 1 ? '' : 's'}`);
      }
    }
  } catch (err) {
    console.log(`  error: ${err.message}`);
  }

  console.log();
  rl.prompt();
});

rl.on('close', () => process.exit(0));
