/**
 * FieldShield v1 - Document Transformation
 *
 * Patches document toJSON and toObject methods to automatically
 * filter fields based on stored role context.
 */

import type { Mongoose, Schema } from 'mongoose';
import { FilterOptions } from './types';
import { PolicyRegistry } from './registry';
import { filterDocument } from './filter';

/**
 * Add toJSON/toObject filtering to a schema.
 * Called during schema registration.
 */
export function patchSchemaTransforms(schema: Schema, modelName: string): void {
  // ============================================================================
  // toJSON transform
  // ============================================================================

  const originalToJSON = schema.get('toJSON') || {};

  schema.set('toJSON', {
    ...originalToJSON,
    transform: function (doc: any, ret: any, options: any) {
      // Call original transform if present and is a function
      if (originalToJSON.transform && typeof originalToJSON.transform === 'function') {
        ret = originalToJSON.transform(doc, ret, options);
      }

      // Check for role context on document
      const roles = doc._shieldRoles;
      if (!roles) {
        // No role context = no filtering
        // This happens when doc wasn't retrieved via shielded query
        return ret;
      }

      const filterOptions: FilterOptions = {
        roles,
        userId: doc._shieldUserId,
      };

      // Filter synchronously if possible, async transforms not fully supported in toJSON
      return filterDocumentSync(ret, modelName, filterOptions);
    },
  });

  // ============================================================================
  // toObject transform
  // ============================================================================

  const originalToObject = schema.get('toObject') || {};

  schema.set('toObject', {
    ...originalToObject,
    transform: function (doc: any, ret: any, options: any) {
      // Call original transform if present and is a function
      if (originalToObject.transform && typeof originalToObject.transform === 'function') {
        ret = originalToObject.transform(doc, ret, options);
      }

      // Check for role context on document
      const roles = doc._shieldRoles;
      if (!roles) {
        return ret;
      }

      const filterOptions: FilterOptions = {
        roles,
        userId: doc._shieldUserId,
      };

      return filterDocumentSync(ret, modelName, filterOptions);
    },
  });
}

/**
 * Synchronous document filtering for toJSON/toObject.
 * Note: Async conditions are not supported in transforms.
 */
function filterDocumentSync(
  doc: Record<string, any>,
  modelName: string,
  options: FilterOptions
): Record<string, any> {
  const policy = PolicyRegistry.getModelPolicy(modelName);
  if (!policy) return doc;

  const result: Record<string, any> = {};

  for (const [field, value] of Object.entries(doc)) {
    const config = policy.get(field);

    if (!config) {
      // No shield config for this field - skip it
      continue;
    }

    // Check role access
    if (!checkRoleAccessSync(config.roles, options.roles)) {
      continue;
    }

    // Check condition (sync only)
    if (config.condition) {
      // For toJSON/toObject, we can only handle sync conditions
      // Async conditions won't work correctly here
      const ctx = {
        roles: options.roles,
        userId: options.userId,
        document: doc,
        field,
        model: modelName,
      };

      try {
        const result = config.condition(ctx);
        // If condition returns a promise, we can't handle it synchronously
        if (result instanceof Promise) {
          console.warn(
            `[FieldShield] Async condition for ${modelName}.${field} used in toJSON/toObject. ` +
            `Use synchronous conditions or filter via query.`
          );
          continue; // Skip field for safety
        }
        if (!result) {
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

    // Apply transform (sync only)
    let finalValue = value;
    if (config.transform) {
      const ctx = {
        roles: options.roles,
        userId: options.userId,
        document: doc,
        field,
        model: modelName,
      };

      try {
        const transformed = config.transform(value, ctx);
        if (transformed instanceof Promise) {
          console.warn(
            `[FieldShield] Async transform for ${modelName}.${field} used in toJSON/toObject. ` +
            `Use synchronous transforms or filter via query.`
          );
          finalValue = value; // Use original value
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
 * Synchronous role access check.
 */
function checkRoleAccessSync(allowedRoles: string[], userRoles: string[]): boolean {
  if (allowedRoles.length === 0) return false;
  if (allowedRoles.includes('*')) return true;
  if (allowedRoles.includes('public')) return true;
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Attach role context to a document.
 * Used after query execution to enable filtered toJSON/toObject.
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

  // Use Object.defineProperty to make properties non-enumerable
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

export default { patchSchemaTransforms, attachRoleContext };
