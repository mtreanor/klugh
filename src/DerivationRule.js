// Authored Horn clause: premises imply a derived predicate conclusion.
// Premises reuse the same predicate vocabulary as volition rules.
// conclusionOwnerVar is non-null for private conclusions (=> ?X.pred(args)),
// in which case the rule is only invoked when querying that owner's private store.
export class DerivationRule {
  constructor(name, premiseEntries, conclusion, conclusionOwnerVar = null) {
    this.name               = name;
    this.premiseEntries     = premiseEntries;    // { predicate, importance }[]
    this.conclusion         = conclusion;        // DerivedFactPredicate
    this.conclusionOwnerVar = conclusionOwnerVar; // LogicalVariable | null
  }

  // Alias so RuleEvaluator (which expects predicateEntries) works with DerivationRule.
  get predicateEntries() { return this.premiseEntries; }

  collectVariables() {
    const seen      = new Set();
    const variables = [];
    for (const { predicate } of this.premiseEntries) {
      for (const v of predicate.getVariables()) {
        if (!seen.has(v.name)) { seen.add(v.name); variables.push(v); }
      }
    }
    return variables;
  }
}
