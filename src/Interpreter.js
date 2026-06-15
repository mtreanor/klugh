import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { World } from './World.js';
import { Binding } from './Binding.js';
import { LogicalVariable } from './LogicalVariable.js';
import { PredicateSchema } from './PredicateSchema.js';
import { RuleParser } from './loader/RuleParser.js';
import { RuleLoader } from './loader/RuleLoader.js';
import { ActionParser } from './loader/ActionParser.js';
import { ActionLoader } from './loader/ActionLoader.js';
import { DerivationRuleLoader } from './loader/DerivationRuleLoader.js';
import { StateLoader } from './loader/StateLoader.js';
import { EntityLoader } from './loader/EntityLoader.js';
import { Rule } from './Rule.js';
import { RuleEvaluator } from './RuleEvaluator.js';
import { ForwardChainer } from './ForwardChainer.js';
import { bindingSatisfiesDistinctArguments } from './DistinctArguments.js';
import { applyStateChange } from './stateOperations/applyStateChange.js';
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

    this.rulesets   = new Map();
    this.actionsets = new Map();

    for (const [name, path] of Object.entries(paths.rulesets ?? {})) {
      const { rules } = this.ruleLoader.load(this.ruleParser.parse(readFileSync(path, 'utf-8')));
      this.rulesets.set(name, rules);
    }

    for (const [name, path] of Object.entries(paths.actionsets ?? {})) {
      const { actions } = new ActionLoader(this.schema).load(new ActionParser().parse(readFileSync(path, 'utf-8')));
      this.actionsets.set(name, actions);
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
      bindingSatisfiesDistinctArguments(binding, predicates, this.schema, entityRegistry, this.world.entityTypeConfig) &&
      predicates.every(p => p.evaluate(binding, evaluationContext))
    );
  }

  // Like query(), but scores every candidate binding by weighted predicate satisfaction
  // instead of requiring all predicates to hold. Predicate entries may carry
  // [importance: N] modifiers (same syntax as rules).
  //
  // Returns RuleApplication[] sorted by satisfactionScore descending.
  evaluateDegrees(text, partialBinding = {}, { minimumSatisfactionScore = 0 } = {}) {
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
        binding, predicatesForDistinct, this.schema, entityRegistry, this.world.entityTypeConfig
      ))
      .map(binding => this.ruleEvaluator.applyRule(rule, binding, this.world.createEvaluationContext()))
      .filter(app => app.satisfactionScore >= minimumSatisfactionScore)
      .sort((a, b) => b.satisfactionScore - a.satisfactionScore);
  }

  // Runs a named ruleset to fixpoint. Applies all rule applications whose
  // satisfactionScore meets the threshold (default: fully satisfied only).
  // Returns the list of RuleApplications that fired.
  runRuleset(name, { minimumSatisfactionScore = 1.0, startingBinding = {} } = {}) {
    const rules = this.rulesets.get(name);
    if (!rules) throw new Error(`No ruleset named "${name}"`);

    const ctx          = this.world.createEvaluationContext();
    const startBinding = this.resolveBinding(startingBinding);
    const fired        = [];

    new ForwardChainer().run(rules, ctx, startBinding, (app) => {
      if (app.satisfactionScore < minimumSatisfactionScore) return false;
      for (const effect of app.rule.effects) {
        applyStateChange(effect, app.binding, this.world.queryHandlers, {
          privateStores: this.world.privateStores,
        });
      }
      fired.push(app);
      return true;
    });

    return fired;
  }

  // Scores every action in a named actionset against the current world state.
  // partialBinding fixes variables; remaining free variables are enumerated.
  // Returns [{ action, binding, score }, ...] sorted by score descending.
  scoreActionset(name, partialBinding = {}, { minimumScore = -Infinity } = {}) {
    const actions = this.actionsets.get(name);
    if (!actions) throw new Error(`No actionset named "${name}"`);

    const startingBinding = this.resolveBinding(partialBinding);
    const boundNames      = new Set(startingBinding.assignments.keys());
    const ctx             = this.world.createEvaluationContext();
    const candidates      = [];

    for (const action of actions) {
      const freeVars = action.collectVariables().filter(v => !boundNames.has(v.name));

      const allBindings = freeVars.length > 0
        ? this.ruleEvaluator.generateAllBindings(
            freeVars,
            this.inferVariableTypes(action.preconditions.map(e => e.predicate)),
            this.world.entityRegistry,
            startingBinding
          )
        : [startingBinding];

      for (const binding of allBindings) {
        if (!action.arePreconditionsMet(binding, ctx)) continue;
        const score = action.score(binding, this.world.entityRegistry, ctx);
        if (score < minimumScore) continue;
        candidates.push({ action, binding, score });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  advanceTick(amount = 1) {
    this.world.advanceTick(amount);
    const numericHandler = this.world.queryHandlers.getHandler('numeric');
    for (const [name, def] of this.schema.definitions) {
      if (!def.annotations?.ephemeral) continue;
      this.world.factStore.retractAll(name);
      if (numericHandler) numericHandler.clearRecords(name);
      for (const store of this.world.privateStores.values()) {
        store.retractAll(name);
      }
    }
    return this;
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
