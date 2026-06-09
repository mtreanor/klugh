// Applied when a rule fires to determine the effective delta for a numeric operation.
// Returns null to signal that the operation should be skipped entirely.
// Default: all-or-nothing — full delta if all premises satisfied, skip otherwise.
export class PartialTruthPolicy {
  apply(ruleApplication, operation) {
    return ruleApplication.isFullySatisfied() ? operation.delta : null;
  }
}
