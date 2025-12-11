/**
 * FieldShield v2.2 - Policy Registry
 *
 * Central store for all model shield configurations.
 * Parses shield configs from schemas and provides lookup.
 *
 * Performance optimizations:
 * - Pre-computed projections per role for O(1) query-time lookup
 * - Cached role combinations to avoid repeated calculations
 */

import {
  ShieldConfig,
  ModelPolicy,
  IPolicyRegistry,
  ValidationResult,
} from './types';

/**
 * Cached projection result for a specific role combination.
 */
interface CachedProjection {
  selectFields: string[];
  conditionFields: Set<string>;
}

/**
 * Pre-computed access data for a model.
 */
interface PrecomputedAccess {
  // Projections for single roles (most common case)
  singleRoleProjections: Map<string, CachedProjection>;
  // Cache for multi-role combinations (computed on demand)
  multiRoleCache: Map<string, CachedProjection>;
  // All unique roles used in this model's policy
  allRoles: Set<string>;
}

/**
 * PolicyRegistry - Singleton store for all model shield policies.
 *
 * Responsibilities:
 * - Store shield configs parsed from schemas
 * - Provide fast lookup for field filtering
 * - Pre-compute projections for common roles
 * - Validate schemas in strict mode
 */
class PolicyRegistryImpl implements IPolicyRegistry {
  private policies = new Map<string, ModelPolicy>();
  private precomputed = new Map<string, PrecomputedAccess>();

  /**
   * Register policies for a model and pre-compute projections.
   * Called during model creation (eager) or first query (fallback).
   */
  register(modelName: string, fields: ModelPolicy): void {
    this.policies.set(modelName, fields);

    // Pre-compute projections for fast query-time lookup
    this.precomputeProjections(modelName, fields);
  }

  /**
   * Pre-compute projections for all unique roles in the policy.
   * This moves O(n) work from query-time to registration-time.
   */
  private precomputeProjections(modelName: string, policy: ModelPolicy): void {
    const allRoles = new Set<string>();
    const singleRoleProjections = new Map<string, CachedProjection>();

    // Collect all unique roles from the policy
    for (const config of policy.values()) {
      for (const role of config.roles) {
        allRoles.add(role);
      }
    }

    // Always include common special roles
    allRoles.add('public');
    allRoles.add('*');

    // Pre-compute projection for each single role
    for (const role of allRoles) {
      const projection = this.computeProjection(policy, [role]);
      singleRoleProjections.set(role, projection);
    }

    this.precomputed.set(modelName, {
      singleRoleProjections,
      multiRoleCache: new Map(),
      allRoles,
    });
  }

  /**
   * Compute projection for a given set of roles.
   * This is the core calculation, called once per role at registration.
   */
  private computeProjection(policy: ModelPolicy, roles: string[]): CachedProjection {
    const selectFields = new Set<string>(['_id']);
    const conditionFields = new Set<string>();

    // Use Set for O(1) role lookup
    const roleSet = new Set(roles);

    for (const [field, config] of policy) {
      if (field === '__v') continue;

      if (this.checkRoleAccessFast(config.roles, roleSet)) {
        selectFields.add(field);
        if (config.condition) {
          conditionFields.add(field);
        }
      }
    }

    // Remove redundant parent paths (computed once, cached)
    const filteredFields = removeRedundantParentPaths(Array.from(selectFields));

    return {
      selectFields: filteredFields,
      conditionFields,
    };
  }

  /**
   * Fast role access check using Set for O(1) lookup.
   */
  private checkRoleAccessFast(allowedRoles: string[], userRoleSet: Set<string>): boolean {
    if (allowedRoles.length === 0) return false;
    if (allowedRoles.includes('*')) return true;
    if (allowedRoles.includes('public')) return true;
    return allowedRoles.some(role => userRoleSet.has(role));
  }

