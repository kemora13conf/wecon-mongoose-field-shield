/**
 * FieldShield v1 - Query Interception
 *
 * Patches Mongoose Query prototype to:
 * 1. Add .role() chainable method
 * 2. Add .userId() chainable method
 * 3. Override exec() to validate role and filter results
 */

import type { Mongoose, Query } from 'mongoose';
import { FilterOptions } from './types';
import { ShieldError } from './errors';
import { PolicyRegistry } from './registry';
import { filterDocument, filterDocuments, filterWithPopulate } from './filter';

/**
 * Patch Mongoose Query prototype with FieldShield methods.
 */
export function patchQueryPrototype(mongoose: Mongoose): void {
  const QueryPrototype = mongoose.Query.prototype as any;

  // ============================================================================
  // Add .role() method
  // ============================================================================

  /**
   * Specify roles for field filtering.
   * REQUIRED on all queries.
   *
   * @param roles - Single role or array of roles
   * @returns Query for chaining
   */
  QueryPrototype.role = function (roles: string | string[]): Query<any, any> {
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
   * @returns Query for chaining
   */
  QueryPrototype.userId = function (id: string): Query<any, any> {
    this._shieldUserId = id;
    return this;
  };

  // ============================================================================
  // Override exec() to validate and filter
  // ============================================================================

  const originalExec = QueryPrototype.exec;

  QueryPrototype.exec = async function (): Promise<any> {
    const modelName = this.model.modelName;
    const operation = this.op;

    // Check if role was specified
    const roles = this._shieldRoles;
    if (!roles) {
      ShieldError.missingRole(modelName, operation);
    }

    // Check if model is registered (strict mode validation happens at schema compile time)
    if (!PolicyRegistry.hasModel(modelName)) {
      // Model has no shield config - pass through
      // This allows non-shielded models to work normally
      return originalExec.call(this);
    }

    // Execute the original query
    const result = await originalExec.call(this);

    if (!result) return result;

    // Build filter options
    const filterOptions: FilterOptions = {
      roles,
      userId: this._shieldUserId,
      populatePaths: this._mongooseOptions?.populate
        ? extractPopulatePaths(this._mongooseOptions.populate)
        : undefined,
    };

    // Filter the result
    if (Array.isArray(result)) {
      // Handle populate paths if present
      if (filterOptions.populatePaths && filterOptions.populatePaths.size > 0) {
        return Promise.all(
          result.map((doc) =>
            filterWithPopulate(doc, modelName, filterOptions)
          )
        );
      }
      return filterDocuments(result, modelName, filterOptions);
    } else {
      if (filterOptions.populatePaths && filterOptions.populatePaths.size > 0) {
        return filterWithPopulate(result, modelName, filterOptions);
      }
      return filterDocument(result, modelName, filterOptions);
    }
  };

  // ============================================================================
  // Override then() for queries used with await
  // ============================================================================

  // Mongoose queries are thenable, so we need to ensure exec() is called
  // The default then() already calls exec(), so this should work automatically
}

/**
 * Extract populate paths and their ref models from query options.
 */
function extractPopulatePaths(
  populateOptions: any
): Map<string, string> | undefined {
  const paths = new Map<string, string>();

  if (!populateOptions) return undefined;

  // Handle different populate formats
  if (typeof populateOptions === 'string') {
    // Simple string path - we need the ref from schema
    // This will be looked up during filtering
    return undefined;
  }

  if (Array.isArray(populateOptions)) {
    for (const opt of populateOptions) {
      extractSinglePopulate(opt, paths);
    }
  } else if (typeof populateOptions === 'object') {
    for (const [path, opt] of Object.entries(populateOptions)) {
      if (typeof opt === 'object' && (opt as any).model) {
        paths.set(path, (opt as any).model);
      }
    }
  }

  return paths.size > 0 ? paths : undefined;
}

/**
 * Extract single populate option.
 */
function extractSinglePopulate(
  opt: any,
  paths: Map<string, string>
): void {
  if (typeof opt === 'string') {
    // Path only - need to look up ref from schema
    return;
  }

  if (typeof opt === 'object') {
    if (opt.path && opt.model) {
      paths.set(opt.path, opt.model);
    } else if (opt.path && typeof opt.path === 'string') {
      // Path without explicit model - will use schema ref
      // Store path, model will be resolved during filtering
    }
  }
}

export default { patchQueryPrototype };
