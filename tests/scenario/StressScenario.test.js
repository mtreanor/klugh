// End-to-end stress harness for the data/stress scenario: 10 agents, 30 ticks
// of history, 30 stored/sensor predicates, 15 derived predicates, 100 rules.
//
// Hand-computed expectations: the exact numeric totals below were derived by
// summing rule contributions for specific pairs (see data/stress/rules group
// comments). Rules D3, D5, and L1 must never fire. The K group cascade is
// listed in reverse order in the rules file, so applyOnce cannot complete it
// in one pass but fixpoint apply() must.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Interpreter } from '../../src/Interpreter.js';
import { SensorQueryHandler } from '../../src/queryHandlers/SensorQueryHandler.js';
import { Sensor } from '../../src/Sensor.js';
import { NumericSensor } from '../../src/NumericSensor.js';
import { ActionLoader } from '../../src/loader/ActionLoader.js';
import { ActionParser } from '../../src/loader/ActionParser.js';

const stressDir = join(dirname(fileURLToPath(import.meta.url)), '../../data/stress');

class TableNearSensor extends Sensor {
  constructor(pairs) { super(); this.pairs = pairs; }
  evaluate([a, b]) {
    const hit = this.pairs.has(`${a}:${b}`) || this.pairs.has(`${b}:${a}`);
    return { result: hit, detail: `near(${a}, ${b}) = ${hit}` };
  }
}

class TableDistanceSensor extends NumericSensor {
  constructor(table) { super(); this.table = table; }
  getValue([agent, place]) {
    const value = this.table[`${agent}:${place}`] ?? 999;
    return { value, detail: `distanceTo(${agent}, ${place}) = ${value}` };
  }
}

function buildWorld() {
  const interp = new Interpreter(stressDir);

  const nearPairs = new Set([
    'mara:petra', 'mara:una', 'oren:wren', 'oren:zeke', 'silas:viggo', 'talia:yara',
  ]);
  const distances = {
    'mara:tavern': 0, 'oren:market': 1, 'wren:market': 2, 'silas:mill': 1,
    'talia:market': 12, 'zeke:market': 0, 'yara:chapel': 0, 'petra:market': 4,
  };
  const sensors = new SensorQueryHandler();
  sensors.register('near', new TableNearSensor(nearPairs));
  sensors.registerNumeric('distanceTo', new TableDistanceSensor(distances));
  interp.world.queryHandlers.register('sensor', sensors);

  const derived = interp.world.queryHandlers.getHandler('derived');
  // kinOf has no authored definitions — answered by this code handler.
  derived.define('kinOf', ([a, b]) =>
    (a === 'talia' && b === 'yara') || (a === 'yara' && b === 'talia'));
  // Decoy handler: rivals HAS authored definitions, so this must never be
  // consulted (authored definitions take precedence over code handlers).
  derived.define('rivals', () => true);

  const { rules } = interp.ruleLoader.load(
    interp.ruleParser.parse(readFileSync(join(stressDir, 'rules'), 'utf-8'))
  );

  return { interp, world: interp.world, rules, nearPairs };
}

const q = (interp, text) => interp.query(text).length;

// Extracts a bound entity/value name from a query result binding.
function bound(binding, varName) {
  const value = binding.assignments.get(varName);
  return value?.name ?? value;
}

function numericValue(world, name, args) {
  return world.queryHandlers.getHandler('numeric').getValue(name, args);
}

// Sums adjustment deltas per contributing rule name for one numeric record.
function ruleContributions(world, name, args) {
  const record = world.queryHandlers.getHandler('numeric').getRecord(name, args);
  const sums = new Map();
  if (!record) return sums;
  for (const event of record.events) {
    if (event.type !== 'adjusted') continue;
    const ruleName = event.provenance?.rule?.name ?? '(given)';
    sums.set(ruleName, (sums.get(ruleName) ?? 0) + event.delta);
  }
  return sums;
}

// Every rule name that contributed any numeric adjustment anywhere.
function allFiringRuleNames(world) {
  const names = new Set();
  for (const record of world.queryHandlers.getHandler('numeric')._records.values()) {
    for (const event of record.events) {
      if (event.type === 'adjusted' && event.provenance?.rule?.name) {
        names.add(event.provenance.rule.name);
      }
    }
  }
  return names;
}

