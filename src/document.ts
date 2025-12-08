/**
 * FieldShield v2 - Document Transformation
 *
 * Enhanced toJSON/toObject transforms that:
 * 1. Evaluate condition-based access post-fetch
 * 2. Apply transforms to field values
 * 3. Work with the projection-based architecture
 */

import type { Schema } from 'mongoose';
import { PolicyRegistry, checkRoleAccess } from './registry';

/**
 * Attach role context to a document for toJSON/toObject filtering.
 * Called from query post-middleware.
 */
export function attachRoleContext(
  doc: any,
  roles: string[],
  userId?: string
): void {
  if (!doc) return;

  if (Array.isArray(doc)) {
    doc.forEach((d) => attachRoleContext(d, roles, userId));
    return;
  }

  // Only attach to objects
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
 * Register toJSON/toObject transforms on a schema.
 * Handles condition evaluation and transforms post-fetch.
 *
 * @param schema - Mongoose schema to add transforms to
 * @param modelName - Name of the model for policy lookup
 */
export function registerDocumentTransforms(
  schema: Schema,
  modelName: string
): void {
  // ============================================================================
  // toJSON transform
  // ============================================================================

  const originalToJSON = schema.get('toJSON') || {};

  schema.set('toJSON', {
    ...originalToJSON,
    transform: function (doc: any, ret: any, options: any) {
      // Call original transform if present
      if (originalToJSON.transform && typeof originalToJSON.transform === 'function') {
        ret = originalToJSON.transform(doc, ret, options);
      }

      // Get role context from document
      const roles = doc._shieldRoles;
      if (!roles) {
        // No role context = no filtering (document wasn't retrieved via shielded query)
        return ret;
      }

      return applyPostFiltering(ret, modelName, {
        roles,
        userId: doc._shieldUserId,
      });
    },
  });

  // ============================================================================
  // toObject transform
  // ============================================================================

  const originalToObject = schema.get('toObject') || {};

  schema.set('toObject', {
    ...originalToObject,
    transform: function (doc: any, ret: any, options: any) {
      // Call original transform if present
      if (originalToObject.transform && typeof originalToObject.transform === 'function') {
        ret = originalToObject.transform(doc, ret, options);
      }

      // Get role context from document
      const roles = doc._shieldRoles;
      if (!roles) {
        return ret;
      }

      return applyPostFiltering(ret, modelName, {
        roles,
        userId: doc._shieldUserId,
      });
    },
  });
}

/**
 * Apply post-filtering to a document for conditions and transforms.
 * Called from toJSON/toObject transforms.
 */
function applyPostFiltering(
  ret: Record<string, any>,
  modelName: string,
  context: { roles: string[]; userId?: string }
): Record<string, any> {
  const policy = PolicyRegistry.getModelPolicy(modelName);
  if (!policy) return ret;

  const result: Record<string, any> = {};

  for (const [field, value] of Object.entries(ret)) {
    const config = policy.get(field);

    // If field has no config, check if it's _id (always allowed)
    if (!config) {
      if (field === '_id' || field === '__v') {
        result[field] = value;
      }
      continue;
    }

    // Check role access first
    if (!checkRoleAccess(config.roles, context.roles)) {
      continue;
    }

    // Check condition if present
    if (config.condition) {
      const ctx = {
        roles: context.roles,
        userId: context.userId,
        document: ret,
        field,
        model: modelName,
      };

      try {
        const conditionResult = config.condition(ctx);

        // Handle async conditions (warn and skip)
        if (conditionResult instanceof Promise) {
          console.warn(
            `[FieldShield] Async condition for ${modelName}.${field} used in toJSON/toObject. ` +
              `Use synchronous conditions or handle filtering in query middleware.`
          );
          continue;
        }

        if (!conditionResult) {
          continue;
        }
      } catch (error) {
        console.warn(
          `[FieldShield] Condition error for ${modelName}.${field}:`,
          error
        );
        continue;
      }
    }

    // Apply transform if present
    let finalValue = value;
    if (config.transform) {
      const ctx = {
        roles: context.roles,
        userId: context.userId,
        document: ret,
        field,
        model: modelName,
      };

      try {
        const transformed = config.transform(value, ctx);

        // Handle async transforms (warn and use original)
        if (transformed instanceof Promise) {
          console.warn(
            `[FieldShield] Async transform for ${modelName}.${field} used in toJSON/toObject. ` +
              `Use synchronous transforms.`
          );
          finalValue = value;
        } else {
          finalValue = transformed;
        }
      } catch (error) {
        console.warn(
          `[FieldShield] Transform error for ${modelName}.${field}:`,
          error
        );
      }
    }

    result[field] = finalValue;
  }

  return result;
}

/**
 * Helper function for filtering lean query results.
 * Use this when you need to filter results from .lean() queries.
 */
export function filterLeanDocument(
  doc: Record<string, any>,
  modelName: string,
  roles: string[],
  userId?: string
): Record<string, any> {
  return applyPostFiltering(doc, modelName, { roles, userId });
}

/**
 * Helper function for filtering an array of lean documents.
 */
export function filterLeanDocuments(
  docs: Record<string, any>[],
  modelName: string,
  roles: string[],
  userId?: string
): Record<string, any>[] {
  return docs.map((doc) => filterLeanDocument(doc, modelName, roles, userId));
}

export default {
  attachRoleContext,
  registerDocumentTransforms,
  filterLeanDocument,
  filterLeanDocuments,
};
