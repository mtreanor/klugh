import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Interpreter } from '../src/Interpreter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir   = join(__dirname, '../../data/logic');

function names(bindings, varName) {
  return bindings.map(b => b.assignments.get(varName)?.name ?? b.assignments.get(varName)).sort();
}

let interp;
beforeEach(() => { interp = new Interpreter(dataDir); });

describe('Interpreter.query — ground queries', () => {
  it('returns one empty binding for a true ground query', () => {
    const result = interp.query('knows(alice, bob)');
    assert.equal(result.length, 1);
    assert.equal(result[0].assignments.size, 0);
  });

  it('returns empty array for a false ground query', () => {
    assert.deepEqual(interp.query('knows(bob, carol)'), []);
  });
});

describe('Interpreter.query — single variable', () => {
  it('returns all agents alice knows', () => {
    const result = interp.query('knows(alice, ?Y)');
    assert.deepEqual(names(result, 'Y'), ['bob', 'carol']);
  });

  it('returns all agents who know alice', () => {
    // knows(bob, alice) is asserted; knows(alice, carol) implies knows(carol, alice) via symmetry
    const result = interp.query('knows(?X, alice)');
    assert.deepEqual(names(result, 'X'), ['bob', 'carol']);
  });
});

describe('Interpreter.query — two variables', () => {
  it('enumerates all knows pairs including symmetric', () => {
    const result = interp.query('knows(?X, ?Y)');
    const pairs = result
      .map(b => `${b.assignments.get('X').name},${b.assignments.get('Y').name}`)
      .sort();
    // knows(alice,carol) implies knows(carol,alice) via symmetry
    assert.deepEqual(pairs, ['alice,bob', 'alice,carol', 'bob,alice', 'carol,alice']);
  });
});

describe('Interpreter.query — partial binding argument', () => {
  it('fixes one variable and enumerates the other', () => {
    const result = interp.query('knows(?X, ?Y)', { X: 'alice' });
    assert.deepEqual(names(result, 'Y'), ['bob', 'carol']);
  });

  it('ground query via partial binding', () => {
    const result = interp.query('knows(?X, ?Y)', { X: 'alice', Y: 'bob' });
    assert.equal(result.length, 1);
  });

  it('returns empty when partial binding yields no results', () => {
    const result = interp.query('knows(?X, ?Y)', { X: 'bob', Y: 'carol' });
    assert.deepEqual(result, []);
  });
});

describe('Interpreter.query — numeric tier', () => {
  it('finds agents alice has a strong friendship with', () => {
    // friendship(alice, bob) = 85 (strong), friendship(alice, carol) = 30 (cold)
    const result = interp.query('friendship.strong(alice, ?Y)');
    assert.deepEqual(names(result, 'Y'), ['bob']);
  });

  it('finds agents alice has a cold friendship with', () => {
    const result = interp.query('friendship.cold(alice, ?Y)');
    assert.deepEqual(names(result, 'Y'), ['carol']);
  });
});

describe('Interpreter.query — conjunction', () => {
  it('finds agents who share a knowledge domain with alice', () => {
    // alice knows: karate, philosophy. bob knows: philosophy. carol knows: karate.
    const result = interp.query('knows(alice, ?Y) ^ hasKnowledge(alice, ?K) ^ hasKnowledge(?Y, ?K)');
    const yNames = names(result, 'Y');
    assert.ok(yNames.includes('bob'),  'bob shares philosophy');
    assert.ok(yNames.includes('carol'), 'carol shares karate');
  });

  it('narrows results when both predicates must hold', () => {
    // alice knows bob and carol, but only has strong friendship with bob
    const result = interp.query('knows(alice, ?Y) ^ friendship.strong(alice, ?Y)');
    assert.deepEqual(names(result, 'Y'), ['bob']);
  });
});

describe('Interpreter.query — symmetric predicates', () => {
  it('returns true for the reverse of an asserted symmetric fact', () => {
    // knows(alice, carol) is asserted; knows(carol, alice) is not — but should match
    const result = interp.query('knows(carol, alice)');
    assert.equal(result.length, 1);
  });

  it('enumerates both directions for a symmetric predicate', () => {
    // carol knows alice (via symmetry from knows(alice, carol))
    const result = interp.query('knows(carol, ?Y)');
    assert.deepEqual(names(result, 'Y'), ['alice']);
  });

  it('does not invent facts beyond symmetry', () => {
    // neither knows(carol, bob) nor knows(bob, carol) exists
    assert.deepEqual(interp.query('knows(carol, bob)'), []);
    assert.deepEqual(interp.query('knows(bob, carol)'), []);
  });
});

