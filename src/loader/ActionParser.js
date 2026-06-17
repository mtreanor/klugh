import { Lexer, DSLParser } from './DSLParser.js';

const AGGREGATORS = new Set(['sum', 'avg', 'min', 'max']);

class ActionDSLParser extends DSLParser {
  parse() {
    const actions = [];
    while (!this.check('EOF')) {
      if (this.check('IDENT', 'action')) { actions.push(this.parseAction()); continue; }
      const tok = this.peek();
      throw new Error(`Expected 'action' at line ${tok.line}`);
    }
    return { actions };
  }

  parseAction() {
    this.expect('IDENT', 'action');
    const name = this.expect('STRING').value;

    let roles = [];
    if (this.check('IDENT', 'roles')) {
      this.advance();
      this.expect('COLON');
      roles = this.parseRoles();
    }

    let info = [];
    if (this.check('IDENT', 'info')) {
      this.advance();
      this.expect('COLON');
      info = this.parseInfoFacts();
    }

    const preconditions = [];
    if (this.check('IDENT', 'preconditions')) {
      this.advance();
      preconditions.push(this.parsePredicateEntry());
      while (this.check('CARET')) {
        this.advance();
        preconditions.push(this.parsePredicateEntry());
      }
    }

    const utilitySources = [];
    if (this.check('IDENT', 'utility')) {
      this.advance();
      while (this.isUtilitySourceStart()) {
        utilitySources.push(this.parseUtilitySource());
      }
    }

    let content = null;
    if (this.check('IDENT', 'content')) {
      this.advance();
      const typeKeyword = this.expect('IDENT').value;
      this.expect('COLON');
      const template = this.expect('STRING').value;
      content = { type: typeKeyword, template };
    }

    const effects = [];
    if (this.check('IDENT', 'effects')) {
      this.advance();
      while (!this.check('EOF') && !this.check('IDENT', 'action')) {
        effects.push(this.parseStateOperation());
      }
    }

    const result = { name, effects };
    if (roles.length > 0)         result.roles          = roles;
    if (info.length > 0)          result.info           = info;
    if (preconditions.length > 0) result.preconditions  = preconditions;
    if (utilitySources.length > 0) result.utilitySources = utilitySources;
    if (content !== null)         result.content        = content;
    return result;
  }

  // Facts declared about the action itself, e.g. `tag(?this, social)`. Plain
  // positive facts only; ?this refers to the action. Reads facts until the next
  // section keyword (an IDENT not directly followed by '(').
  parseInfoFacts() {
    const facts = [];
    while (this.check('IDENT') && this.tokens[this.pos + 1]?.type === 'LPAREN') {
      const name = this.expect('IDENT').value;
      this.expect('LPAREN');
      const args = this.parseArgs();
      this.expect('RPAREN');
      facts.push({ name, args });
    }
    return facts;
  }

  parseRoles() {
    const roles = [];
    if (this.check('VARIABLE')) {
      roles.push('?' + this.advance().value);
      while (this.check('COMMA')) {
        this.advance();
        roles.push('?' + this.expect('VARIABLE').value);
      }
    }
    return roles;
  }

  isUtilitySourceStart() {
    if (this.check('NUMBER')) return true;
    if (this.check('IDENT', 'rule')) return true;
    if (this.check('IDENT') && AGGREGATORS.has(this.peek().value)) return true;
    // IDENT followed by LPAREN is a predicate source
    if (this.check('IDENT') && this.tokens[this.pos + 1]?.type === 'LPAREN') return true;
    return false;
  }

  // Atomic sources are the only valid children of an aggregate (no nesting).
  isAtomicUtilitySourceStart() {
    if (this.check('NUMBER')) return true;
    if (this.check('IDENT', 'rule')) return true;
    if (this.check('IDENT') && !AGGREGATORS.has(this.peek().value) && this.tokens[this.pos + 1]?.type === 'LPAREN') return true;
    return false;
  }

  parseUtilitySource() {
    if (this.check('IDENT') && AGGREGATORS.has(this.peek().value)) {
      const aggregator = this.advance().value;
      const sources = [];
      while (this.isAtomicUtilitySourceStart()) {
        sources.push(this.parseAtomicUtilitySource());
      }
      return { type: 'aggregate', aggregator, sources };
    }
    return this.parseAtomicUtilitySource();
  }

  parseAtomicUtilitySource() {
    if (this.check('NUMBER')) {
      return { type: 'constant', value: this.advance().value };
    }

    if (this.check('IDENT', 'rule')) {
      this.advance();
      const name = this.expect('STRING').value;
      const predicates = [this.parsePredicateEntry()];
      while (this.check('CARET')) {
        this.advance();
        predicates.push(this.parsePredicateEntry());
      }
      this.expect('FAT_ARROW');
      const weight = this.expect('NUMBER').value;
      return { type: 'rule', name, predicates, weight };
    }

    // IDENT + LPAREN → predicate utility source
    const name = this.expect('IDENT').value;
    this.expect('LPAREN');
    const args = this.parseArgs();
    this.expect('RPAREN');
    return { type: 'predicate', name, args };
  }
}

export class ActionParser {
  constructor(predicateSchema = null) {
    this.predicateSchema = predicateSchema;
  }

  parse(source) {
    const tokens = new Lexer(source).tokenize();
    return new ActionDSLParser(tokens, this.predicateSchema).parse();
  }
}
