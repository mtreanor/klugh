export class NumericRecord {
  constructor(name, args) {
    this.name   = name;
    this.args   = args;
    this.events = [];
  }

  currentValue() {
    return this.events.length > 0 ? this.events[this.events.length - 1].value : null;
  }

  addGiven(tick, value, provenance) {
    this.events.push({ type: 'given', tick, value, provenance });
  }

  addAdjustment(tick, delta, newValue, provenance) {
    this.events.push({ type: 'adjusted', tick, delta, value: newValue, provenance });
  }
}
