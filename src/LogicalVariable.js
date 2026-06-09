export class LogicalVariable {
  constructor(name) {
    this.name = name;
  }

  toString() {
    return `?${this.name}`;
  }
}
