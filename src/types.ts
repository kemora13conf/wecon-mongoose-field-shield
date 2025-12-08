/**
 * FieldShield v1 - Type Definitions
 *
 * Complete TypeScript types for the native Mongoose field-level access control plugin.
 */

import type { Document, Query, Model, Schema, Mongoose } from 'mongoose';

// ============================================================================
// Core Shield Configuration
// ============================================================================

/**
 * Shield configuration for a single schema field.
 * Defines who can access the field and under what conditions.
 */
export interface ShieldConfig {
  /**
   * Roles that can read this field.
   * - Empty array `[]` = hidden from ALL roles (even admin)
   * - `['*']` = visible to all authenticated users
   * - `['public']` = visible to everyone including unauthenticated
   * - `['admin', 'user']` = visible only to these specific roles
   */
  roles: string[];

  /**
   * Optional condition for dynamic access control.
   * Returns true if the current user can access this field.
   *
   * @example
   * // Only owner can see their own email
   * condition: (ctx) => ctx.document._id.equals(ctx.userId)
   */
  condition?: ShieldCondition;

  /**
   * Optional transform function to modify value before returning.
   * Useful for masking sensitive data for certain roles.
   *
   * @example
   * // Mask phone number for non-admins
   * transform: (value, ctx) =>
   *   ctx.roles.includes('admin') ? value : `***-${value.slice(-4)}`
   */
  transform?: ShieldTransform;
}

/**
 * Condition function for dynamic field access.
 * Can be sync or async.
 */
export type ShieldCondition = (ctx: ShieldContext) => boolean | Promise<boolean>;

/**
 * Transform function to modify field values.
 */
export type ShieldTransform = (value: any, ctx: ShieldContext) => any;

/**
 * Context passed to conditions and transforms.
 */
export interface ShieldContext {
  /** Current user's roles */
  roles: string[];
  /** Current user's ID (if available) */
  userId?: string;
  /** The full document being accessed (for owner checks) */
  document: Record<string, any>;
  /** The field name being accessed */
  field: string;
  /** The model name */
  model: string;
}

// ============================================================================
// Policy Registry Types
// ============================================================================

/**
 * Field policies for a single model.
 * Maps field name -> shield config.
 */
export type ModelPolicy = Map<string, ShieldConfig>;

/**
 * Global registry storing all model policies.
 */
export interface IPolicyRegistry {
  /** Register policies for a model */
  register(modelName: string, fields: ModelPolicy): void;
  /** Get shield config for a specific field */
  getFieldConfig(modelName: string, field: string): ShieldConfig | undefined;
  /** Get all field configs for a model */
  getModelPolicy(modelName: string): ModelPolicy | undefined;
  /** Check if model has any policies */
  hasModel(modelName: string): boolean;
  /** Validate all fields have shield config (for strict mode) */
  validateStrict(modelName: string, schemaFields: string[]): ValidationResult;
  /** Get all registered model names */
  getRegisteredModels(): string[];
  /** Clear all policies (for testing) */
  clear(): void;
}

/**
 * Result of strict validation.
 */
export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

// ============================================================================
// Installation Options
// ============================================================================

/**
 * Options for installFieldShield().
 */
export interface ShieldOptions {
  /**
   * Throw error if any schema field lacks shield config.
   * @default true
   */
  strict?: boolean;

  /**
   * Log registered models and warnings at startup.
   * @default process.env.NODE_ENV !== 'production'
   */
  debug?: boolean;

