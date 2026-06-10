export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos    = 0;
    this.line   = 1;
  }

  tokenize() {
    const tokens = [];

    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch   = this.source[this.pos];
      const next = this.source[this.pos + 1];

      if (ch === '"')                              { tokens.push(this.readString());   continue; }
      if (ch === '?')                              { tokens.push(this.readVariable()); continue; }
      if (ch === '_' && !this.isIdentChar(next))   { tokens.push(this.tok('WILDCARD', '_')); this.pos++; continue; }

      if (ch === '=' && next === '>')              { tokens.push(this.tok('FAT_ARROW', '=>')); this.pos += 2; continue; }
      if (ch === '+' && next === '=')              { tokens.push(this.tok('PLUS_EQ',  '+=')); this.pos += 2; continue; }
      if (ch === '-' && next === '=')              { tokens.push(this.tok('MINUS_EQ', '-=')); this.pos += 2; continue; }
      if (ch === '-' && /\d/.test(next))           { tokens.push(this.readNumber());          continue; }
      if (ch === '-')                              { tokens.push(this.tok('MINUS',    '-')); this.pos++;    continue; }

      if (ch === '@') { tokens.push(this.tok('AT',       '@')); this.pos++; continue; }
      if (ch === '|') { tokens.push(this.tok('PIPE',     '|')); this.pos++; continue; }
      if (ch === '>' && next === '=')              { tokens.push(this.tok('GTE',      '>=')); this.pos += 2; continue; }
      if (ch === '<' && next === '=')              { tokens.push(this.tok('LTE',      '<=')); this.pos += 2; continue; }
      if (ch === '>') { tokens.push(this.tok('GT',       '>')); this.pos++; continue; }
      if (ch === '<') { tokens.push(this.tok('LT',       '<')); this.pos++; continue; }
      if (ch === '^') { tokens.push(this.tok('CARET',    '^')); this.pos++; continue; }
      if (ch === '~') { tokens.push(this.tok('TILDE',    '~')); this.pos++; continue; }
      if (ch === '=') { tokens.push(this.tok('EQ',       '=')); this.pos++; continue; }
      if (ch === '+') { tokens.push(this.tok('PLUS',     '+')); this.pos++; continue; }
      if (ch === ':') { tokens.push(this.tok('COLON',    ':')); this.pos++; continue; }
      if (ch === '.') { tokens.push(this.tok('DOT',      '.')); this.pos++; continue; }
      if (ch === ',') { tokens.push(this.tok('COMMA',    ',')); this.pos++; continue; }
      if (ch === '(') { tokens.push(this.tok('LPAREN',   '(')); this.pos++; continue; }
      if (ch === ')') { tokens.push(this.tok('RPAREN',   ')')); this.pos++; continue; }
      if (ch === '[') { tokens.push(this.tok('LBRACKET', '[')); this.pos++; continue; }
      if (ch === ']') { tokens.push(this.tok('RBRACKET', ']')); this.pos++; continue; }

      if (/\d/.test(ch))                           { tokens.push(this.readNumber());  continue; }
      if (/[a-zA-Z_]/.test(ch))                   { tokens.push(this.readIdent());   continue; }

      throw new Error(`Unexpected character '${ch}' at line ${this.line}`);
    }

    tokens.push(this.tok('EOF', null));
    return tokens;
  }

  tok(type, value) {
    return { type, value, line: this.line };
  }

  skipWhitespace() {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if      (ch === '#')               { while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.pos++; }
      else if (ch === '\n')              { this.line++; this.pos++; }
      else if (ch === ' ' || ch === '\t' || ch === '\r') { this.pos++; }
      else break;
    }
  }

  readString() {
    const line = this.line;
    this.pos++; // skip opening "
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\n') this.line++;
      value += this.source[this.pos++];
    }
    this.pos++; // skip closing "
    return { type: 'STRING', value, line };
  }

  readVariable() {
    const line = this.line;
    this.pos++; // skip ?
    let name = '';
    while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.pos])) {
      name += this.source[this.pos++];
    }
    return { type: 'VARIABLE', value: name, line };
  }

  readNumber() {
    const line = this.line;
    let raw = '';
    if (this.source[this.pos] === '-') raw += this.source[this.pos++];
    while (this.pos < this.source.length && /[\d.]/.test(this.source[this.pos])) {
      raw += this.source[this.pos++];
    }
    return { type: 'NUMBER', value: parseFloat(raw), line };
  }

  readIdent() {
    const line = this.line;
    let name = '';
    while (this.pos < this.source.length && this.isIdentChar(this.source[this.pos])) {
      // Stop before -= so it's not swallowed into an identifier
      if (this.source[this.pos] === '-' && this.source[this.pos + 1] === '=') break;
      name += this.source[this.pos++];
    }
    return { type: 'IDENT', value: name, line };
  }

  isIdentChar(ch) {
    return ch !== undefined && /[a-zA-Z0-9_-]/.test(ch);
  }
}


