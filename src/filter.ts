/**
 * FieldShield v1 - Filter Engine
 *
 * Core filtering logic that processes documents and removes
 * fields the current user isn't authorized to see.
 */

import { ShieldConfig, ShieldContext, FilterOptions } from './types';
import { PolicyRegistry } from './registry';
import { ShieldError } from './errors';

/**
 * Filter a single document based on user roles.
 *
 * @param doc - The document to filter (plain object or Mongoose doc)
 * @param modelName - The model name for policy lookup
 * @param options - Filter options with roles and userId
 * @returns Filtered document with only authorized fields
 */
export async function filterDocument(
  doc: Record<string, any>,
  modelName: string,
  options: FilterOptions
): Promise<Record<string, any>> {
  if (!doc) return doc;

  const policy = PolicyRegistry.getModelPolicy(modelName);
  if (!policy) {
    // No policy = no filtering (shouldn't happen in strict mode)
    return doc;
  }

  // Convert Mongoose document to plain object if needed
  const plainDoc = toPlainObject(doc);
  const result: Record<string, any> = {};

  // Process each field in the document
  for (const [field, value] of Object.entries(plainDoc)) {
    const allowed = await checkFieldAccess(
      field,
      value,
      plainDoc,
      modelName,
      policy,
      options
    );

    if (allowed.accessible) {
      result[field] = allowed.value;
    }
  }

  return result;
}

/**
 * Filter an array of documents.
 */
export async function filterDocuments(
  docs: Record<string, any>[],
  modelName: string,
  options: FilterOptions
): Promise<Record<string, any>[]> {
  if (!docs || !Array.isArray(docs)) return docs;

  return Promise.all(
    docs.map((doc) => filterDocument(doc, modelName, options))
  );
}

/**
 * Filter a document including populated paths.
 * Recursively filters nested referenced documents.
 */
export async function filterWithPopulate(
  doc: Record<string, any>,
  modelName: string,
  options: FilterOptions
): Promise<Record<string, any>> {
  if (!doc) return doc;

  const policy = PolicyRegistry.getModelPolicy(modelName);
  if (!policy) return doc;

  const plainDoc = toPlainObject(doc);
  const result: Record<string, any> = {};

  for (const [field, value] of Object.entries(plainDoc)) {
    const fieldConfig = policy.get(field);

    // Check if this is a populated path
    if (options.populatePaths?.has(field) && value && typeof value === 'object') {
      const refModel = options.populatePaths.get(field)!;

      // First check if user can see this field at all
      const allowed = await checkFieldAccess(
        field,
        value,
        plainDoc,
        modelName,
        policy,
        options
      );

      if (allowed.accessible) {
        // Filter the populated document with its own model's policy
        if (Array.isArray(value)) {
          result[field] = await filterDocuments(value, refModel, options);
        } else {
          result[field] = await filterDocument(value, refModel, options);
        }
      }
    } else {
      // Regular field
      const allowed = await checkFieldAccess(
        field,
        value,
        plainDoc,
        modelName,
        policy,
        options
      );

      if (allowed.accessible) {
        result[field] = allowed.value;
      }
    }
  }

  return result;
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface FieldAccessResult {
  accessible: boolean;
  value: any;
}

/**
 * Check if a user can access a specific field.
 */
async function checkFieldAccess(
  field: string,
  value: any,
  document: Record<string, any>,
  modelName: string,
  policy: Map<string, ShieldConfig>,
  options: FilterOptions
): Promise<FieldAccessResult> {
  const config = policy.get(field);

  // No config = field not defined in shield
  // This shouldn't happen in strict mode
  if (!config) {
    return { accessible: false, value: undefined };
  }

  // Check role access
  if (!checkRoleAccess(config.roles, options.roles)) {
    return { accessible: false, value: undefined };
  }

  // Check condition if present
  if (config.condition) {
    const ctx: ShieldContext = {
      roles: options.roles,
      userId: options.userId,
      document,
      field,
      model: modelName,
    };

    try {
      const conditionResult = await config.condition(ctx);
      if (!conditionResult) {
        return { accessible: false, value: undefined };
      }
    } catch (error) {
      ShieldError.conditionFailed(modelName, field, error as Error);
    }
  }

  // Apply transform if present
  let finalValue = value;
  if (config.transform) {
    const ctx: ShieldContext = {
      roles: options.roles,
      userId: options.userId,
      document,
      field,
      model: modelName,
    };

    try {
      finalValue = await config.transform(value, ctx);
    } catch (error) {
      // Transform errors are logged but don't block access
      console.warn(
        `[FieldShield] Transform failed for ${modelName}.${field}:`,
        error
      );
    }
  }

  return { accessible: true, value: finalValue };
}

/**
 * Check if user roles match any allowed roles.
 */
function checkRoleAccess(allowedRoles: string[], userRoles: string[]): boolean {
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
 * Convert Mongoose document to plain object.
 */
function toPlainObject(doc: any): Record<string, any> {
  if (!doc) return doc;

  // Already a plain object
  if (doc.constructor?.name === 'Object') {
    return doc;
  }

  // Mongoose document with toObject
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: true, getters: true });
  }

  // Has _doc (Mongoose internal)
  if (doc._doc) {
    return { ...doc._doc };
  }

  // Fallback: spread
  return { ...doc };
}

export default { filterDocument, filterDocuments, filterWithPopulate };
