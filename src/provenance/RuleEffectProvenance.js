export class RuleEffectProvenance {
  constructor(rule, binding, premiseRecords = []) {
    this.type           = 'rule-effect';
    this.rule           = rule;
    this.binding        = binding;
    this.premiseRecords = premiseRecords;
  }
}
