/**
 * FieldShield v2 - Aggregation Interception
 *
 * Patches Mongoose Aggregate prototype to:
 * 1. Add .role() method for specifying roles
 * 2. Use pre('aggregate') middleware to inject $project stages
 * 3. Prevent aggregation bypass of field-level security
 */

import type { Mongoose, Schema } from 'mongoose';
import { ShieldError } from './errors';
import { PolicyRegistry, calculateAllowedFields } from './registry';

// Track if we've already patched the Aggregate prototype
let isPatched = false;

/**
 * Patch Mongoose Aggregate prototype with .role() method.
 */
export function patchAggregatePrototype(mongoose: Mongoose): void {
  if (isPatched) return;
  isPatched = true;

  const AggregatePrototype = mongoose.Aggregate.prototype as any;

  // ============================================================================
  // Add .role() method
  // ============================================================================

  /**
   * Specify roles for field filtering in aggregation.
   * REQUIRED on all aggregations for shielded models.
   *
   * @param roles - Single role or array of roles
   * @returns Aggregate for chaining
   */
  AggregatePrototype.role = function (roles: string | string[]): any {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    this._shieldRoles = roleArray;
    return this;
  };

  // ============================================================================
  // Add .userId() method
  // ============================================================================

  /**
   * Specify user ID for owner-based conditions.
   *
   * @param id - The current user's ID
   * @returns Aggregate for chaining
   */
  AggregatePrototype.userId = function (id: string): any {
    this._shieldUserId = id;
    return this;
  };

  // ============================================================================
  // Add .bypassShield() method for internal aggregations
  // ============================================================================

  /**
   * Bypass FieldShield for internal aggregations.
   * Use with caution!
   *
   * @returns Aggregate for chaining
   */
  AggregatePrototype.bypassShield = function (): any {
    this._shieldBypassed = true;
    return this;
  };
}

/**
 * Register aggregate middleware on a schema.
 * Injects $project stages to filter fields at database level.
 *
 * @param schema - Mongoose schema to add middleware to
 * @param modelName - Name of the model for policy lookup
 */
export function registerAggregateMiddleware(
  schema: Schema,
  modelName: string
): void {
  schema.pre('aggregate', function (this: any) {
    // Check if shield is bypassed
    if (this._shieldBypassed) {
      return;
    }

    // Check if model has shield policies
    if (!PolicyRegistry.hasModel(modelName)) {
      return; // No policy = no filtering
    }

    // Check if role was specified
    const roles = this._shieldRoles;
    if (!roles) {
      ShieldError.missingRoleOnAggregate(modelName);
    }

    // Calculate which fields to project
    const { selectFields } = calculateAllowedFields(modelName, roles);

    // Build $project stage
    const projectStage = buildAggregateProject(selectFields);

    // Get the current pipeline
    const pipeline = this.pipeline();

    // Find the best position to inject $project
    // We want it after any $match at the start (for index usage)
    // but before any $lookup or other operations
    const insertIndex = findProjectInsertIndex(pipeline);

    // Insert the $project stage
    pipeline.splice(insertIndex, 0, projectStage);
  });
}

/**
 * Build a $project stage for aggregation from allowed fields.
 */
function buildAggregateProject(fields: string[]): { $project: Record<string, 1> } {
  const projection: Record<string, 1> = {};

  for (const field of fields) {
    projection[field] = 1;
  }

  return { $project: projection };
}

/**
 * Find the best index to insert $project stage.
 * Should be after initial $match stages but before transformations.
 */
function findProjectInsertIndex(pipeline: any[]): number {
  // Count consecutive $match stages at the start
  let matchCount = 0;
  for (const stage of pipeline) {
    if ('$match' in stage) {
      matchCount++;
    } else {
      break;
    }
  }

  // Insert after the initial $match stages
  return matchCount;
}

/**
 * Reset patch state (for testing).
 */
export function resetAggregatePatch(): void {
  isPatched = false;
}

export default { patchAggregatePrototype, registerAggregateMiddleware, resetAggregatePatch };
