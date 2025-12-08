/**
 * FieldShield v2 - Query Interception
 *
 * Uses native Mongoose middleware pattern:
 * 1. Adds .role() and .userId() chainable methods to Query
 * 2. Uses pre('find') middleware to apply .select() projections at DB level
 * 3. Preserves Mongoose Documents (no POJO conversion)
 */

import type { Mongoose, Query, Schema } from 'mongoose';
import { ShieldError } from './errors';
import { PolicyRegistry, calculateAllowedFields } from './registry';

// Track if we've already patched the Query prototype
let isPatched = false;

/**
 * Patch Mongoose Query prototype with .role() and .userId() methods.
 * This only adds the methods, not the middleware.
 */
export function patchQueryPrototype(mongoose: Mongoose): void {
  if (isPatched) return;
  isPatched = true;

  const QueryPrototype = mongoose.Query.prototype as any;

  /**
   * Specify roles for field filtering.
   * REQUIRED on all queries for shielded models.
   */
  QueryPrototype.role = function (roles: string | string[]): Query<any, any> {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    this._shieldRoles = roleArray;
    return this;
  };

  /**
   * Specify user ID for owner-based conditions.
   */
  QueryPrototype.userId = function (id: string): Query<any, any> {
    this._shieldUserId = id;
    return this;
  };

  /**
   * Bypass FieldShield for internal queries (auth, migrations, etc).
   * Use with caution!
   */
  QueryPrototype.bypassShield = function (): Query<any, any> {
    this._shieldBypassed = true;
    return this;
  };
}

/**
 * Register query middleware on a schema.
 * This applies projections at the database level.
 */
export function registerQueryMiddleware(
  schema: Schema,
  modelName: string
): void {
  // Pre-middleware handler for field projection
  const preHandler = function (this: any) {
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
      ShieldError.missingRole(modelName, this.op || 'query');
    }

    // Calculate which fields to select
    const { selectFields, conditionFields } = calculateAllowedFields(modelName, roles);

    // Apply projection to the query using object notation for whitelist
    const projectionObj: Record<string, 1> = {};
    for (const field of selectFields) {
      projectionObj[field] = 1;
    }
    
    this.select(projectionObj);

    // Store condition fields for post-processing in toJSON
    this.setOptions({
      _shieldConditionFields: conditionFields,
      _shieldRoles: roles,
      _shieldUserId: this._shieldUserId,
    });
  };

  // Register pre middleware for each query type
  schema.pre('find', preHandler);
  schema.pre('findOne', preHandler);
  schema.pre('findOneAndUpdate', preHandler);
  schema.pre('findOneAndDelete', preHandler);
  schema.pre('findOneAndReplace', preHandler);

  // Post-middleware handler to attach role context
  const postHandler = function (this: any, result: any) {
    if (this._shieldBypassed || !result) {
      return;
    }

    const roles = this._shieldRoles || this.getOptions()?._shieldRoles;
    const userId = this._shieldUserId || this.getOptions()?._shieldUserId;

    if (!roles) return;

    // Attach role context to document(s) for toJSON filtering
    attachRoleContext(result, roles, userId);
  };

  // Register post middleware for each query type
  schema.post('find', postHandler);
  schema.post('findOne', postHandler);
  schema.post('findOneAndUpdate', postHandler);
  schema.post('findOneAndDelete', postHandler);
  schema.post('findOneAndReplace', postHandler);
}

/**
 * Attach role context to a document or array of documents.
 * Used for toJSON/toObject condition evaluation.
 */
function attachRoleContext(
  doc: any,
  roles: string[],
  userId?: string
): void {
  if (!doc) return;

  if (Array.isArray(doc)) {
    doc.forEach((d) => attachRoleContext(d, roles, userId));
    return;
  }

  // Only attach to Mongoose documents (not POJOs)
  if (typeof doc === 'object') {
    Object.defineProperty(doc, '_shieldRoles', {
      value: roles,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    if (userId) {
      Object.defineProperty(doc, '_shieldUserId', {
        value: userId,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

/**
 * Reset patch state (for testing).
 */
export function resetQueryPatch(): void {
  isPatched = false;
}

export default { patchQueryPrototype, registerQueryMiddleware, resetQueryPatch };
