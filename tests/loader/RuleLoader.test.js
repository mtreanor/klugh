import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleLoader } from '../../src/loader/RuleLoader.js';
import { PredicateSchema } from '../../src/PredicateSchema.js';
import { Rule } from '../../src/Rule.js';
import { StateOperation } from '../../src/stateOperations/StateOperation.js';
import { LogicalVariable } from '../../src/LogicalVariable.js';
import { FactPredicate } from '../../src/predicates/FactPredicate.js';
import { HistoricalWindowPredicate } from '../../src/predicates/HistoricalWindowPredicate.js';
import { DerivedFactPredicate } from '../../src/predicates/DerivedFactPredicate.js';
import { NegationPredicate } from '../../src/predicates/NegationPredicate.js';
import { CountPredicate } from '../../src/predicates/CountPredicate.js';
import { NumericComparisonPredicate } from '../../src/predicates/NumericComparisonPredicate.js';

const loader = new RuleLoader();

describe('RuleLoader', () => {
  describe('rules', () => {
    it('builds a Rule with a StateOperation', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'exploitative', args: ['?SELF', '?Y'], delta: 3.0 }],
        }],
      });

      assert.equal(rules.length, 1);
      assert.ok(rules[0] instanceof Rule);
      assert.equal(rules[0].name, 'R1');
      assert.equal(rules[0].effects.length, 1);
      assert.ok(rules[0].effects[0] instanceof StateOperation);
      assert.equal(rules[0].effects[0].type, 'adjust-numeric');
      assert.equal(rules[0].effects[0].name, 'exploitative');
      assert.equal(rules[0].effects[0].delta, 3.0);
    });

    it('throws on an unknown rule effect type', () => {
      assert.throws(() => loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'unknown' }],
        }],
      }), /Unknown state operation type/);
    });

    it('builds a FactPredicate from type "fact"', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof FactPredicate);
      assert.equal(predicate.name, 'knows');
    });

    it('builds a HistoricalWindowPredicate from type "historical" (backward-compat alias)', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'historical', name: 'hadConflict', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof HistoricalWindowPredicate);
    });

    it('builds a DerivedFactPredicate from type "derived"', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'derived', name: 'canHaveNeedMet', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof DerivedFactPredicate);
    });

    it('builds a NegationPredicate from type "negation"', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{
            type: 'negation',
            predicate: { type: 'fact', name: 'hasNeed', args: ['?SELF', null] },
          }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof NegationPredicate);
      assert.ok(predicate.predicate instanceof FactPredicate);
    });

    it('resolves ?-prefixed strings as LogicalVariables', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate.args[0] instanceof LogicalVariable);
      assert.equal(predicate.args[0].name, 'SELF');
      assert.ok(predicate.args[1] instanceof LogicalVariable);
      assert.equal(predicate.args[1].name, 'Y');
    });

    it('preserves null as a wildcard arg', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'hasNeed', args: ['?SELF', null] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.equal(predicate.args[1], null);
    });

    it('preserves concrete string args unchanged', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['alice', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.equal(predicate.args[0], 'alice');
    });

    it('honours explicit importance on a weighted predicate entry', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{
            predicate: { type: 'fact', name: 'knows', args: ['?SELF', '?Y'] },
            importance: 3.0,
          }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      assert.equal(rules[0].predicateEntries[0].importance, 3.0);
    });

    it('defaults importance to 1.0 for plain predicate entries', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      assert.equal(rules[0].predicateEntries[0].importance, 1.0);
    });

    it('throws on an unknown predicate type', () => {
      assert.throws(() => loader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'unknown', name: 'foo', args: [] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }), /Unknown predicate type/);
    });
  });

  describe('schema validation', () => {
    const schema = new PredicateSchema({
      predicates: {
        knows:     { type: 'boolean',  args: ['agent', 'agent'] },
        exploited: { type: 'historical', args: ['agent', 'agent'] },
        friendship: {
          type: 'numeric', minValue: 0, maxValue: 100, default: 50,
          tiers: { warm: [60, 80], strong: [80, 100] },
        },
      },
    });
    const validatingLoader = new RuleLoader(schema);

    it('accepts a known predicate name', () => {
      assert.doesNotThrow(() => validatingLoader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'knows', args: ['?SELF', '?Y'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }));
    });

    it('throws on an unknown predicate name', () => {
      assert.throws(() => validatingLoader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'flibbertigibbet', args: ['?SELF'] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }), /Unknown predicate/);
    });

    it('validates the inner predicate of a negation', () => {
      assert.throws(() => validatingLoader.load({
        rules: [{
          name: 'R1',
          predicates: [{
            type: 'negation',
            predicate: { type: 'fact', name: 'unknown', args: ['?SELF'] },
          }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }), /Unknown predicate/);
    });

    it('throws on an unknown tier name for a numeric predicate', () => {
      assert.throws(() => validatingLoader.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'numeric-tier', name: 'friendship', args: ['?SELF', '?Y'], tier: 'legendary' }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }), /Unknown tier/);
    });

    it('builds a NumericComparisonPredicate from type "numeric-value"', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{
            type:      'numeric-value',
            name:      'friendship',
            args:      ['?SELF', '?Y'],
            operator:  '<',
            threshold: -3,
          }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof NumericComparisonPredicate);
      assert.equal(predicate.name, 'friendship');
      assert.equal(predicate.operator, '<');
      assert.equal(predicate.threshold, -3);
    });

    it('builds a CountPredicate from type "count" with counting vars replacing nulls', () => {
      const { rules } = loader.load({
        rules: [{
          name: 'R1',
          predicates: [{
            type:      'count',
            predicate: { type: 'fact', name: 'knows', args: ['?SELF', null] },
            operator:  '>',
            threshold: 3,
          }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      });

      const { predicate } = rules[0].predicateEntries[0];
      assert.ok(predicate instanceof CountPredicate);
      assert.equal(predicate.operator, '>');
      assert.equal(predicate.threshold, 3);
      assert.equal(predicate.countingVars.length, 1);
      assert.equal(predicate.getVariables().length, 1);
      assert.equal(predicate.getVariables()[0].name, 'SELF');
    });

    it('skips validation when no schema is provided', () => {
      const unvalidated = new RuleLoader();
      assert.doesNotThrow(() => unvalidated.load({
        rules: [{
          name: 'R1',
          predicates: [{ type: 'fact', name: 'anyNameAtAll', args: [] }],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?SELF', '?Y'], delta: 1.0 }],
        }],
      }));
    });
  });

  describe('owner binding warnings', () => {
    function captureWarnings(fn) {
      const warnings = [];
      const orig = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      try { fn(); } finally { console.warn = orig; }
      return warnings;
    }

    it('warns when a private-store owner variable appears nowhere in the predicate args', () => {
      // ?Z is the owner but only appears as a prefix — never in (?X, ?Y) args
      const warnings = captureWarnings(() => loader.load({
        rules: [{
          name: 'check-belief',
          predicates: [
            { type: 'fact', name: 'knows', args: ['?X', '?Y'] },
            { type: 'private', ownerVar: '?Z', predicate: { type: 'fact', name: 'knows', args: ['?X', '?Y'] } },
          ],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?X', '?Y'], delta: 1.0 }],
        }],
      }));
      assert.ok(warnings.length > 0);
      assert.ok(warnings[0].includes('?Z'));
      assert.ok(warnings[0].includes('never be bound'));
    });

    it('does not warn when the owner variable appears in the inner predicate args', () => {
      // ?Z appears in both the owner position and the inner predicate args
      const warnings = captureWarnings(() => loader.load({
        rules: [{
          name: 'check-belief',
          predicates: [
            { type: 'private', ownerVar: '?Z', predicate: { type: 'fact', name: 'knows', args: ['?Z', '?Y'] } },
          ],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?Z', '?Y'], delta: 1.0 }],
        }],
      }));
      assert.strictEqual(warnings.length, 0);
    });

    it('does not warn when the owner variable is bound by an earlier positive predicate', () => {
      const warnings = captureWarnings(() => loader.load({
        rules: [{
          name: 'check-belief',
          predicates: [
            { type: 'fact', name: 'knows', args: ['?Z', '?X'] },
            { type: 'private', ownerVar: '?Z', predicate: { type: 'fact', name: 'knows', args: ['?X', '?Y'] } },
          ],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?X', '?Y'], delta: 1.0 }],
        }],
      }));
      assert.strictEqual(warnings.length, 0);
    });

    it('does not warn when a ground entity name is used as the owner', () => {
      const warnings = captureWarnings(() => loader.load({
        rules: [{
          name: 'check-belief',
          predicates: [
            { type: 'private', ownerEntity: 'alice', predicate: { type: 'fact', name: 'knows', args: ['?X', '?Y'] } },
          ],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?X', '?Y'], delta: 1.0 }],
        }],
      }));
      assert.strictEqual(warnings.length, 0);
    });

    it('warns when the unbound owner is inside a negation wrapper', () => {
      const warnings = captureWarnings(() => loader.load({
        rules: [{
          name: 'negated-private',
          predicates: [
            { type: 'fact', name: 'knows', args: ['?X', '?Y'] },
            { type: 'negation', predicate: { type: 'private', ownerVar: '?Z', predicate: { type: 'fact', name: 'knows', args: ['?X', '?Y'] } } },
          ],
          effects: [{ type: 'adjust-numeric', name: 'friendship', args: ['?X', '?Y'], delta: 1.0 }],
        }],
      }));
      assert.ok(warnings.length > 0);
      assert.ok(warnings[0].includes('?Z'));
    });
  });
});
