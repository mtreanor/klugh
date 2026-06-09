import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleSerializer } from '../../src/loader/RuleSerializer.js';
import { RuleParser } from '../../src/loader/RuleParser.js';

const serializer = new RuleSerializer();
const parser     = new RuleParser();

function rule(name, predicates, effects) {
  return { name, predicates, effects };
}

function pred(type, name, args) {
  return { type, name, args };
}

describe('RuleSerializer', () => {
  describe('predicates', () => {
    it('serializes a fact predicate as a plain call', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [pred('fact', 'knows', ['?SELF', '?Y'])], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y)'));
    });

    it('serializes a derived predicate as a plain call (same surface as fact)', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [pred('derived', 'canHaveNeedMet', ['?SELF', '?Y'])], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('canHaveNeedMet(?SELF, ?Y)'));
    });

    it('serializes a historical predicate with [history]', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [pred('historical', 'hadConflict', ['?SELF', '?Y'])], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('hadConflict(?SELF, ?Y) [history]'));
    });

    it('serializes a negation (NAF) as "not pred"', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'negation', predicate: pred('fact', 'hasNeed', ['?SELF', null]) }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('not hasNeed(?SELF, _)'));
    });

    it('serializes a weak-negation as "~pred"', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'weak-negation', predicate: pred('fact', 'hasNeed', ['?SELF', null]) }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('~hasNeed(?SELF, _)'));
    });

    it('serializes an explicit-negation as "-pred"', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'explicit-negation', predicate: pred('fact', 'hasNeed', ['?SELF', null]) }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('-hasNeed(?SELF, _)'));
    });

    it('serializes a numeric-tier predicate with dot notation', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'numeric-tier', name: 'friendship', tier: 'strong', args: ['?SELF', '?Y'] }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('friendship.strong(?SELF, ?Y)'));
    });

    it('serializes a null arg as _', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [pred('fact', 'hasNeed', ['?SELF', null])], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('hasNeed(?SELF, _)'));
    });

    it('serializes an importance-wrapped predicate with brackets', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ predicate: pred('fact', 'knows', ['?SELF', '?Y']), importance: 2.0 }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y) [importance: 2]'));
    });

    it('serializes multiple predicates with ^ between them', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [
          pred('fact', 'knows', ['?SELF', '?Y']),
          pred('fact', 'canHaveNeedMet', ['?SELF', '?Y']),
        ], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('  ^ canHaveNeedMet(?SELF, ?Y)'));
    });
  });

  describe('history and temporal predicates', () => {
    it('serializes a historical-window predicate without a window as [history]', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'historical-window', name: 'knows', args: ['?SELF', '?Y'] }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y) [history]'));
    });

    it('serializes a historical-window predicate with a window as [history: N]', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{ type: 'historical-window', name: 'knows', args: ['?SELF', '?Y'], window: 5 }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y) [history: 5]'));
    });

    it('serializes a two-step temporal chain with then', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{
          type: 'temporal-chain',
          steps: [
            { name: 'knows',       args: ['?SELF', '?Y'] },
            { name: 'hadConflict', args: ['?SELF', '?Y'] },
          ],
        }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y) then hadConflict(?SELF, ?Y)'));
    });

    it('serializes then[N] for a chain step with a within constraint', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{
          type: 'temporal-chain',
          steps: [
            { name: 'knows',       args: ['?SELF', '?Y'] },
            { name: 'hadConflict', args: ['?SELF', '?Y'], within: 5 },
          ],
        }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('knows(?SELF, ?Y) then[5] hadConflict(?SELF, ?Y)'));
    });
  });

  describe('rule effects', () => {
    it('serializes a tag contribution with =>', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [pred('fact', 'knows', ['?SELF', '?Y'])], [{ type: 'adjust-numeric', name: 'exploitative', args: ['?SELF', '?Y'], delta: 3.0 }])],
      });

      assert.ok(dsl.includes('=> exploitative(?SELF, ?Y) += 3'));
    });
  });

  describe('round-trip', () => {
    it('parse -> serialize -> parse yields the same structure', () => {
      const original = `
rule "R1"
  knows(?SELF, ?Y)
  ^ hadConflict(?SELF, ?Y) [history]
  => cautious(?SELF, ?Y) += 2.0`.trim();

      const json1 = parser.parse(original);
      const dsl   = serializer.serialize(json1);
      const json2 = parser.parse(dsl);

      assert.deepEqual(json1, json2);
    });

    it('serializes a numeric-value predicate as name(args) op threshold', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{
          type:      'numeric-value',
          name:      'friendship',
          args:      ['?SELF', '?Y'],
          operator:  '<',
          threshold: -3,
        }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('friendship(?SELF, ?Y) < -3'));
    });

    it('serializes a count predicate with |...| notation', () => {
      const dsl = serializer.serialize({
        rules: [rule('R1', [{
          type:      'count',
          predicate: { type: 'numeric-tier', name: 'friendship', tier: 'strong', args: ['?SELF', null] },
          operator:  '>',
          threshold: 4,
        }], [{ type: 'adjust-numeric', name: 'test', args: [], delta: 1.0 }])],
      });

      assert.ok(dsl.includes('|friendship.strong(?SELF, _)| > 4'));
    });

    it('serializes then parses hyphenated tag names correctly', () => {
      const json1 = {
        rules: [rule('R1', [pred('fact', 'knows', ['?SELF', '?Y'])], [{ type: 'adjust-numeric', name: 'self-serving', args: ['?SELF', '?Y'], delta: 2.0 }])],
      };

      const dsl   = serializer.serialize(json1);
      const json2 = parser.parse(dsl);

      assert.equal(json2.rules[0].effects[0].name, 'self-serving');
    });
  });
});
