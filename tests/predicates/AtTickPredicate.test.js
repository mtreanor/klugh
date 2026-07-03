import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AtTickPredicate } from '../../src/predicates/AtTickPredicate.js';

// A stub inner predicate that records the tick of the context it is evaluated
// against, so we can see which tick the wrapper resolved to.
function recordingInner() {
  const seen = [];
  return {
    seen,
    evaluate(_binding, ctx) { seen.push(ctx.currentTick); return true; },
    toString() { return 'p'; },
  };
}

// A minimal context reporting `now` as its current tick; withTick yields a
// context reporting the requested tick.
function contextAtTick(now) {
  return { currentTick: now, withTick: (t) => ({ currentTick: t }) };
}

describe('AtTickPredicate', () => {
  it('[tick: N] evaluates the inner predicate at the absolute tick N', () => {
    const inner = recordingInner();
    new AtTickPredicate(inner, 4).evaluate(null, contextAtTick(30));
    assert.deepEqual(inner.seen, [4]);
  });

  it('[ago: N] evaluates the inner predicate at currentTick - N', () => {
    const inner = recordingInner();
    new AtTickPredicate(inner, 20, true).evaluate(null, contextAtTick(30));
    assert.deepEqual(inner.seen, [10]); // 30 - 20, per the proposal's worked example
  });

  it('renders [tick: N] and [ago: N] in toString', () => {
    assert.equal(new AtTickPredicate({ toString: () => 'p' }, 4).toString(), 'p [tick: 4]');
    assert.equal(new AtTickPredicate({ toString: () => 'p' }, 20, true).toString(), 'p [ago: 20]');
  });
});
