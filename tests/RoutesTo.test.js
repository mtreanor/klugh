import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ActionParser } from '../src/loader/ActionParser.js';
import { ActionLoader } from '../src/loader/ActionLoader.js';

describe('routes-to — DSL parsing', () => {
  it('parses routes-to on an action without effects', () => {
    const src = `
      action "choose"
        roles: ?SELF: agent
        utility
          1.0
        routes-to: next-stage
    `;
    const { actions } = new ActionParser().parse(src);
    assert.equal(actions[0].routesTo, 'next-stage');
  });

  it('parses routes-to after an effects block', () => {
    const src = `
      action "choose"
        roles: ?SELF: agent
        effects
          likes(?SELF, ?SELF)
        routes-to: social-acts
    `;
    const { actions } = new ActionParser().parse(src);
    assert.equal(actions[0].routesTo, 'social-acts');
  });

  it('leaves routesTo null when absent', () => {
    const src = `
      action "wait"
        roles: ?SELF: agent
        utility
          0.5
    `;
    const { actions } = new ActionParser().parse(src);
    assert.equal(actions[0].routesTo, undefined);
  });

  it('parses multiple actions where only some have routes-to', () => {
    const src = `
      action "engage"
        roles: ?SELF: agent
        utility 1.0
        routes-to: engage-acts

      action "wait"
        roles: ?SELF: agent
        utility 0.5
    `;
    const { actions } = new ActionParser().parse(src);
    assert.equal(actions[0].name, 'engage');
    assert.equal(actions[0].routesTo, 'engage-acts');
    assert.equal(actions[1].name, 'wait');
    assert.equal(actions[1].routesTo, undefined);
  });
});

describe('routes-to — ActionLoader', () => {
  it('sets routesTo on the built Action', () => {
    const parsed = new ActionParser().parse(`
      action "choose"
        roles: ?SELF: agent
        routes-to: next-stage
    `);
    const { actions } = new ActionLoader().load(parsed);
    assert.equal(actions[0].routesTo, 'next-stage');
  });

  it('sets routesTo to null when absent', () => {
    const parsed = new ActionParser().parse(`
      action "wait"
        roles: ?SELF: agent
        utility 0.5
    `);
    const { actions } = new ActionLoader().load(parsed);
    assert.equal(actions[0].routesTo, null);
  });
});