  /**
   * Default roles for fields without explicit shield config.
   * Only used when strict=false.
   * @default [] (hidden)
   */
  defaultRoles?: string[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error info structure for ShieldError.
 * Following ErrorCatcher pattern.
 */
export interface ShieldErrorInfo {
  /** Short error title */
  title: string;
  /** Detailed explanation */
  details: string;
  /** How to fix the error */
  fix: string;
}

/**
 * Stack trace info for error location.
 */
export interface ShieldErrorTrace {
  file: string;
  line: number;
  column: number;
  function: string | null;
}

// ============================================================================
// Mongoose Extensions
// ============================================================================

/**
 * Symbol used to store role context on queries/documents.
 */
export const SHIELD_ROLES = Symbol('shield:roles');
export const SHIELD_USER_ID = Symbol('shield:userId');

/**
 * Extended schema path options to include shield.
 */
export interface ShieldSchemaTypeOptions {
  shield?: ShieldConfig;
}

// ============================================================================
// Mongoose Module Augmentation
// ============================================================================

declare module 'mongoose' {
  // Extend SchemaTypeOptions to include shield
  interface SchemaTypeOptions<T> {
    /**
     * FieldShield configuration for this field.
     * Defines role-based access control.
     */
    shield?: ShieldConfig;
  }

  // Extend Query to include FieldShield methods
  interface Query<ResultType, DocType, THelpers = {}, RawDocType = unknown, QueryOp = 'find', TDocOverrides = Record<string, never>> {
    /**
     * Specify roles for field filtering.
     * REQUIRED - queries without .role() will throw.
     *
     * @param roles Single role or array of roles
     * @returns The query for chaining
     *
     * @example
     * await User.find().role(['admin']);
     * await User.findById(id).role('user');
     */
    role(roles: string | string[]): this;

    /**
     * Specify user ID for owner-based conditions.
     *
     * @param userId The current user's ID
     * @returns The query for chaining
     */
    userId(id: string): this;

    /**
     * Bypass FieldShield for internal queries.
     * Use with caution - no field filtering will be applied.
     *
     * @returns The query for chaining
     */
    bypassShield(): this;

    /** @internal Shield roles stored on query */
    _shieldRoles?: string[];
    /** @internal User ID stored on query */
    _shieldUserId?: string;
    /** @internal Shield bypass flag */
    _shieldBypassed?: boolean;
  }

  // Extend Aggregate to include FieldShield methods
  interface Aggregate<ResultType> {
    /**
     * Specify roles for field filtering in aggregation.
     * REQUIRED - aggregations without .role() will throw.
     *
     * @param roles Single role or array of roles
     * @returns The aggregate for chaining
     *
     * @example
     * await User.aggregate(pipeline).role(['admin']);
     */
    role(roles: string | string[]): this;

    /**
     * Specify user ID for owner-based conditions.
     *
     * @param userId The current user's ID
     * @returns The aggregate for chaining
     */
    userId(id: string): this;

    /**
     * Bypass FieldShield for internal aggregations.
     * Use with caution - no field filtering will be applied.
     *
     * @returns The aggregate for chaining
     */
    bypassShield(): this;

    /** @internal Shield roles stored on aggregate */
    _shieldRoles?: string[];
    /** @internal User ID stored on aggregate */
    _shieldUserId?: string;
    /** @internal Shield bypass flag */
    _shieldBypassed?: boolean;
  }

  // Extend Document for role context
  interface Document {
    /** @internal Shield roles stored on document */
    [SHIELD_ROLES]?: string[];
    /** @internal User ID stored on document */
    [SHIELD_USER_ID]?: string;
  }
}

// ============================================================================
// Filter Function Types
// ============================================================================

/**
 * Options for filtering documents.
 */
export interface FilterOptions {
  /** Roles for access control */
  roles: string[];
  /** User ID for owner conditions */
  userId?: string;
  /** Populated paths with their ref model names */
  populatePaths?: Map<string, string>;
}

/**
 * Filter a single document.
 */
export type FilterDocumentFn = (
  doc: Record<string, any>,
  modelName: string,
  options: FilterOptions
) => Promise<Record<string, any>>;

/**
 * Filter multiple documents.
 */
export type FilterDocumentsFn = (
  docs: Record<string, any>[],
  modelName: string,
  options: FilterOptions
) => Promise<Record<string, any>[]>;