  /**
   * Get pre-computed projection for roles (fast path).
   * Returns cached result for single roles, computes and caches for multi-role.
   */
  getProjection(modelName: string, roles: string[]): CachedProjection | null {
    const precomputed = this.precomputed.get(modelName);
    if (!precomputed) return null;

    // Fast path: single role (most common)
    if (roles.length === 1) {
      const cached = precomputed.singleRoleProjections.get(roles[0]);
      if (cached) return cached;
    }

    // Check multi-role cache
    const cacheKey = [...roles].sort().join(',');
    const cached = precomputed.multiRoleCache.get(cacheKey);
    if (cached) return cached;

    // Compute and cache for this role combination
    const policy = this.policies.get(modelName);
    if (!policy) return null;

    const projection = this.computeProjection(policy, roles);
    precomputed.multiRoleCache.set(cacheKey, projection);

    return projection;
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
   * Clear all policies and precomputed data.
   * Useful for testing.
   */
  clear(): void {
    this.policies.clear();
    this.precomputed.clear();
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
 * 
 * Also:
 * - Recursively processes embedded schemas (array subdocuments)
 * - Synthesizes parent field policies from nested children
 */
export function parseSchemaShield(
  schema: any,
  modelName: string
): { policy: ModelPolicy; schemaFields: string[] } {
  const policy: ModelPolicy = new Map();
  const schemaFields: string[] = [];

  // Recursively parse schema paths
  parseSchemaPathsRecursive(schema, '', policy, schemaFields, modelName);

  // Synthesize parent policies from nested children
  synthesizeParentPolicies(policy);

  return { policy, schemaFields };
}

/**
 * Recursively parse schema paths, including embedded schemas for arrays.
 * 
 * @param schema - Mongoose schema or embedded schema
 * @param prefix - Path prefix for nested fields (e.g., 'addresses')
 * @param policy - Policy map to populate
 * @param schemaFields - Array to collect all field names
 * @param modelName - Model name for error messages
 */
function parseSchemaPathsRecursive(
  schema: any,
  prefix: string,
  policy: ModelPolicy,
  schemaFields: string[],
  modelName: string
): void {
  for (const [pathName, pathConfig] of Object.entries(schema.paths)) {
    const path = pathConfig as any;
    const fullPath = prefix ? `${prefix}.${pathName}` : pathName;
    
    schemaFields.push(fullPath);

    // Check for shield config in path options
    const shieldConfig = path.options?.shield;

    if (shieldConfig) {
      // Validate shield config structure
      if (!Array.isArray(shieldConfig.roles)) {
        throw new Error(
          `Invalid shield config for "${fullPath}" in ${modelName}: ` +
            `"roles" must be an array of strings`
        );
      }

      policy.set(fullPath, {
        roles: shieldConfig.roles,
        condition: shieldConfig.condition,
        transform: shieldConfig.transform,
      });
    }

    // Check for embedded schema (array of subdocuments)
    // SchemaDocumentArray has a .schema property with the subdocument schema
    if (path.schema && typeof path.schema.paths === 'object') {
      parseSchemaPathsRecursive(
        path.schema,
        fullPath,
        policy,
        schemaFields,
        modelName
      );
    }
  }
}

/**
 * Synthesize parent field policies from nested children.
 * 
 * For paths like "preferences.theme" and "preferences.locale",
 * creates a synthesized "preferences" policy with the union of their roles.
 * 
 * @param policy - The policy map to mutate with synthesized parent configs
 */
function synthesizeParentPolicies(policy: ModelPolicy): void {
  // Collect all unique parent prefixes
  const parentPrefixes = new Set<string>();

  for (const path of policy.keys()) {
    const parts = path.split('.');
    // Generate all ancestor prefixes: a.b.c -> [a, a.b]
    for (let i = 1; i < parts.length; i++) {
      parentPrefixes.add(parts.slice(0, i).join('.'));
    }
  }

  if (parentPrefixes.size === 0) return;

  // Sort by depth (deepest first) to build up from leaves
  const sortedPrefixes = Array.from(parentPrefixes).sort((a, b) => {
    const depthA = a.split('.').length;
    const depthB = b.split('.').length;
    return depthB - depthA; // Deepest first
  });

  for (const prefix of sortedPrefixes) {
    // Skip if parent already has explicit config
    if (policy.has(prefix)) continue;

    // Find all direct children of this prefix
    const childRoles = new Set<string>();
    let hasAnyChildren = false;

    for (const [path, config] of policy) {
      // Check if this path is a direct child of the prefix
      if (path.startsWith(prefix + '.')) {
        const remainder = path.slice(prefix.length + 1);
        // Direct child has no further dots (or we also include nested for union)
        // Actually, for union we want ALL descendants' roles
        hasAnyChildren = true;
        for (const role of config.roles) {
          childRoles.add(role);
        }
      }
    }

    if (hasAnyChildren) {
      // If all children have empty roles, parent should also be hidden
      const roles = Array.from(childRoles);

      policy.set(prefix, {
        roles: roles,
        // Mark as synthesized - this is auto-generated from children
        // and shouldn't count as "covering" children for strict validation
        _synthesized: true,
      });
    }
  }
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
 * Handles path collision by only including the most specific paths:
 * - If both 'settings' and 'settings.publicSetting' would be included,
 *   only 'settings.publicSetting' is kept to avoid MongoDB projection errors.
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

  // Remove redundant parent paths to avoid MongoDB path collision
  // If we have both 'settings' and 'settings.theme', keep only 'settings.theme'
  const filteredFields = removeRedundantParentPaths(Array.from(selectFields));

  return {
    selectFields: filteredFields,
    conditionFields,
  };
}

/**
 * Remove parent paths that have children also in the list.
 * MongoDB projection cannot include both 'a' and 'a.b' - causes path collision.
 * 
 * @param paths - Array of field paths
 * @returns Filtered array with only the most specific paths
 */
function removeRedundantParentPaths(paths: string[]): string[] {
  const result: string[] = [];
  
  // Sort by length (shortest first) to process parents before children
  const sorted = [...paths].sort((a, b) => a.length - b.length);
  
  for (const path of sorted) {
    // Check if any existing path in result is a child of this path
    const hasChild = result.some(existing => existing.startsWith(path + '.'));
    
    // Check if this path is a child of any existing path
    const isChildOfExisting = result.some(existing => path.startsWith(existing + '.'));
    
    if (hasChild) {
      // This is a parent and we already have its children - skip
      continue;
    }
    
    if (isChildOfExisting) {
      // This is a child of an existing path - we need to remove the parent and add the child
      // Actually, with sorted order (shortest first), parents are added before children
      // So if isChildOfExisting is true, we should remove the parent and add both
      // But this is complex... let's use a different approach
    }
    
    result.push(path);
  }
  
  // Second pass: remove any parent that has children
  return result.filter(path => {
    return !result.some(other => other !== path && other.startsWith(path + '.'));
  });
}

/**
 * Build a MongoDB projection string from allowed fields.
 */
export function buildProjectionString(fields: string[]): string {
  return fields.join(' ');
}

export default PolicyRegistry;