describe('Interpreter.query — non-agent variables', () => {
  it('enumerates knowledge domains', () => {
    const result = interp.query('hasKnowledge(alice, ?K)');
    assert.deepEqual(names(result, 'K'), ['karate', 'philosophy']);
  });
});

describe('Interpreter — distinct entity arguments per predicate', () => {
  it('does not bind a variable to the same agent as a literal in the same predicate', () => {
    const result = interp.query('knows(alice, ?Y) ^ hasKnowledge(?Y, karate)');
    assert.deepEqual(names(result, 'Y'), ['carol']);
  });

  it('still allows a different agent when only one predicate fixes alice', () => {
    assert.deepEqual(names(interp.query('knows(alice, ?Y)'), 'Y'), ['bob', 'carol']);
  });

  it('excludes bindings that would require self-knows in either predicate', () => {
    // knows(bob, bob) is never enumerated; no agent is known to both alice and bob in the demo world
    assert.deepEqual(interp.query('knows(alice, ?Y) ^ knows(bob, ?Y)'), []);
  });

  it('excludes reflexive candidates from degree mode', () => {
    const apps = interp.evaluateDegrees('knows(alice, ?Y) ^ hasKnowledge(?Y, karate)');
    assert.ok(!apps.some(a => a.binding.assignments.get('Y')?.name === 'alice'));
  });
});

describe('Interpreter.evaluateDegrees', () => {
  it('scores bindings by weighted average of satisfied predicates', () => {
    const apps = interp.evaluateDegrees('knows(alice, ?Y) ^ friendship.strong(alice, ?Y)');
    const byY = Object.fromEntries(
      apps.map(a => [a.binding.assignments.get('Y').name, a.truthDegree])
    );
    assert.equal(byY.bob, 1);
    assert.equal(byY.carol, 0.5);
  });

  it('weights predicates by [importance: N]', () => {
    const apps = interp.evaluateDegrees(
      'knows(alice, ?Y) [importance: 2] ^ friendship.strong(alice, ?Y)'
    );
    const carol = apps.find(a => a.binding.assignments.get('Y').name === 'carol');
    assert.ok(Math.abs(carol.truthDegree - 2 / 3) < 1e-9);
  });

  it('returns a fully satisfied ground binding at 1.0', () => {
    const apps = interp.evaluateDegrees('knows(alice, bob)');
    assert.equal(apps.length, 1);
    assert.equal(apps[0].truthDegree, 1);
  });

  it('respects minimumTruthDegree', () => {
    const all = interp.evaluateDegrees('knows(alice, ?Y) ^ friendship.strong(alice, ?Y)');
    const partial = interp.evaluateDegrees(
      'knows(alice, ?Y) ^ friendship.strong(alice, ?Y)',
      {},
      { minimumTruthDegree: 1 }
    );
    // ?Y enumerates bob and carol; alice is excluded (knows(alice, alice))
    assert.equal(all.length, 2);
    assert.equal(partial.length, 1);
    assert.equal(partial[0].binding.assignments.get('Y').name, 'bob');
  });
});

describe('Interpreter.query — count predicates', () => {
  it('is true when the count matches', () => {
    // alice knows 2 knowledge domains
    assert.equal(interp.query('|hasKnowledge(alice, _)| = 2').length, 1);
  });

  it('is false when the count does not match', () => {
    assert.deepEqual(interp.query('|hasKnowledge(alice, _)| = 1'), []);
  });

  it('counts over a non-agent type', () => {
    // karate is known by alice and carol (2 agents)
    assert.equal(interp.query('|hasKnowledge(_, karate)| = 2').length, 1);
  });

  it('combines count with a free variable', () => {
    // alice and carol each know exactly 1 knowledge domain
    // bob knows 1, alice knows 2, carol knows 1
    const result = interp.query('|hasKnowledge(?X, _)| = 1');
    assert.deepEqual(names(result, 'X'), ['bob', 'carol']);
  });

  it('combines count with another predicate', () => {
    // among agents alice knows, only bob has more than 0 knowledge domains
    // (both bob and carol do, but carol knows 1, bob knows 1 — both > 0)
    const result = interp.query('knows(alice, ?Y) ^ |hasKnowledge(?Y, _)| > 0');
    assert.deepEqual(names(result, 'Y'), ['bob', 'carol']);
  });
});
