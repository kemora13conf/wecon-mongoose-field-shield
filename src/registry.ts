/**
 * FieldShield v1 - Policy Registry
 *
 * Central store for all model shield configurations.
 * Parses shield configs from schemas and provides lookup.
 */

import {
  ShieldConfig,
  ModelPolicy,
  IPolicyRegistry,
  ValidationResult,
} from './types';

/**
 * PolicyRegistry - Singleton store for all model shield policies.
 *
 * Responsibilities:
 * - Store shield configs parsed from schemas
 * - Provide fast lookup for field filtering
 * - Validate schemas in strict mode
 */
class PolicyRegistryImpl implements IPolicyRegistry {
  private policies = new Map<string, ModelPolicy>();

  /**
   * Register policies for a model.
   * Called during schema compilation.
   */
  register(modelName: string, fields: ModelPolicy): void {
    this.policies.set(modelName, fields);
  }

  /**
   * Get shield config for a specific field.
   */
  getFieldConfig(modelName: string, field: string): ShieldConfig | undefined {
    const modelPolicy = this.policies.get(modelName);
    if (!modelPolicy) return undefined;
    return modelPolicy.get(field);
  }

  /**
   * Get all field configs for a model.
   */
  getModelPolicy(modelName: string): ModelPolicy | undefined {
    return this.policies.get(modelName);
  }

  /**
   * Check if model has any policies registered.
   */
  hasModel(modelName: string): boolean {
    return this.policies.has(modelName);
  }

  /**
   * Validate that all schema fields have shield config.
   * Used in strict mode.
   */
  validateStrict(modelName: string, schemaFields: string[]): ValidationResult {
    const modelPolicy = this.policies.get(modelName);
    const missingFields: string[] = [];

    for (const field of schemaFields) {
      // Skip internal fields
      if (field.startsWith('_') && field !== '_id') continue;

      if (!modelPolicy || !modelPolicy.has(field)) {
        missingFields.push(field);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * Get all registered model names.
   */
  getRegisteredModels(): string[] {
    return Array.from(this.policies.keys());
  }

  /**
   * Clear all policies.
   * Useful for testing.
   */
  clear(): void {
    this.policies.clear();
  }

  /**
   * Get debug info for a model.
   */
  getDebugInfo(modelName: string): string {
    const policy = this.policies.get(modelName);
    if (!policy) return `Model "${modelName}" not registered`;

    const lines: string[] = [`Shield config for ${modelName}:`];
    for (const [field, config] of policy) {
      const roles = config.roles.length === 0 ? '(hidden)' : config.roles.join(', ');
      const extras: string[] = [];
      if (config.condition) extras.push('condition');
      if (config.transform) extras.push('transform');
      const extraStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';
      lines.push(`  ${field}: ${roles}${extraStr}`);
    }
    return lines.join('\n');
  }
}

// Export singleton instance
export const PolicyRegistry = new PolicyRegistryImpl();

/**
 * Parse shield configurations from a Mongoose schema.
 * Extracts the `shield` property from each path and builds a ModelPolicy.
 */
export function parseSchemaShield(
  schema: any,
  modelName: string
): { policy: ModelPolicy; schemaFields: string[] } {
  const policy: ModelPolicy = new Map();
  const schemaFields: string[] = [];

  // Iterate over all schema paths
  for (const [pathName, pathConfig] of Object.entries(schema.paths)) {
    const path = pathConfig as any;
    schemaFields.push(pathName);

    // Check for shield config in path options
    const shieldConfig = path.options?.shield;

    if (shieldConfig) {
      // Validate shield config structure
      if (!Array.isArray(shieldConfig.roles)) {
        throw new Error(
          `Invalid shield config for "${pathName}" in ${modelName}: ` +
            `"roles" must be an array of strings`
        );
      }

      policy.set(pathName, {
        roles: shieldConfig.roles,
        condition: shieldConfig.condition,
        transform: shieldConfig.transform,
      });
    }
  }

  return { policy, schemaFields };
}

/**
 * Check if user roles match any allowed roles.
 */
export function checkRoleAccess(allowedRoles: string[], userRoles: string[]): boolean {
  // Empty roles = hidden from everyone
  if (allowedRoles.length === 0) {
    return false;
  }

  // Wildcard = all authenticated users
  if (allowedRoles.includes('*')) {
    return true;
  }

  // Public = everyone including unauthenticated
  if (allowedRoles.includes('public')) {
    return true;
  }

  // Check for role intersection
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Calculate allowed fields for given roles.
 * Always includes _id for Mongoose hydration.
 * 
 * @param modelName - The model name for policy lookup
 * @param roles - User roles to check access for
 * @returns Object with fields to select and fields needing post-processing
 */
export function calculateAllowedFields(
  modelName: string,
  roles: string[]
): { selectFields: string[]; conditionFields: Set<string> } {
  const policy = PolicyRegistry.getModelPolicy(modelName);
  
  if (!policy) {
    // No policy = return empty (strict mode should catch this earlier)
    return { selectFields: ['_id'], conditionFields: new Set() };
  }

  const selectFields = new Set<string>(['_id']); // Always include _id
  const conditionFields = new Set<string>();

  for (const [field, config] of policy) {
    // Skip internal fields that shouldn't be in select
    if (field === '__v') continue;

    if (checkRoleAccess(config.roles, roles)) {
      selectFields.add(field);

      // If field has condition, mark for post-processing
      if (config.condition) {
        conditionFields.add(field);
      }
    } else if (config.condition) {
      // Field not accessible by role, but has condition
      // We might still need to fetch it for condition evaluation
      // Only add if the roles could potentially pass the condition
      // For now, we don't fetch - condition requires role access first
    }
  }

  return {
    selectFields: Array.from(selectFields),
    conditionFields,
  };
}

/**
 * Build a MongoDB projection string from allowed fields.
 */
export function buildProjectionString(fields: string[]): string {
  return fields.join(' ');
}

export default PolicyRegistry;
