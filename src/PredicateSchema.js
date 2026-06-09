export class PredicateSchema {
  constructor(data) {
    this.definitions = new Map(Object.entries(data.predicates));
  }

  hasDefinition(name) {
    return this.definitions.has(name);
  }

  getDefinition(name) {
    return this.definitions.get(name);
  }

  // --- Numeric predicate helpers ---

  getDefault(name) {
    return this.definitions.get(name).default;
  }

  clamp(name, value) {
    const { minValue, maxValue } = this.definitions.get(name);
    return Math.min(maxValue, Math.max(minValue, value));
  }

  isSymmetric(name) {
    return this.definitions.get(name)?.symmetric === true;
  }

  // Returns true if the clamped value falls within the named tier's [a, b) range.
  // If the value falls in no tier (a gap), returns true for whichever tier is nearest.
  // Tiers may overlap — a value can match multiple tiers simultaneously.
  matchesTier(name, value, tierName) {
    const def = this.definitions.get(name);
    const clamped = this.clamp(name, value);
    const tierEntries = Object.entries(def.tiers);
    const tierRange = def.tiers[tierName];
    const [a, b] = tierRange;

    if (clamped >= a && clamped < b) return true;

    const inAnyTier = tierEntries.some(([, [ta, tb]]) => clamped >= ta && clamped < tb);
    if (inAnyTier) return false;

    // Value is in a gap — find nearest tier by distance to interval endpoints.
    // For [ta, tb): distance is 0 when value equals tb (the exclusive bound),
    // making maxValue naturally belong to the topmost tier.
    const distanceTo = ([ta, tb]) => clamped < ta ? ta - clamped : clamped - tb;
    const myDistance = distanceTo(tierRange);
    const nearestDistance = Math.min(...tierEntries.map(([, range]) => distanceTo(range)));
    return myDistance === nearestDistance;
  }
}
