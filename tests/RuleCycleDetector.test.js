import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleCycleDetector } from '../src/RuleCycleDetector.js';
import { Rule } from '../src/Rule.js';
import { FactPredicate } from '../src/predicates/FactPredicate.js';
import { NegationPredicate } from '../src/predicates/NegationPredicate.js';
import { StateOperation } from '../src/stateOperations/StateOperation.js';
import { LogicalVariable } from '../src/LogicalVariable.js';

const X = new LogicalVariable('X');
const Y = new LogicalVariable('Y');

function booleanEffect(name) {
  return new StateOperation('assert', name, [X, Y]);
}

function numericEffect(name) {
  return new StateOperation('adjust-numeric', name, [X, Y], { delta: 1 });
}

function rule(name, lhsNames, effects) {
  const predicates = lhsNames.map(n => ({ predicate: new FactPredicate(n, X, Y), importance: 1.0 }));
  return new Rule(name, predicates, effects);
}

const detector = new RuleCycleDetector();

describe('RuleCycleDetector', () => {
  it('returns null for an empty rule set', () => {
    assert.strictEqual(detector.detect([]), null);
  });

  it('returns null when all RHS effects are numeric', () => {
    const rules = [
      rule('R1', ['knows', 'trusts'], [numericEffect('exploitative')]),
      rule('R2', ['exploited'], [numericEffect('cautious')]),
    ];
    assert.strictEqual(detector.detect(rules), null);
  });

  it('returns null when boolean effects do not overlap with any LHS', () => {
    const rules = [
      rule('R1', ['knows'], [booleanEffect('trusts')]),
      rule('R2', ['hostile'], [booleanEffect('wary')]),
    ];
    assert.strictEqual(detector.detect(rules), null);
  });

  it('returns null for a chain with no cycle', () => {
    // R1 asserts p, R2 checks p and asserts q — but R1 does not check q
    const rules = [
      rule('R1', ['knows'], [booleanEffect('p')]),
      rule('R2', ['p'], [booleanEffect('q')]),
      rule('R3', ['q'], [numericEffect('score')]),
    ];
    assert.strictEqual(detector.detect(rules), null);
  });

  it('detects a self-cycle — rule asserts a predicate in its own LHS', () => {
    const rules = [
      rule('R1', ['p'], [booleanEffect('p')]),
    ];
    const cycle = detector.detect(rules);
    assert.ok(cycle !== null, 'expected a cycle to be detected');
    assert.ok(cycle.includes('R1'));
  });

  it('detects a two-rule cycle', () => {
    // R1: checks q, asserts p — R2: checks p, asserts q
    const rules = [
      rule('R1', ['q'], [booleanEffect('p')]),
      rule('R2', ['p'], [booleanEffect('q')]),
    ];
    const cycle = detector.detect(rules);
    assert.ok(cycle !== null, 'expected a cycle to be detected');
    assert.ok(cycle.includes('R1'));
    assert.ok(cycle.includes('R2'));
  });

  it('detects a three-rule cycle', () => {
    const rules = [
      rule('R1', ['c'], [booleanEffect('a')]),
      rule('R2', ['a'], [booleanEffect('b')]),
      rule('R3', ['b'], [booleanEffect('c')]),
    ];
    const cycle = detector.detect(rules);
    assert.ok(cycle !== null, 'expected a cycle to be detected');
    assert.strictEqual(cycle.length, 4); // R1→R2→R3→R1
  });

  it('detects a cycle even when non-cycling rules are present', () => {
    const rules = [
      rule('safe1', ['x'], [numericEffect('score')]),
      rule('R1',   ['q'], [booleanEffect('p')]),
      rule('R2',   ['p'], [booleanEffect('q')]),
      rule('safe2', ['y'], [booleanEffect('z')]),
    ];
    const cycle = detector.detect(rules);
    assert.ok(cycle !== null, 'expected a cycle to be detected');
    assert.ok(cycle.includes('R1') || cycle.includes('R2'));
  });

  it('does not flag a rule that asserts a predicate used only in non-cycling rules', () => {
    // R1 asserts p, R2 checks p but has no boolean effect — no cycle
    const rules = [
      rule('R1', ['knows'], [booleanEffect('p')]),
      rule('R2', ['p'],    [numericEffect('score')]),
    ];
    assert.strictEqual(detector.detect(rules), null);
  });

  it('does not flag a NAF-guarded self-reference as a cycle', () => {
    // `not hostile => hostile` is self-limiting: once hostile is asserted, the
    // guard fails and the rule cannot fire again. Not a real cycle.
    const negPred = new NegationPredicate(new FactPredicate('hostile', X, Y));
    const r1 = new Rule('R1', [{ predicate: negPred, importance: 1.0 }], [booleanEffect('hostile')]);
    assert.strictEqual(detector.detect([r1]), null);
  });

  it('does not flag a self-retracting rule as a cycle', () => {
    // `p => retract p` is self-limiting: once p is retracted, the premise fails.
    const retractEffect = new StateOperation('retract', 'p', [X, Y]);
    const r1 = new Rule('R1', [{ predicate: new FactPredicate('p', X, Y), importance: 1.0 }], [retractEffect]);
    assert.strictEqual(detector.detect([r1]), null);
  });

  it('does not flag a two-rule retract chain as a cycle', () => {
    // R1 asserts b; R2 reads b and retracts it. R2 retracting b cannot re-enable R1
    // (it removes b, which R1 does not read). Not a cycle.
    const retractB = new StateOperation('retract', 'b', [X, Y]);
    const rules = [
      rule('R1', ['a'], [booleanEffect('b')]),
      new Rule('R2', [{ predicate: new FactPredicate('b', X, Y), importance: 1.0 }], [retractB]),
    ];
    assert.strictEqual(detector.detect(rules), null);
  });
});
