export class Fact {
  constructor(name, ...args) {
    let negated = false;
    if (args.length > 0) {
      const last = args[args.length - 1];
      if (last !== null && typeof last === 'object' && !Array.isArray(last) && 'negated' in last) {
        negated = last.negated;
        args = args.slice(0, -1);
      }
    }
    this.name    = name;
    this.args    = args;
    this.negated = negated;
    this.value   = null;
  }

  static withValue(name, args, value) {
    const f = new Fact(name, ...args);
    f.value = value;
    return f;
  }

  toString() {
    const prefix = this.negated ? '-' : '';
    return `${prefix}${this.name}(${this.args.join(', ')})`;
  }
}
