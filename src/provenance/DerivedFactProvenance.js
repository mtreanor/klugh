export class DerivedFactProvenance {
  constructor(defineRule, binding, premiseRecords = []) {
    this.type           = 'derived-fact';
    this.defineRule     = defineRule;
    this.binding        = binding;
    this.premiseRecords = premiseRecords;
  }
}
