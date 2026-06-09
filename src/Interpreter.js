import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { World } from './World.js';
import { Binding } from './Binding.js';
import { LogicalVariable } from './LogicalVariable.js';
import { PredicateSchema } from './PredicateSchema.js';
import { RuleParser } from './loader/RuleParser.js';
import { RuleLoader } from './loader/RuleLoader.js';
import { DerivationRuleLoader } from './loader/DerivationRuleLoader.js';
import { StateLoader } from './loader/StateLoader.js';
import { EntityLoader } from './loader/EntityLoader.js';
import { Rule } from './Rule.js';
import { RuleEvaluator } from './RuleEvaluator.js';
import { bindingSatisfiesDistinctArguments } from './DistinctArguments.js';
import { NumericStateQueryHandler } from './queryHandlers/NumericStateQueryHandler.js';

export class Interpreter {
  // Accepts either a scenario directory path (string) or an explicit config
  // object: { predicates, entities, state } — absolute or relative file paths.
  constructor(dataDirOrConfig) {
    const paths = typeof dataDirOrConfig === 'string'
      ? {
          predicates: join(dataDirOrConfig, 'predicates.json'),
          entities:   join(dataDirOrConfig, 'entities.json'),
          state:      join(dataDirOrConfig, 'state'),
          definitions: join(dataDirOrConfig, 'definitions'),
        }
      : dataDirOrConfig;

    this.schema = new PredicateSchema(
      JSON.parse(readFileSync(paths.predicates, 'utf-8'))
    );

    const entitiesData = JSON.parse(readFileSync(paths.entities, 'utf-8'));

    this.world = new World(this.schema);
    this.world.queryHandlers.register(
      'numeric',
      new NumericStateQueryHandler(this.world.factStore, this.schema)
    );

    const entityNames = new EntityLoader().load(entitiesData, this.world, this.schema);

    this.ruleParser = new RuleParser(this.schema, { entityNames });
    this.ruleLoader = new RuleLoader(this.schema);
    this.ruleEvaluator = new RuleEvaluator();

    const stateData = this.ruleParser.parseState(readFileSync(paths.state, 'utf-8'));
    new StateLoader(this.schema).load(stateData, this.world);

    if (paths.definitions && existsSync(paths.definitions)) {
      this.loadDefinitions(readFileSync(paths.definitions, 'utf-8'));
    }
  }

  loadDefinitions(source) {
    const definitionData  = this.ruleParser.parseDefinitions(source);
    const { definitions } = new DerivationRuleLoader(this.schema).load(definitionData);
    this.world.queryHandlers.getHandler('derived').registerRules(definitions);
  }

  // Parses a predicate conjunction (predicates joined by ^) and returns all
  // satisfying bindings. partialBinding is a plain object mapping variable names
  // (without '?') to entity name strings or concrete values — those variables
  // are held fixed while the rest are enumerated.
  //
  // scopedTo: entity name string — if provided, the query is evaluated from
  // that entity's private-store perspective (their activeStore is set).
  //
  // Returns Binding[]. A ground query (no variables) returns [emptyBinding] when
  // true, [] when false.
  query(text, partialBinding = {}, { scopedTo = null } = {}) {
    const predAsts = this.ruleParser.parsePredicateConjunction(text, {
      entityNames: this.world.entityNames,
    });
    const predicates = predAsts.map(ast => {
      const node = 'importance' in ast ? ast.predicate : ast;
      return this.ruleLoader.buildPredicate(node);
    });

    const startingBinding = this.resolveBinding(partialBinding);
    const boundNames = new Set(startingBinding.assignments.keys());

    const seen = new Set(boundNames);
    const freeVars = [];
    for (const v of predicates.flatMap(p => p.getVariables())) {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        freeVars.push(v);
      }
    }

    const variableTypes = this.inferVariableTypes(predicates);
    const candidates = this.ruleEvaluator.generateAllBindings(
      freeVars, variableTypes, this.world.entityRegistry, startingBinding
    );

    const entityRegistry = this.world.entityRegistry;
    let evaluationContext = this.world.createEvaluationContext();
    if (scopedTo !== null) {
      const store = this.world.getPrivateStore(scopedTo);
      if (!store) throw new Error(`"${scopedTo}" has no private store`);
      evaluationContext = evaluationContext.scopedToStore(store);
    }

    return candidates.filter(binding =>
      bindingSatisfiesDistinctArguments(binding, predicates, this.schema, entityRegistry) &&
      predicates.every(p => p.evaluate(binding, evaluationContext))
    );
  }

  // Like query(), but scores every candidate binding by weighted predicate satisfaction
  // instead of requiring all predicates to hold. Predicate entries may carry
  // [importance: N] modifiers (same syntax as rules).
  //
  // Returns RuleApplication[] sorted by truthDegree descending.
  evaluateDegrees(text, partialBinding = {}, { minimumTruthDegree = 0 } = {}) {
    const predAsts = this.ruleParser.parsePredicateConjunction(text, {
      entityNames: this.world.entityNames,
    });
    const entries = predAsts.map(ast => this.ruleLoader.buildPredicateEntry(ast));
    const rule = new Rule('__query__', entries, []);

    const startingBinding = this.resolveBinding(partialBinding);
    const boundNames = new Set(startingBinding.assignments.keys());
    const freeVars = rule.collectVariables().filter(v => !boundNames.has(v.name));
    const variableTypes = this.ruleEvaluator.inferVariableTypes(rule, this.schema);

    const candidates = this.ruleEvaluator.generateAllBindings(
      freeVars, variableTypes, this.world.entityRegistry, startingBinding
    );

    const entityRegistry = this.world.entityRegistry;
    const predicatesForDistinct = rule.predicateEntries.map(e => e.predicate);

    return candidates
      .filter(binding => bindingSatisfiesDistinctArguments(
        binding, predicatesForDistinct, this.schema, entityRegistry
      ))
      .map(binding => this.ruleEvaluator.applyRule(rule, binding, this.world.createEvaluationContext()))
      .filter(app => app.truthDegree >= minimumTruthDegree)
      .sort((a, b) => b.truthDegree - a.truthDegree);
  }

  assert(text) {
    const op = this.ruleParser.parseSingleStateOperation(text);
    new StateLoader(this.schema).applyEntry(op, this.world.factStore, new Binding(), this.world);
  }

  resolveBinding(partialBinding) {
    let binding = new Binding();
    for (const [name, value] of Object.entries(partialBinding)) {
      const resolved = typeof value === 'string'
        ? (this.findEntityByName(value) ?? value)
        : value;
      binding = binding.extend(new LogicalVariable(name), resolved);
    }
    return binding;
  }

  findEntityByName(name) {
    for (const entities of this.world.entityRegistry.values()) {
      const match = entities.find(entity => entity?.name === name);
      if (match) return match;
    }
    return null;
  }

  inferVariableTypes(predicates) {
    const rule = new Rule('__infer__', predicates.map(p => ({ predicate: p, importance: 1.0 })), []);
    return this.ruleEvaluator.inferVariableTypes(rule, this.schema);
  }
}