export class DSLParser {
  constructor(tokens, predicateSchema, { entityNames = null } = {}) {
    this.tokens          = tokens;
    this.pos             = 0;
    this.predicateSchema = predicateSchema;
    this.entityNames     = entityNames;
  }

  peek()    { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  check(type, value) {
    const tok = this.peek();
    return tok.type === type && (value === undefined || tok.value === value);
  }

  expect(type, value) {
    const tok = this.advance();
    if (tok.type !== type) {
      const expected = value !== undefined ? `'${value}'` : type;
      throw new Error(`Expected ${expected} but got '${tok.value}' at line ${tok.line}`);
    }
    if (value !== undefined && tok.value !== value) {
      throw new Error(`Expected '${value}' but got '${tok.value}' at line ${tok.line}`);
    }
    return tok;
  }

  parse() {
    const rules = [];

    while (!this.check('EOF')) {
      if (this.check('IDENT', 'rule')) { rules.push(this.parseRule()); continue; }
      if (this.check('IDENT', 'world')) {
        throw new Error(`World state belongs in a state file — use parseState() instead (line ${this.peek().line})`);
      }
      const tok = this.peek();
      throw new Error(`Expected 'rule' at line ${tok.line}`);
    }

    return { rules };
  }

  parseState() {
    const worldState    = [];
    const privateStates = new Map();

    while (!this.check('EOF')) {
      if (this.check('IDENT', 'world')) {
        worldState.push(...this.parseWorldState());
        continue;
      }
      if (this.check('IDENT', 'private')) {
        const { entityName, assertions } = this.parsePrivateState();
        privateStates.set(entityName, assertions);
        continue;
      }
      const tok = this.peek();
      throw new Error(`Expected 'world' or 'private' at line ${tok.line}`);
    }

    return { worldState, privateStates };
  }

  parseDefinitions() {
    const definitions = [];

    while (!this.check('EOF')) {
      if (this.check('IDENT', 'define')) { definitions.push(this.parseDefinition()); continue; }
      const tok = this.peek();
      throw new Error(`Expected 'define' at line ${tok.line}`);
    }

    return { definitions };
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  parseRule() {
    this.expect('IDENT', 'rule');
    const name = this.expect('STRING').value;

    const predicates = [];
    while (!this.check('FAT_ARROW') && !this.check('EOF')) {
      predicates.push(this.parsePredicateEntry());
      if (this.check('CARET')) this.advance();
    }

    if (predicates.length === 0) {
      throw new Error(`Rule "${name}" has no predicates — unconditional rules are not allowed`);
    }

    this.expect('FAT_ARROW');
    const effects = [this.parseStateOperation()];

    return { name, predicates, effects };
  }

  parseDefinition() {
    this.expect('IDENT', 'define');
    const name = this.expect('STRING').value;

    const predicates = [this.parsePredicateEntry()];
    while (this.check('CARET')) {
      this.advance();
      predicates.push(this.parsePredicateEntry());
    }

    this.expect('FAT_ARROW');
    const conclusion = this.parsePredicate();

    return { name, predicates, conclusion };
  }

  parsePredicateEntry() {
    const pred = this.parsePredicate();

    if (this.check('IDENT', 'then')) {
      if (pred.type === 'private') {
        throw new Error('Temporal chains with private-store predicates are not supported');
      }
      return this.parseTemporalChainFrom(pred);
    }

    if (!this.check('LBRACKET')) return pred;
    return this.parseBracketModifiers(pred);
  }

  parseTemporalChainFrom(firstPred) {
    const steps = [{ name: firstPred.name, args: firstPred.args }];

    while (this.check('IDENT', 'then')) {
      this.advance();
      let within = null;
      if (this.check('LBRACKET')) {
        this.advance();
        within = this.expect('NUMBER').value;
        this.expect('RBRACKET');
      }
      const next = this.parsePredicate();
      const step = { name: next.name, args: next.args };
      if (within !== null) step.within = within;
      steps.push(step);
    }

    const chainPred = { type: 'temporal-chain', steps };

    if (!this.check('LBRACKET')) return chainPred;
    return this.parseBracketModifiers(chainPred);
  }

  parseBracketModifiers(pred) {
    this.advance(); // consume [
    let importance = 1.0;
    let historyFound = false;
    let window = null;

    while (!this.check('RBRACKET')) {
      const key = this.expect('IDENT').value;
      if (key === 'history') {
        historyFound = true;
        if (this.check('COLON')) { this.advance(); window = this.expect('NUMBER').value; }
      } else if (key === 'importance') {
        this.expect('COLON');
        importance = this.expect('NUMBER').value;
      }
      if (!this.check('RBRACKET')) this.expect('COMMA');
    }
    this.advance(); // consume ]

    let finalPred = pred.type === 'private' ? pred.predicate : pred;
    if (historyFound) {
      const inner = finalPred;
      finalPred = { type: 'historical-window', name: inner.name, args: inner.args };
      if (inner.tier)       finalPred.tier   = inner.tier;
      if (window !== null) finalPred.window = window;
    }

    if (pred.type === 'private') {
      finalPred = { ...pred, predicate: finalPred };
    }

    if (importance === 1.0) return finalPred;
    return { predicate: finalPred, importance };
  }

  parsePredicate() {
    if (this.check('PIPE')) {
      this.advance();
      const inner = this.parsePredicate();
      this.expect('PIPE');
      let operator;
      if      (this.check('GTE')) { this.advance(); operator = '>='; }
      else if (this.check('LTE')) { this.advance(); operator = '<='; }
      else if (this.check('GT'))  { this.advance(); operator = '>';  }
      else if (this.check('LT'))  { this.advance(); operator = '<';  }
      else if (this.check('EQ'))  { this.advance(); operator = '=';  }
      else { const tok = this.peek(); throw new Error(`Expected >, >=, <, <=, or = after |...| at line ${tok.line}`); }
      const threshold = this.expect('NUMBER').value;
      return { type: 'count', predicate: inner, operator, threshold };
    }

    // 'not' keyword: absence check (NAF) or absence of explicit negation ('not -pred')
    if (this.check('IDENT', 'not')) {
      this.advance();
      if (this.check('MINUS')) {
        this.advance();
        return { type: 'not-negated', predicate: this.parsePredicate() };
      }
      return { type: 'negation', predicate: this.parsePredicate() };
    }

    // '~' sugar: absent OR explicitly disbelieved
    if (this.check('TILDE')) {
      this.advance();
      return { type: 'weak-negation', predicate: this.parsePredicate() };
    }

    // '-pred' or '-?VAR.pred' LHS: explicit disbelief is present
    const nextType = this.tokens[this.pos + 1]?.type;
    if (this.check('MINUS') && (nextType === 'IDENT' || nextType === 'VARIABLE')) {
      this.advance();
      return { type: 'explicit-negation', predicate: this.parsePredicate() };
    }

    const owner = this.parseOwnerPrefix();
    const inner = this.parsePredicateBody();

    if (owner) {
      return { type: 'private', ...owner, predicate: inner };
    }
    return inner;
  }

  parseOwnerPrefix() {
    if (this.check('VARIABLE')) {
      const ownerVar = '?' + this.advance().value;
      this.expect('DOT');
      return { ownerVar, ownerEntity: null };
    }

    if (this.isEntityOwnerPrefix()) {
      const ownerEntity = this.advance().value;
      this.expect('DOT');
      return { ownerVar: null, ownerEntity };
    }

    return null;
  }

  isEntityOwnerPrefix() {
    if (!this.check('IDENT')) return false;
    if (this.tokens[this.pos + 1]?.type !== 'DOT') return false;

    const name = this.peek().value;
    if (this.predicateSchema?.hasDefinition(name)) return false;
    if (this.entityNames?.has(name)) return true;
    return false;
  }

  parsePredicateBody() {
    const name = this.expect('IDENT').value;

    if (this.check('DOT')) {
      this.advance();
      const tier = this.expect('IDENT').value;
      this.expect('LPAREN');
      const args = this.parseArgs();
      this.expect('RPAREN');
      return { type: 'numeric-tier', name, tier, args };
    }

    this.expect('LPAREN');
    const args = this.parseArgs();
    this.expect('RPAREN');

    let operator;
    if      (this.check('GTE')) { this.advance(); operator = '>='; }
    else if (this.check('LTE')) { this.advance(); operator = '<='; }
    else if (this.check('GT'))  { this.advance(); operator = '>';  }
    else if (this.check('LT'))  { this.advance(); operator = '<';  }
    else if (this.check('EQ'))  { this.advance(); operator = '=';  }
    if (operator !== undefined) {
      const threshold = this.expect('NUMBER').value;
      return { type: 'numeric-value', name, args, operator, threshold };
    }

    return { type: this.resolveType(name), name, args };
  }

  resolveType(name) {
    if (!this.predicateSchema || !this.predicateSchema.hasDefinition(name)) return 'fact';
    const schemaType = this.predicateSchema.getDefinition(name).type;
    if (schemaType === 'boolean' || schemaType === 'belief') return 'fact';
    if (schemaType === 'derived') return 'derived';
    if (schemaType === 'sensor') return 'sensor';
    return 'fact';
  }

  parseStateOperation() {
    // 'not' means retract; 'not -' means retract the negated fact
    if (this.check('IDENT', 'not')) {
      this.advance();
      const negated = this.check('MINUS') ? (this.advance(), true) : false;
      const owner = this.parseOwnerPrefix();
      const { name, args } = this.parseNameAndArgs();
      return { type: 'retract', name, args, negated, ...this.ownerFields(owner) };
    }

    const owner = this.parseOwnerPrefix();

    // '-pred' means assert with negated: true
    if (this.check('MINUS')) {
      this.advance();
      const { name, args } = this.parseNameAndArgs();
      return { type: 'assert', name, args, negated: true, ...this.ownerFields(owner), strength: this.parseOptionalStrength() };
    }

    const { name, args } = this.parseNameAndArgs();

    if (this.check('PLUS_EQ')) {
      this.advance();
      const delta = this.expect('NUMBER').value;
      return { type: 'adjust-numeric', name, args, delta, ...this.ownerFields(owner), strength: 1.0 };
    }
    if (this.check('MINUS_EQ')) {
      this.advance();
      const delta = this.expect('NUMBER').value;
      return { type: 'adjust-numeric', name, args, delta: -delta, ...this.ownerFields(owner), strength: 1.0 };
    }
    if (this.check('EQ')) {
      this.advance();
      const value = this.expect('NUMBER').value;
      return { type: 'set-numeric', name, args, value, ...this.ownerFields(owner), strength: this.parseOptionalStrength() };
    }

    return { type: 'assert', name, args, ...this.ownerFields(owner), strength: this.parseOptionalStrength() };
  }

  ownerFields(owner) {
    if (!owner) return { ownerVar: null, ownerEntity: null };
    return owner;
  }

  parseOptionalStrength() {
    if (!this.check('AT')) return 1.0;
    this.advance();
    return this.expect('NUMBER').value;
  }

  parseRuleEffect() {
    return this.parseStateOperation();
  }

  // ── Standalone predicate queries ────────────────────────────────────────────

  parsePredicateConjunction() {
    const entries = [this.parsePredicateEntry()];
    while (this.check('CARET')) {
      this.advance();
      entries.push(this.parsePredicateEntry());
    }
    this.expect('EOF');
    return entries;
  }

  // ── World state ─────────────────────────────────────────────────────────────

  parseWorldState() {
    this.expect('IDENT', 'world');
    const assertions = [];
    while (!this.check('EOF') && !this.check('IDENT', 'world') && !this.check('IDENT', 'private')) {
      assertions.push(this.parseStateAssertion());
    }
    return assertions;
  }

  parsePrivateState() {
    this.expect('IDENT', 'private');
    const entityName = this.expect('IDENT').value;
    const assertions = [];
    while (!this.check('EOF') && !this.check('IDENT', 'world') && !this.check('IDENT', 'private')) {
      assertions.push(this.parseStateAssertion());
    }
    return { entityName, assertions };
  }

  parseStateAssertion() {
    const operation = this.parseStateOperation();

    if (this.check('LBRACKET')) {
      this.advance();
      this.expect('IDENT', 'at');
      this.expect('COLON');
      const tick = this.expect('NUMBER').value;
      this.expect('RBRACKET');
      return { ...operation, tick };
    }

    return operation;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  parseNameAndArgs() {
    const name = this.expect('IDENT').value;
    this.expect('LPAREN');
    const args = this.parseArgs();
    this.expect('RPAREN');
    return { name, args };
  }

  parseArgs() {
    const args = [];
    if (this.check('RPAREN')) return args;
    args.push(this.parseArg());
    while (this.check('COMMA')) {
      this.advance();
      args.push(this.parseArg());
    }
    return args;
  }

  parseArg() {
    if (this.check('VARIABLE')) return '?' + this.advance().value;
    if (this.check('WILDCARD')) { this.advance(); return null; }
    if (this.check('STRING'))   return this.advance().value;
    if (this.check('NUMBER'))   return this.advance().value;
    if (this.check('IDENT'))    return this.advance().value;
    const tok = this.peek();
    throw new Error(`Unexpected token '${tok.value}' in argument list at line ${tok.line}`);
  }
}
