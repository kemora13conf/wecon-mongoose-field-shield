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

export default PolicyRegistry;
