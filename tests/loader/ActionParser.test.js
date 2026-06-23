import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ActionParser } from '../../src/loader/ActionParser.js';

const parser = new ActionParser();

describe('ActionParser', () => {
  describe('minimal action', () => {
    it('parses name and a single effect', () => {
      const { actions } = parser.parse(`
        action "greet"
          effects
            knows(?SELF, ?Y)
      `);
      assert.equal(actions.length, 1);
      assert.equal(actions[0].name, 'greet');
      const e = actions[0].effects[0];
      assert.equal(e.type, 'assert');
      assert.equal(e.name, 'knows');
      assert.deepEqual(e.args, ['?SELF', '?Y']);
    });

    it('parses a numeric adjust effect', () => {
      const { actions } = parser.parse(`
        action "reward"
          effects
            friendship(?SELF, ?Y) += 5
      `);
      const effect = actions[0].effects[0];
      assert.equal(effect.type, 'adjust-numeric');
      assert.equal(effect.name, 'friendship');
      assert.equal(effect.delta, 5);
    });

    it('parses a numeric set effect', () => {
      const { actions } = parser.parse(`
        action "reset"
          effects
            friendship(?SELF, ?Y) = 0
      `);
      const effect = actions[0].effects[0];
      assert.equal(effect.type, 'set-numeric');
      assert.equal(effect.value, 0);
    });

    it('parses multiple effects', () => {
      const { actions } = parser.parse(`
        action "bond"
          effects
            knows(?SELF, ?Y)
            friendship(?SELF, ?Y) += 10
      `);
      assert.equal(actions[0].effects.length, 2);
    });
  });

  describe('roles', () => {
    it('parses a single role', () => {
      const { actions } = parser.parse(`
        action "solo"
          roles: ?SELF
          effects
            rested(?SELF)
      `);
      assert.deepEqual(actions[0].roles, ['?SELF']);
    });

    it('parses multiple roles', () => {
      const { actions } = parser.parse(`
        action "cooperate"
          roles: ?SELF, ?Y
          effects
            knows(?SELF, ?Y)
      `);
      assert.deepEqual(actions[0].roles, ['?SELF', '?Y']);
    });

    it('omits the roles key when not present', () => {
      const { actions } = parser.parse(`
        action "anon"
          effects
            flagged(?X)
      `);
      assert.equal(actions[0].roles, undefined);
    });
  });

  describe('preconditions', () => {
    it('parses a single precondition', () => {
      const { actions } = parser.parse(`
        action "approach"
          preconditions
            knows(?SELF, ?Y)
          effects
            toward(?SELF, ?Y) += 1
      `);
      assert.equal(actions[0].preconditions.length, 1);
      assert.deepEqual(actions[0].preconditions[0], { type: 'fact', name: 'knows', args: ['?SELF', '?Y'] });
    });

    it('parses ^ conjunction in preconditions', () => {
      const { actions } = parser.parse(`
        action "approach"
          preconditions
            knows(?SELF, ?Y)
            ^ not hostile(?SELF, ?Y)
          effects
            toward(?SELF, ?Y) += 1
      `);
      assert.equal(actions[0].preconditions.length, 2);
      assert.equal(actions[0].preconditions[1].type, 'negation');
      assert.equal(actions[0].preconditions[1].predicate.name, 'hostile');
    });

    it('omits the preconditions key when not present', () => {
      const { actions } = parser.parse(`
        action "anon"
          effects
            flagged(?X)
      `);
      assert.equal(actions[0].preconditions, undefined);
    });
  });

  describe('utility sources', () => {
    it('parses a constant utility source (bare number)', () => {
      const { actions } = parser.parse(`
        action "rest"
          utility
            3.5
          effects
            rested(?SELF)
      `);
      assert.deepEqual(actions[0].utilitySources[0], { type: 'constant', value: 3.5 });
    });

    it('parses a negative constant', () => {
      const { actions } = parser.parse(`
        action "flee"
          utility
            -2
          effects
            away(?SELF, ?Y) += 1
      `);
      assert.deepEqual(actions[0].utilitySources[0], { type: 'constant', value: -2 });
    });

    it('parses a predicate utility source', () => {
      const { actions } = parser.parse(`
        action "bond"
          utility
            friendship(?SELF, ?Y)
          effects
            knows(?SELF, ?Y)
      `);
      assert.deepEqual(actions[0].utilitySources[0], {
        type: 'predicate',
        name: 'friendship',
        args: ['?SELF', '?Y'],
      });
    });

    it('parses a private predicate utility source with a variable owner', () => {
      const { actions } = parser.parse(`
        action "bond"
          utility
            ?SELF.rapport(?SELF, ?Y)
          effects
            knows(?SELF, ?Y)
      `);
      assert.deepEqual(actions[0].utilitySources[0], {
        type: 'predicate',
        owner: '?SELF',
        name: 'rapport',
        args: ['?SELF', '?Y'],
      });
    });

    it('parses a private predicate utility source with a literal entity owner', () => {
      const { actions } = parser.parse(`
        action "bond"
          utility
            alice.rapport(alice, bob)
          effects
            knows(alice, bob)
      `);
      assert.deepEqual(actions[0].utilitySources[0], {
        type: 'predicate',
        owner: 'alice',
        name: 'rapport',
        args: ['alice', 'bob'],
      });
    });

    it('parses a private predicate utility source inside an aggregate', () => {
      const { actions } = parser.parse(`
        action "combine"
          utility
            sum
              ?SELF.rapport(?SELF, ?Y)
              2
          effects
            knows(?SELF, ?Y)
      `);
      const src = actions[0].utilitySources[0];
      assert.equal(src.type, 'aggregate');
      assert.equal(src.sources[0].type, 'predicate');
      assert.equal(src.sources[0].owner, '?SELF');
      assert.equal(src.sources[0].name, 'rapport');
    });

    it('parses an aggregate utility source (aggregator keyword then sources)', () => {
      const { actions } = parser.parse(`
        action "combine"
          utility
            sum
              friendship(?SELF, ?Y)
              2
          effects
            knows(?SELF, ?Y)
      `);
      const src = actions[0].utilitySources[0];
      assert.equal(src.type, 'aggregate');
      assert.equal(src.aggregator, 'sum');
      assert.equal(src.sources.length, 2);
      assert.equal(src.sources[0].type, 'predicate');
      assert.equal(src.sources[1].type, 'constant');
    });

    it('parses each aggregator keyword (avg, min, max)', () => {
      for (const agg of ['avg', 'min', 'max']) {
        const { actions } = parser.parse(`
          action "x"
            utility
              ${agg}
                2
                3
            effects
              flagged(?X)
        `);
        assert.equal(actions[0].utilitySources[0].aggregator, agg);
      }
    });

    it('parses a rule utility source', () => {
      const { actions } = parser.parse(`
        action "bond"
          utility
            rule "knows bonus"
              knows(?SELF, ?Y)
              => 4
          effects
            knows(?SELF, ?Y)
      `);
      const src = actions[0].utilitySources[0];
      assert.equal(src.type, 'rule');
      assert.equal(src.name, 'knows bonus');
      assert.equal(src.weight, 4);
      assert.equal(src.predicates.length, 1);
      assert.equal(src.predicates[0].name, 'knows');
    });

    it('parses a rule utility source with a conjunction', () => {
      const { actions } = parser.parse(`
        action "bond"
          utility
            rule "acquainted bonus"
              knows(?SELF, ?Y)
              ^ not hostile(?SELF, ?Y)
              => 2
          effects
            knows(?SELF, ?Y)
      `);
      const src = actions[0].utilitySources[0];
      assert.equal(src.predicates.length, 2);
    });

    it('parses multiple utility sources', () => {
      const { actions } = parser.parse(`
        action "multi"
          utility
            2
            friendship(?SELF, ?Y)
          effects
            knows(?SELF, ?Y)
      `);
      assert.equal(actions[0].utilitySources.length, 2);
    });

    it('omits the utilitySources key when not present', () => {
      const { actions } = parser.parse(`
        action "anon"
          effects
            flagged(?X)
      `);
      assert.equal(actions[0].utilitySources, undefined);
    });

    describe('product (*)', () => {
      it('parses predicate * constant', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              prestige(?X) * 0.5
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type, 'product');
        assert.deepEqual(src.left,  { type: 'predicate', name: 'prestige', args: ['?X'] });
        assert.deepEqual(src.right, { type: 'constant',  value: 0.5 });
      });

      it('parses constant * predicate (either side)', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              0.5 * prestige(?X)
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type, 'product');
        assert.deepEqual(src.left,  { type: 'constant',  value: 0.5 });
        assert.deepEqual(src.right, { type: 'predicate', name: 'prestige', args: ['?X'] });
      });

      it('parses predicate * predicate', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              prestige(?X) * wealth(?X)
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type, 'product');
        assert.equal(src.left.name,  'prestige');
        assert.equal(src.right.name, 'wealth');
      });

      it('chains left-associatively: a * b * c', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              prestige(?X) * 0.5 * 2
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type, 'product');
        assert.equal(src.left.type,  'product');
        assert.equal(src.right.value, 2);
      });

      it('parses predicate-aggregate * constant', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              avg|prestige(?X) ^ knows(?X, ?Y)| * 0.5
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type,        'product');
        assert.equal(src.left.type,   'predicate-aggregate');
        assert.equal(src.left.fn,     'avg');
        assert.equal(src.right.value, 0.5);
      });

      it('parses constant * predicate-aggregate', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              0.5 * avg|prestige(?X) ^ knows(?X, ?Y)|
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type,         'product');
        assert.equal(src.left.value,   0.5);
        assert.equal(src.right.type,   'predicate-aggregate');
        assert.equal(src.right.fn,     'avg');
      });

      it('parses sum-aggregate * constant', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              sum
                prestige(?X)
                1
              * 0.5
            effects
              flagged(?X)
        `);
        const src = actions[0].utilitySources[0];
        assert.equal(src.type,            'product');
        assert.equal(src.left.type,       'aggregate');
        assert.equal(src.left.aggregator, 'sum');
        assert.equal(src.right.value,     0.5);
      });

      it('product sources do not interfere with adjacent sources', () => {
        const { actions } = parser.parse(`
          action "x"
            utility
              prestige(?X) * 0.5
              wealth(?X)
            effects
              flagged(?X)
        `);
        assert.equal(actions[0].utilitySources.length, 2);
        assert.equal(actions[0].utilitySources[0].type, 'product');
        assert.equal(actions[0].utilitySources[1].type, 'predicate');
      });
    });
  });

  describe('content', () => {
    it('parses a text content block', () => {
      const { actions } = parser.parse(`
        action "greet"
          content text: "Hello, ?Y!"
          effects
            knows(?SELF, ?Y)
      `);
      assert.deepEqual(actions[0].content, { type: 'text', template: 'Hello, ?Y!' });
    });

    it('omits the content key when not present', () => {
      const { actions } = parser.parse(`
        action "anon"
          effects
            flagged(?X)
      `);
      assert.equal(actions[0].content, undefined);
    });
  });

  describe('multiple actions', () => {
    it('parses multiple action blocks', () => {
      const { actions } = parser.parse(`
        action "A"
          effects
            flagged(?X)

        action "B"
          effects
            flagged(?Y)
      `);
      assert.equal(actions.length, 2);
      assert.equal(actions[0].name, 'A');
      assert.equal(actions[1].name, 'B');
    });
  });

  describe('effects', () => {
    it('parses an action with no effects block', () => {
      const { actions } = parser.parse(`action "observe"`);
      assert.deepEqual(actions[0].effects, []);
    });
  });

  describe('errors', () => {
    it('throws on an unexpected top-level token', () => {
      assert.throws(
        () => parser.parse(`rule "R" knows(?X) => knows(?X)`),
        /Expected 'action'/
      );
    });
  });
});
