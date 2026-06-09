import { EntityNameValidator } from '../EntityNameValidator.js';

const TYPE_CONFIG_KEYS = new Set(['privateStore']);
const TOP_LEVEL_KEYS  = new Set(['world']);

export class EntityLoader {
  load(entitiesData, world, predicateSchema) {
    const { entityNames } = EntityNameValidator.validate(entitiesData, predicateSchema);

    if (entitiesData.world?.contradictionPolicy) {
      world.setContradictionPolicy(entitiesData.world.contradictionPolicy);
    }

    for (const [typeName, typeBlock] of Object.entries(entitiesData)) {
      if (TOP_LEVEL_KEYS.has(typeName)) continue;
      const typeLevelPrivateStore = typeBlock.privateStore === true;

      for (const [memberName, memberProps] of Object.entries(typeBlock)) {
        if (TYPE_CONFIG_KEYS.has(memberName)) continue;
        if (memberProps === null || typeof memberProps !== 'object') continue;

        world.addEntity(typeName, { name: memberName });

        // Per-member privateStore config takes precedence over the type-level flag
        if (memberProps.privateStore?.active === true) {
          const policy = memberProps.privateStore.contradictionPolicy ?? 'lastWins';
          world.registerPrivateStore(memberName, { contradictionPolicy: policy });
        } else if (typeLevelPrivateStore) {
          world.registerPrivateStore(memberName);
        }
      }
    }

    world.entityNames = entityNames;
    return entityNames;
  }
}