const tick = (world, rules) =>
  world.applyOnce(rules, { advanceTick: true, minimumSatisfactionScore: 1 });

describe('Stress scenario', () => {

  describe('loading', () => {
    it('loads the scenario and all 100 rules through the cycle detector', () => {
      const { rules } = buildWorld();
      assert.equal(rules.length, 100);
    });

    it('passes schema annotations through opaquely', () => {
      const { interp } = buildWorld();
      assert.equal(interp.schema.getDefinition('goodwill').annotations.ephemeral, true);
    });

    it('rejects the cyclic rule set', () => {
      const { interp } = buildWorld();
      const source = readFileSync(join(stressDir, 'invalid/rules-cycle'), 'utf-8');
      assert.throws(
        () => interp.ruleLoader.load(interp.ruleParser.parse(source)),
        /Cyclic rule dependency/
      );
    });

    it('rejects the cyclic definition set', () => {
      const { interp } = buildWorld();
      const source = readFileSync(join(stressDir, 'invalid/definitions-cycle'), 'utf-8');
      assert.throws(() => interp.loadDefinitions(source), /Cyclic derived-predicate/);
    });
  });

  describe('state and stores', () => {
    it('answers symmetric facts in both directions', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'knows(oren, mara)'), 1);
      assert.equal(q(interp, 'feuding(wren, viggo)'), 1);
    });

    it('propagates symmetric retraction to both directions', () => {
      const { interp } = buildWorld();
      interp.assert('not knows(mara, zeke)');
      assert.equal(q(interp, 'knows(mara, zeke)'), 0);
      assert.equal(q(interp, 'knows(zeke, mara)'), 0);
    });

    it('records backdated ticks and strengths', () => {
      const { world } = buildWorld();
      assert.deepEqual(world.factStore.getAssertionTicks('betrayed', ['oren', 'mara']), [-20]);
      assert.equal(world.factStore.getStrength('betrayed', ['oren', 'mara']), 0.9);
      assert.equal(world.getPrivateStore('petra').getStrength('suspects', ['petra', 'oren']), 0.7);
    });

    it('distinguishes all five negation forms on the same fact', () => {
      const { interp } = buildWorld();
      // wantsVisitors(silas): asserted at -8, retracted, explicit disbelief added.
      assert.equal(q(interp, 'wantsVisitors(silas)'), 0);
      assert.equal(q(interp, 'wantsVisitors(silas) [history]'), 1);
      assert.equal(q(interp, '-wantsVisitors(silas)'), 1);
      assert.equal(q(interp, 'not wantsVisitors(silas)'), 1);
      assert.equal(q(interp, '~wantsVisitors(silas)'), 1);
      assert.equal(q(interp, 'not -wantsVisitors(silas)'), 0);
    });

    it('allow policy: contradictory private beliefs coexist and ~ diverges from NAF', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'petra.suspects(petra, oren)'), 1);
      assert.equal(q(interp, '-petra.suspects(petra, oren)'), 1);
      assert.equal(q(interp, 'not petra.suspects(petra, oren)'), 0);
      assert.equal(q(interp, '~petra.suspects(petra, oren)'), 1);
    });

    it('block policy: the conflicting disbelief was silently dropped', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'silas.grudgeAgainst(silas, oren)'), 1);
      assert.equal(q(interp, '-silas.grudgeAgainst(silas, oren)'), 0);
    });

    it('lastWins policy: world disbelief retracts the positive fact', () => {
      const { interp } = buildWorld();
      interp.assert('-outsider(una)');
      assert.equal(q(interp, 'outsider(una)'), 0);
      assert.equal(q(interp, '-outsider(una)'), 1);
    });

    it('owner without a private store: positive and ~ are false, NAF is true', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'zeke.grudgeAgainst(zeke, mara)'), 0);
      assert.equal(q(interp, '~zeke.grudgeAgainst(zeke, mara)'), 0);
      assert.equal(q(interp, 'not zeke.grudgeAgainst(zeke, mara)'), 1);
    });

    it('enumerates a variable private-store owner in queries', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, '?W.suspects(?W, oren)'), 2); // petra, silas
    });
  });

  describe('query forms', () => {
    it('evaluates at-tick against past world state', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'knows(oren, silas) [at: -25]'), 1);
      assert.equal(q(interp, 'knows(mara, petra) [at: -25]'), 0); // asserted at 0
    });

    it('bounds historical checks by window', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'helped(mara, una) [history: 3]'), 1);   // -2
      assert.equal(q(interp, 'helped(mara, talia) [history: 3]'), 0); // -12
      assert.equal(q(interp, 'betrayed(oren, mara) [history: 25]'), 1);  // -20
      assert.equal(q(interp, 'betrayed(oren, silas) [history: 25]'), 0); // -30
    });

    it('checks numeric tiers historically', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'trust.devoted(yara, mara)'), 0);            // now 58
      assert.equal(q(interp, 'trust.devoted(yara, mara) [history]'), 1);  // once 88
    });

    it('honors temporal chain order and windows', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'betrayed(oren, mara) then apologized(oren, mara)'), 1);
      assert.equal(q(interp, 'betrayed(oren, mara) then[6] apologized(oren, mara)'), 1);
      assert.equal(q(interp, 'betrayed(oren, mara) then[3] apologized(oren, mara)'), 0);
      assert.equal(q(interp, 'apologized(oren, mara) then betrayed(oren, mara)'), 0);
      assert.equal(
        q(interp, 'betrayed(oren, mara) then apologized(oren, mara) then forgave(mara, oren)'),
        1
      );
    });

    it('evaluates tier boundaries as lower-inclusive', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'trust.high(petra, wren)'), 1);      // exactly 60
      assert.equal(q(interp, 'reputation.admired(talia)'), 1);    // exactly 75
      assert.equal(q(interp, 'reputation.dubious(silas)'), 1);    // 49
      assert.equal(q(interp, 'reputation(una) = 50'), 1);
      assert.equal(q(interp, 'trust(petra, mara) >= 80'), 1);
    });

    it('counts entity combinations, including symmetric and tier predicates', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, '|gossipedAbout(_, una)| = 2'), 1);
      assert.equal(q(interp, '|knows(mara, _)| >= 6'), 1);
      assert.equal(q(interp, '|trust.devoted(_, mara)| >= 3'), 1); // oren, talia, petra
      assert.equal(q(interp, '|feuding(wren, _)| > 0'), 1);        // via symmetry
    });

    it('answers sensors directly in queries', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'near(mara, petra)'), 1);
      assert.equal(q(interp, 'near(mara, silas)'), 0);
      assert.equal(q(interp, 'distanceTo.close(zeke, market)'), 1);
      assert.equal(q(interp, 'distanceTo(talia, market) >= 10'), 1);
      assert.equal(q(interp, 'distanceTo.far(talia, market)'), 1);
    });
  });

  describe('derived predicates', () => {
    it('proves simple definitions with negation premises', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'acquaintedPair(mara, oren)'), 1);
      assert.equal(q(interp, 'acquaintedPair(viggo, wren)'), 0); // feuding
    });

    it('proves multi-head definitions through either branch', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'closeAllies(mara, oren)'), 1);  // mutual devotion
      assert.equal(q(interp, 'closeAllies(talia, mara)'), 1); // proven by deeds
      assert.equal(q(interp, 'closeAllies(petra, mara)'), 0); // one-sided devotion
    });

    it('chains derived predicates three deep (marketRival → rivals → tension)', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'rivals(viggo, wren)'), 1);      // via feuding
      assert.equal(q(interp, 'marketRival(oren, wren)'), 0);  // no tension yet
    });

    it('evaluates counts, history, and negation-over-derived inside definitions', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'respectedElder(mara)'), 1);
      assert.equal(q(interp, 'respectedElder(talia)'), 0);  // admired but knows < 4
      assert.equal(q(interp, 'respectedElder(oren)'), 0);   // known but not admired
      assert.equal(q(interp, 'communityPillar(mara)'), 1);
      assert.equal(q(interp, 'whisperTarget(una)'), 1);
      assert.equal(q(interp, 'whisperTarget(zeke)'), 0);    // only one gossip
      assert.equal(q(interp, 'oldWound(silas, oren)'), 1);
      assert.equal(q(interp, 'oldWound(mara, oren)'), 0);   // forgiven
      assert.equal(q(interp, 'healedRift(oren, mara)'), 1); // 3-step chain
      assert.equal(q(interp, 'healedRift(oren, silas)'), 0);
      assert.equal(q(interp, 'mentorFigure(oren, silas)'), 1);
      assert.equal(q(interp, 'mentorFigure(silas, oren)'), 0); // reputation 49
    });

    it('discovers string variables from the fact store', () => {
      const { interp } = buildWorld();
      const consolers = interp.query('canConsole(?X, una)').map(b => bound(b, 'X'));
      assert.deepEqual(consolers.sort(), ['mara', 'talia']);
      assert.equal(q(interp, 'canConsole(mara, silas)'), 0);
    });

    it('reads private premises for world conclusions', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'privateEnemy(viggo, wren)'), 1);
      assert.equal(q(interp, 'privateEnemy(wren, viggo)'), 0); // disbelief only
    });

    it('keeps private conclusions separate from world conclusions', () => {
      const { interp } = buildWorld();
      const confidants = interp.query('?X.trustedConfidant(?X, ?Y)', { X: 'mara' });
      assert.equal(confidants.length, 1);
      assert.equal(bound(confidants[0], 'Y'), 'talia');
      // No world-level definition exists for trustedConfidant.
      assert.equal(q(interp, 'trustedConfidant(mara, talia)'), 0);
    });

    it('accepts sensor premises in definitions', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'companionAtHand(mara, petra)'), 1);
      assert.equal(q(interp, 'companionAtHand(oren, zeke)'), 0); // near but strangers
      assert.equal(q(interp, 'companionAtHand(mara, silas)'), 0); // not near
    });

    it('falls back to a code handler only when no definitions exist', () => {
      const { interp } = buildWorld();
      assert.equal(q(interp, 'kinOf(talia, yara)'), 1);  // handler-only predicate
      assert.equal(q(interp, 'kinOf(mara, talia)'), 0);
      // rivals has authored definitions, so its decoy always-true handler is
      // never consulted.
      assert.equal(q(interp, 'rivals(mara, talia)'), 0);
    });
  });

  describe('forward chaining — one tick, fully satisfied rules only', () => {
    it('accumulates the hand-computed totals for spot-checked pairs', () => {
      const { world, rules } = buildWorld();
      tick(world, rules);

      // tension(silas, oren) = A8 0.5 + B5 0.5 + C1 4 + C5 2 + E2 3 + E6 2
      //                      + G1 3 + H2 3 + H4 5 + H8 4 = 27
      assert.equal(numericValue(world, 'tension', ['silas', 'oren']), 27);

      // goodwill(mara, talia) = B1 1 + B4 0.5 + B6 0.5 + B7 0.5 + G5 0.5
      //   + C3 1 + C6 0.5 + E3 1 + E7 1 + G4 1 + G9 2 + H1 4 + H9 3
      //   + J1 4 + J3 2.5 = 23
      assert.equal(numericValue(world, 'goodwill', ['mara', 'talia']), 23);

      // goodwill(zeke, mara) = B1 1 + B3 1 + B4 0.5 + B6 0.5 + B7 0.5 + G5 0.5
      //   + C2 5 + C3 1 + E3 1 + E9 2 + A7 4 + H7 2 + H11 2 + L8 0.5 = 21.5
      assert.equal(numericValue(world, 'goodwill', ['zeke', 'mara']), 21.5);

      // prosperity(zeke): 10 + A6(-1) + F4(+1) + F8(-1) + I4(+1) + J2(-1) + L3(+1) = 10
      assert.equal(numericValue(world, 'prosperity', ['zeke']), 10);
    });

    it('records rule provenance on numeric adjustments', () => {
      const { world, rules } = buildWorld();
      tick(world, rules);
      const contributions = ruleContributions(world, 'tension', ['silas', 'oren']);
      assert.equal(contributions.get('C1 — remembered betrayal'), 4);
      assert.equal(contributions.get('C5 — ancient acquaintance'), 2);
      assert.equal(contributions.get('H4 — old wounds fester'), 5);
    });

    it('never fires the wrong-order chain, exceeded window, or unbound-negation rules', () => {
      const { world, rules } = buildWorld();
      tick(world, rules);
      const fired = allFiringRuleNames(world);
      assert.ok(!fired.has('D3 — contrition come too late'));
      assert.ok(!fired.has('D5 — wounds reopened'));
      assert.ok(!fired.has('L1 — unbound negation never fires'));
    });

    it('respects no-store targets and block policy in rule effects', () => {
      const { world, rules } = buildWorld();
      tick(world, rules);
      // G7 wrote into una's store but silently skipped store-less zeke.
      assert.ok(world.getPrivateStore('una').contains('admires', 'una', 'mara'));
      assert.equal(world.getPrivateStore('zeke'), null);
      // G6 planted suspicion in mara's store (victim of oren's betrayal)...
      assert.ok(world.getPrivateStore('mara').contains('suspects', 'mara', 'oren'));
      assert.equal(world.getPrivateStore('mara').getStrength('suspects', ['mara', 'oren']), 0.6);
      // ...and G10 gave her private regard for oren after the healed rift.
      assert.ok(world.getPrivateStore('mara').contains('admires', 'mara', 'oren'));
    });

    it('adjusts private numeric state through owner-prefixed effects', () => {
      const { world, rules } = buildWorld();
      tick(world, rules);
      // G8: mara's private trust toward talia rose 81 → 86; world value untouched.
      assert.equal(world.getPrivateStore('mara').getCurrentValue('trust', ['mara', 'talia']), 86);
      assert.equal(numericValue(world, 'trust', ['mara', 'talia']), 75);
    });
  });

  describe('partial truth and importance', () => {
    it('scores weighted conjunctions by satisfied importance', () => {
      const { interp } = buildWorld();
      const apps = interp.evaluateDegrees(
        'knows(?X, ?Y) [importance: 1.5] ^ trust(?X, ?Y) >= 95 [importance: 0.5]',
        { X: 'mara', Y: 'oren' }
      );
      assert.equal(apps.length, 1);
      assert.equal(apps[0].satisfactionScore, 0.75);
    });

    it('scales numeric deltas by satisfaction below the gate', () => {
      const { world, rules } = buildWorld();
      const j4 = rules.filter(r => r.name.startsWith('J4'));
      world.applyOnce(j4, { advanceTick: true }); // no satisfaction gate
      assert.equal(numericValue(world, 'goodwill', ['mara', 'oren']), 0.75);
    });

    it('supports custom delta scaling', () => {
      const { world, rules } = buildWorld();
      const j4 = rules.filter(r => r.name.startsWith('J4'));
      world.applyOnce(j4, { advanceTick: true, scaleDelta: (delta) => delta });
      assert.equal(numericValue(world, 'goodwill', ['mara', 'oren']), 1);
    });

    it('drops partially satisfied applications under minimumSatisfactionScore 1', () => {
      const { world, rules } = buildWorld();
      const j4 = rules.filter(r => r.name.startsWith('J4'));
      world.applyOnce(j4, { advanceTick: true, minimumSatisfactionScore: 1 });
      assert.equal(numericValue(world, 'goodwill', ['mara', 'oren']), 0);
    });
  });

  describe('boolean cascade — fixpoint vs single pass', () => {
    it('completes the reverse-ordered cascade only under fixpoint apply()', () => {
      const { interp, world, rules } = buildWorld();
      const kRules = rules.filter(r => r.name.startsWith('K'));
      world.apply(kRules, { advanceTick: true, minimumSatisfactionScore: 1 });

      assert.equal(q(interp, 'nominatedElder(mara)'), 1);
      assert.equal(q(interp, 'electedElder(mara)'), 1);
      assert.equal(q(interp, 'invitedTo(mara, chapel)'), 1);
      assert.equal(q(interp, 'helped(mara, silas)'), 1);
      assert.equal(q(interp, 'forgave(oren, mara)'), 1);
      // K4 dissolved the feud (symmetric retraction).
      assert.equal(q(interp, 'feuding(viggo, wren)'), 0);
      assert.equal(q(interp, 'feuding(wren, viggo)'), 0);
    });

    it('stalls after the first stage under applyOnce()', () => {
      const { interp, world, rules } = buildWorld();
      const kRules = rules.filter(r => r.name.startsWith('K'));
      world.applyOnce(kRules, { advanceTick: true, minimumSatisfactionScore: 1 });

      assert.equal(q(interp, 'nominatedElder(mara)'), 1);
      assert.equal(q(interp, 'electedElder(mara)'), 0); // needs a second pass
      assert.equal(q(interp, 'forgave(oren, mara)'), 1); // K7 is history-driven
    });
  });

  describe('multi-tick simulation', () => {
    it('evolves the village over four ticks', () => {
      const { interp, world, rules, nearPairs } = buildWorld();

      tick(world, rules); // tick 1
      assert.equal(q(interp, 'nominatedElder(mara)'), 1);
      assert.equal(q(interp, 'electedElder(mara)'), 0);
      // L4 made oren's old betrayal common gossip. (The derived whisperTarget
      // flip only shows after the tick advances — derived results are cached
      // per tick, so the count is checked raw here and the predicate below.)
      assert.equal(q(interp, '|gossipedAbout(_, oren)| >= 2'), 1);
      // ...and L7 reopened silas's door after yara's recent kindness.
      assert.equal(q(interp, 'not -wantsVisitors(silas)'), 1);

      // The village stirs: una gossips back about petra, and the feuding
      // farmers end up side by side at the mill.
      interp.assert('gossipedAbout(una, petra)');
      nearPairs.add('viggo:wren');

      tick(world, rules); // tick 2
      assert.equal(q(interp, 'electedElder(mara)'), 1);
      assert.equal(q(interp, 'whisperTarget(oren)'), 1);
      // Market tension has crossed the rivals threshold by now.
      assert.equal(q(interp, 'marketRival(oren, wren)'), 1);

      tick(world, rules); // tick 3
      assert.equal(q(interp, 'invitedTo(mara, chapel)'), 1);
      assert.equal(q(interp, 'feuding(viggo, wren)'), 0); // K4 soothed it

      tick(world, rules); // tick 4

      // D8 (gossip then counter-gossip) fired on ticks 2–4.
      const petraUna = ruleContributions(world, 'tension', ['petra', 'una']);
      assert.equal(petraUna.get('D8 — gossip comes back around'), 9);

      // I2 fired while the feud lasted (ticks 2 and 3).
      const viggoWren = ruleContributions(world, 'tension', ['viggo', 'wren']);
      assert.equal(viggoWren.get('I2 — enemies in close quarters'), 8);

      // B2 stopped once L7 retracted silas's disbelief after tick 1.
      const orenSilas = ruleContributions(world, 'tension', ['oren', 'silas']);
      assert.equal(orenSilas.get('B2 — respect the recluse'), 1);

      // C2's window: helped(mara, zeke) at tick -1 was caught on ticks 1–2 only.
      const zekeMara = ruleContributions(world, 'goodwill', ['zeke', 'mara']);
      assert.equal(zekeMara.get('C2 — fresh gratitude'), 10);
      // K6's tick-3 help reached silas inside the window by tick 4.
      const silasMara = ruleContributions(world, 'goodwill', ['silas', 'mara']);
      assert.equal(silasMara.get('C2 — fresh gratitude'), 5);

      // G6 planted mara's suspicion of oren on tick 1; G1 fired from tick 2 on.
      const maraOren = ruleContributions(world, 'tension', ['mara', 'oren']);
      assert.equal(maraOren.get('G1 — suspicion breeds distance'), 9);

      // L5 pins the elected elder's reputation at 90 (L group runs after F3).
      assert.equal(numericValue(world, 'reputation', ['mara']), 90);

      // L6: gossip kept eroding trust toward the gossips.
      assert.equal(numericValue(world, 'trust', ['una', 'petra']), 42);
    });
  });

  describe('action simulation — 16 social actions, 10 steps', () => {
    const AGENTS = ['mara', 'oren', 'petra', 'silas', 'talia', 'una', 'viggo', 'wren', 'yara', 'zeke'];

    function buildSimWorld() {
      const { interp, world, rules, nearPairs } = buildWorld();
      const actionsSource = readFileSync(join(stressDir, 'actions'), 'utf-8');
      const { actions } = new ActionLoader(interp.schema).load(
        new ActionParser().parse(actionsSource)
      );
      interp.actionsets.set('social', actions);
      return { interp, world, rules, nearPairs };
    }

    function runStep(interp, world, rules) {
      for (const agentName of AGENTS) {
        const candidates = interp.scoreActionset('social', { SELF: agentName }, { minimumScore: 0 });
        if (candidates.length > 0) {
          const { action, binding } = candidates[0];
          action.execute(binding, interp.world.queryHandlers, null, { privateStores: interp.world.privateStores });
        }
      }
      world.applyOnce(rules, { advanceTick: true, minimumSatisfactionScore: 1 });
    }

    it('loads 16 actions from the social actionset', () => {
      const { interp } = buildSimWorld();
      assert.equal(interp.actionsets.get('social').length, 16);
    });

    it('all 10 agents find a scored action before step 1', () => {
      const { interp } = buildSimWorld();
      for (const agent of AGENTS) {
        const candidates = interp.scoreActionset('social', { SELF: agent }, { minimumScore: 0 });
        assert.ok(candidates.length > 0, `${agent} has no eligible action`);
      }
    });

    it('viggo\'s top action on step 1 is "end a feud" and its content renders', () => {
      const { interp } = buildSimWorld();
      const candidates = interp.scoreActionset('social', { SELF: 'viggo' }, { minimumScore: 0 });
      assert.equal(candidates[0].action.name, 'end a feud');
      assert.equal(candidates[0].action.content.render(candidates[0].binding), 'viggo makes peace with wren');
    });

    it('evolves the village over 10 steps — repairs and consequences accumulate', () => {
      const { interp, world, rules } = buildSimWorld();

      runStep(interp, world, rules); // step 1
      // viggo ends the feud immediately (highest scoring action, score 5 vs others < 2)
      assert.equal(q(interp, 'feuding(viggo, wren)'), 0);
      assert.equal(q(interp, 'feuding(wren, viggo)'), 0);

      for (let i = 1; i < 10; i++) runStep(interp, world, rules); // steps 2–10

      // oren market-hustles until rep hits 75, then seeks forgiveness from silas
      assert.equal(q(interp, 'apologized(oren, silas)'), 1);

      // silas accepts oren's apology once the temporal chain is satisfied
      assert.equal(q(interp, 'forgave(silas, oren)'), 1);

      // zeke benefited from seeking patronage (prosperity rises above initial 10)
      assert.ok(numericValue(world, 'prosperity', ['zeke']) > 10);

      // yara restored silas's dignity; reputation rose above the initial 49
      assert.ok(numericValue(world, 'reputation', ['silas']) > 49);
    });

    it('exercises every utility source type across the actionset', () => {
      const { interp } = buildSimWorld();
      const actions = interp.actionsets.get('social');
      const sourceTypes = new Set(
        actions.flatMap(a => a.utilitySources.map(s => s.constructor.name))
      );
      // All four source types must appear somewhere in the actionset
      assert.ok(sourceTypes.has('ConstantUtilitySource'),   'constant source missing');
      assert.ok(sourceTypes.has('PredicateUtilitySource'),  'predicate source missing');
      assert.ok(sourceTypes.has('RuleUtilitySource'),       'rule source missing');
      assert.ok(sourceTypes.has('AggregateUtilitySource'),  'aggregate source missing');
    });

    it('exercises all four aggregate operators across the actionset', () => {
      const { interp } = buildSimWorld();
      const aggregators = new Set(
        interp.actionsets.get('social')
          .flatMap(a => a.utilitySources)
          .filter(s => s.constructor.name === 'AggregateUtilitySource')
          .map(s => s.aggregator)
      );
      assert.ok(aggregators.has('sum'), 'sum aggregator missing');
      assert.ok(aggregators.has('avg'), 'avg aggregator missing');
      assert.ok(aggregators.has('min'), 'min aggregator missing');
      assert.ok(aggregators.has('max'), 'max aggregator missing');
    });
  });
});
