import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../src/Engine.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proof');

// Drives the fixture rules to fixpoint via World.apply (the converging path),
// then exercises engine.explain — the recursive proof tree behind a fact.
describe('Proof trees (engine.explain)', () => {
  let engine;

  beforeEach(() => {
    engine = new Engine({
      predicates:  join(fixture, 'predicates.json'),
      entities:    join(fixture, 'entities.json'),
      state:       join(fixture, 'state'),
      definitions: join(fixture, 'definitions'),
      rulesets:    { main: join(fixture, 'rules') },
    });
    engine.world.apply(engine.rulesets.get('main'));
  });

  it('a given fact is a leaf with via "given"', () => {
    const node = engine.explain('mentored(alice, bob)');
    assert.equal(node.via, 'given');
    assert.deepEqual(node.support, []);
  });

  it('a rule-concluded fact links to the rule and its premises', () => {
    const node = engine.explain('ally(alice, bob)');
    assert.equal(node.via, 'rule');
    assert.equal(node.detail, 'allies through mutual respect, absent rivalry');
    // two respected premises + one negation premise
    assert.equal(node.support.length, 3);
  });

  it('recurses through premises to the given leaves', () => {
    const node = engine.explain('ally(alice, bob)');
    const respected = node.support.find(c => c.statement.startsWith('respected('));
    assert.equal(respected.via, 'rule');
    assert.equal(respected.support[0].statement.startsWith('mentored('), true);
    assert.equal(respected.support[0].via, 'given');
  });

  it('represents a negation-as-failure premise as an absence', () => {
    const node = engine.explain('ally(alice, bob)');
    const absent = node.support.find(c => c.via === 'absent');
    assert.ok(absent, 'expected an absence justification');
    assert.equal(absent.present, false);
    assert.match(absent.statement, /not rival/);
  });

  it('recurses through a derived (define) premise', () => {
    const node = engine.explain('helped(alice, bob)');
    assert.equal(node.via, 'rule');
    const canPair = node.support.find(c => c.statement.startsWith('canPair('));
    assert.equal(canPair.via, 'derived');
    assert.equal(canPair.detail, 'can pair — settled allies');
    // the derived premise expands into the ally sub-tree
    assert.ok(canPair.support.some(c => c.statement.startsWith('ally(')));
  });

  it('explains a numeric fact through its contributing events', () => {
    const node = engine.explain('friendship(alice, bob)');
    assert.equal(node.via, 'numeric');
    assert.match(node.statement, /friendship\(alice, bob\) = 25/);
    const event = node.support[0];
    assert.equal(event.via, 'rule');
    assert.equal(event.detail, 'helping warms a friendship');
  });

  it('expands a count|...| premise into the matching facts', () => {
    const node = engine.explain('senior(alice)');
    assert.equal(node.via, 'rule');
    const count = node.support.find(c => c.via === 'aggregate');
    assert.ok(count, 'expected an aggregate justification');
    assert.equal(count.support.length, 2);
    assert.ok(count.support.every(c => c.statement.startsWith('respected(')));
  });

  it('render() produces an indented text tree', () => {
    const text = engine.explain('ally(alice, bob)').render();
    assert.match(text, /ally\(alice, bob\)/);
    assert.match(text, /\[rule: allies through mutual respect/);
    assert.match(text, /✗ not rival\(alice, bob\)/);
    // children are indented beneath the root
    assert.match(text, /\n {2}respected\(/);
  });

  it('a fact appearing in sibling branches is not mislabelled a cycle', () => {
    const text = engine.explain('friendship(alice, bob)').render();
    assert.equal(text.includes('[cycle]'), false);
  });
});
