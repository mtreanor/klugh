import { Lexer, DSLParser } from './DSLParser.js';

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

    this.expect('IDENT', 'effects');

    const effects = [];
    while (!this.check('EOF') && !this.check('IDENT', 'action')) {
      effects.push(this.parseStateOperation());
    }

    const result = { name, effects };
    if (roles.length > 0)         result.roles          = roles;
    if (preconditions.length > 0) result.preconditions  = preconditions;
    if (utilitySources.length > 0) result.utilitySources = utilitySources;
    if (content !== null)         result.content        = content;
    return result;
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
    if (this.check('IDENT', 'group')) return true;
    if (this.check('IDENT', 'rule')) return true;
    // IDENT followed by LPAREN is a predicate source
    if (this.check('IDENT') && this.tokens[this.pos + 1]?.type === 'LPAREN') return true;
    return false;
  }

  parseUtilitySource() {
    if (this.check('NUMBER')) {
      return { type: 'constant', value: this.advance().value };
    }

    if (this.check('IDENT', 'group')) {
      this.advance();
      const aggregator = this.expect('IDENT').value;
      this.expect('LPAREN');
      const sources = [];
      while (!this.check('RPAREN') && !this.check('EOF')) {
        sources.push(this.parseUtilitySource());
      }
      this.expect('RPAREN');
      return { type: 'aggregate', aggregator, sources };
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
