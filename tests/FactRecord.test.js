import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FactRecord } from '../src/FactRecord.js';
import { Fact } from '../src/Fact.js';
import { GivenProvenance } from '../src/provenance/GivenProvenance.js';

function assertEvent(tick = 1, strength = 1.0) {
  return { type: 'asserted', tick, strength, provenance: new GivenProvenance() };
}

function retractEvent(tick = 2) {
  return { type: 'retracted', tick, provenance: new GivenProvenance() };
}

describe('FactRecord — event log', () => {
  it('starts with an empty event log', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    assert.deepEqual(r.events, []);
  });

  it('addEvent appends to the log', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(2));
    assert.equal(r.events.length, 2);
  });
});

describe('FactRecord — assertedAt', () => {
  it('returns the tick of the first assertion event', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(3));
    assert.equal(r.assertedAt, 3);
  });

  it('returns null when no events are present', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    assert.equal(r.assertedAt, null);
  });

  it('returns the first assertion tick even after retraction and re-assertion', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(2));
    r.addEvent(assertEvent(5));
    assert.equal(r.assertedAt, 1);
  });
});

describe('FactRecord — retractedAt', () => {
  it('returns null when the fact is currently active', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    assert.equal(r.retractedAt, null);
  });

  it('returns the tick of the most recent retraction', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(3));
    assert.equal(r.retractedAt, 3);
  });
});

describe('FactRecord — strength', () => {
  it('returns the strength from the most recent assertion event', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent({ type: 'asserted', tick: 1, strength: 0.6, provenance: new GivenProvenance() });
    assert.equal(r.strength, 0.6);
  });

  it('returns 0 when the fact has no events', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    assert.equal(r.strength, 0);
  });

  it('returns 0 when the fact is retracted', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1, 0.8));
    r.addEvent(retractEvent(2));
    assert.equal(r.strength, 0);
  });

  it('setting strength mutates the most recent assertion event', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1, 0.5));
    r.strength = 0.9;
    assert.equal(r.strength, 0.9);
  });
});

describe('FactRecord — isCurrentlyActive', () => {
  it('returns false with no events', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    assert.equal(r.isCurrentlyActive(), false);
  });

  it('returns true after an assertion', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    assert.equal(r.isCurrentlyActive(), true);
  });

  it('returns false after retraction', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(2));
    assert.equal(r.isCurrentlyActive(), false);
  });

  it('returns true after retraction followed by re-assertion', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(2));
    r.addEvent(assertEvent(3));
    assert.equal(r.isCurrentlyActive(), true);
  });
});

describe('FactRecord — isActiveAt', () => {
  it('returns false before first assertion', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(3));
    assert.equal(r.isActiveAt(2), false);
  });

  it('returns true at the assertion tick', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(3));
    assert.equal(r.isActiveAt(3), true);
  });

  it('returns false at the retraction tick', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(3));
    assert.equal(r.isActiveAt(3), false);
  });

  it('returns true between assertion and retraction', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(5));
    assert.equal(r.isActiveAt(3), true);
  });

  it('handles re-assertion correctly', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(3));
    r.addEvent(assertEvent(5));
    assert.equal(r.isActiveAt(2), true);
    assert.equal(r.isActiveAt(4), false);
    assert.equal(r.isActiveAt(6), true);
  });
});

describe('FactRecord — wasAssertedAt', () => {
  it('returns true when an assertion event exists at the given tick', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(3));
    assert.equal(r.wasAssertedAt(3), true);
  });

  it('returns false for a tick with no assertion event', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(3));
    assert.equal(r.wasAssertedAt(2), false);
  });

  it('detects a re-assertion at a later tick', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1));
    r.addEvent(retractEvent(2));
    r.addEvent(assertEvent(5));
    assert.equal(r.wasAssertedAt(5), true);
    assert.equal(r.wasAssertedAt(1), true);
    assert.equal(r.wasAssertedAt(3), false);
  });
});

describe('FactRecord — currentReasons', () => {
  it('returns all assertion events when never retracted', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1, 0.5));
    r.addEvent(assertEvent(3, 0.8));
    const reasons = r.currentReasons();
    assert.equal(reasons.length, 2);
  });

  it('returns only post-retraction assertion events', () => {
    const r = new FactRecord(new Fact('happy', 'alice'));
    r.addEvent(assertEvent(1, 0.5));
    r.addEvent(retractEvent(2));
    r.addEvent(assertEvent(5, 0.9));
    const reasons = r.currentReasons();
    assert.equal(reasons.length, 1);
    assert.equal(reasons[0].tick, 5);
  });
});
