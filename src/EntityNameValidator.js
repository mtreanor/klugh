const TOP_LEVEL_RESERVED = new Set(['world']);

// Ensures predicate names never collide with entity type or instance names.
export class EntityNameValidator {
  static collectNames(entitiesData) {
    const typeNames   = new Set(
      Object.keys(entitiesData).filter(k => !TOP_LEVEL_RESERVED.has(k))
    );
    const entityNames = new Set();

    for (const [typeName, block] of Object.entries(entitiesData)) {
      if (TOP_LEVEL_RESERVED.has(typeName)) continue;
      for (const [key, value] of Object.entries(block)) {
        if (key === 'privateStore') continue;
        if (value !== null && typeof value === 'object') entityNames.add(key);
      }
    }

    return { typeNames, entityNames };
  }

  static validate(entitiesData, predicateSchema) {
    const { typeNames, entityNames } = this.collectNames(entitiesData);

    for (const predName of predicateSchema.definitions.keys()) {
      if (entityNames.has(predName)) {
        throw new Error(
          `Predicate "${predName}" conflicts with entity name "${predName}"`
        );
      }
      if (typeNames.has(predName)) {
        throw new Error(
          `Predicate "${predName}" conflicts with entity type name "${predName}"`
        );
      }
    }

    return { typeNames, entityNames };
  }
}
