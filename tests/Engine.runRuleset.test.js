import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/Engine.js';
import { Sensor } from '../src/Sensor.js';
import { SensorQueryHandler } from '../src/queryHandlers/SensorQueryHandler.js';
import { SensorProvenance } from '../src/provenance/SensorProvenance.js';
import { RuleEffectProvenance } from '../src/provenance/RuleEffectProvenance.js';

function buildEngine() {
  return new Engine({
    predicates: { predicates: {
      a: { type: 'boolean', args: ['agent'] },
      b: { type: 'boolean', args: ['agent'] },
      c: { type: 'boolean', args: ['agent'] },
    }},
    entities: { agent: { alice: {} } },
  });
}

describe('Engine.runRuleset — fixpoint convergence', () => {
  it('terminates on an idempotent rule whose conclusion is never consumed', () => {
    // a ^ b => c: once c is asserted, re-asserting it is a no-op. The chainer
    // must reach fixpoint rather than loop forever on the re-satisfiable premises.
    const engine = buildEngine();
    engine.assert('a(alice)');
    engine.assert('b(alice)');
    engine.loadRules(`
      rule "mark"
        a(?X) ^ b(?X)
        => c(?X)
    `, 'derive');

    const fired = engine.runRuleset('derive');

    assert.ok(engine.query('c(alice)').length > 0, 'c(alice) should be asserted');
    assert.equal(fired.length, 1, 'rule should fire exactly once');
  });

  it('terminates on a NAF-guarded rule (a ^ not c => c)', () => {
    // Classic self-limiting rule: fires once (asserts c), then `not c` prevents
    // re-firing. Must converge without any explicit idempotency concern.
    const engine = buildEngine();
    engine.assert('a(alice)');
    engine.loadRules(`
      rule "once"
        a(?X) ^ not c(?X)
        => c(?X)
    `, 'derive');

    engine.runRuleset('derive');

    assert.ok(engine.query('c(alice)').length > 0, 'c(alice) should be asserted');
  });

  it('handles a two-step derivation chain (a => b, b => c)', () => {
    const engine = buildEngine();
    engine.assert('a(alice)');
    engine.loadRules(`
      rule "step1"
        a(?X)
        => b(?X)
      rule "step2"
        b(?X)
        => c(?X)
    `, 'derive');

    engine.runRuleset('derive');

    assert.ok(engine.query('b(alice)').length > 0, 'b(alice) should be asserted');
    assert.ok(engine.query('c(alice)').length > 0, 'c(alice) should be asserted');
  });

  it('terminates on a self-retracting rule (a ^ b => retract a)', () => {
    // Retracting a premise makes the rule unsatisfiable on the next pass.
    const engine = buildEngine();
    engine.assert('a(alice)');
    engine.assert('b(alice)');
    engine.loadRules(`
      rule "consume"
        a(?X) ^ b(?X)
        => not a(?X)
    `, 'derive');

    engine.runRuleset('derive');

    assert.ok(engine.query('b(alice)').length > 0, 'b(alice) should still be present');
    assert.equal(engine.query('a(alice)').length, 0, 'a(alice) should have been retracted');
  });

  it('returns the list of rule applications that fired', () => {
    const engine = buildEngine();
    engine.assert('a(alice)');
    engine.assert('b(alice)');
    engine.loadRules(`
      rule "mark"
        a(?X) ^ b(?X)
        => c(?X)
    `, 'derive');

    const fired = engine.runRuleset('derive');

    assert.equal(fired.length, 1);
    assert.equal(fired[0].rule.name, 'mark');
  });
});

describe('Engine.runRuleset — sensor premise provenance', () => {
  function buildSensorEngine() {
    const engine = new Engine({
      predicates: { predicates: {
        score:  { type: 'numeric', args: ['agent'], minValue: 0, maxValue: 100, default: 0, tiers: {} },
        near:   { type: 'sensor',  args: ['agent', 'agent'] },
      }},
      entities: { agent: { alice: {}, bob: {} } },
    });

    const sensors = new SensorQueryHandler();
    sensors.register('near', new class extends Sensor {
      evaluate([a, b]) {
        const close = (a === 'alice' && b === 'bob');
        return { result: close, detail: close ? 'distance=1' : 'distance=99' };
      }
    });
    engine.world.queryHandlers.register('sensor', sensors);

    engine.loadRules(`
      rule "proximity bonus"
        near(?X, ?Y)
        => score(?X) += 5
    `, 'tick');

    return engine;
  }

  it('sensor premise justification is kind "sensor" in RuleEffectProvenance', () => {
    const engine = buildSensorEngine();
    const numeric = engine.world.queryHandlers.getHandler('numeric');

    engine.runRuleset('tick');

    const record = numeric.getRecord('score', ['alice']);
    assert.ok(record, 'score(alice) should have a numeric record');

    const adj = record.events.find(e => e.type === 'adjusted');
    assert.ok(adj, 'should have an adjustment event');

    const prov = adj.provenance;
    assert.ok(prov instanceof RuleEffectProvenance);
    assert.equal(prov.rule.name, 'proximity bonus');

    const j = prov.premiseRecords[0];
    assert.equal(j.kind, 'sensor');
    assert.ok(j.record instanceof SensorProvenance);
    assert.equal(j.record.sensorName, 'near');
    assert.deepEqual(j.record.resolvedArgs, ['alice', 'bob']);
    assert.equal(j.record.result, true);
    assert.equal(j.record.detail, 'distance=1');
  });

  it('sensor premise detail is the application-supplied string', () => {
    const engine = buildSensorEngine();
    const numeric = engine.world.queryHandlers.getHandler('numeric');
    engine.runRuleset('tick');
    const record = numeric.getRecord('score', ['alice']);
    const prov   = record.events.find(e => e.type === 'adjusted').provenance;
    assert.equal(prov.premiseRecords[0].record.detail, 'distance=1');
  });
});
