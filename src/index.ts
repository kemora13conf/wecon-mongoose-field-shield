/**
 * FieldShield v1 - Field-Level Access Control for Mongoose
 *
 * A native Mongoose global plugin that provides role-based field filtering.
 *
 * @example
 * import mongoose from 'mongoose';
 * import { installFieldShield } from 'field-shield';
 *
 * // Install before defining models
 * installFieldShield(mongoose, { strict: true });
 *
 * // Define schema with shield config
 * const UserSchema = new mongoose.Schema({
 *   email: { type: String, shield: { roles: ['admin', 'user'] } },
 *   password: { type: String, shield: { roles: [] } }
 * });
 *
 * // Query with role
 * const users = await User.find().role(['admin']);
 */

// Main installation function
export { installFieldShield, getShieldDebugInfo, clearShield } from './install';

// Types
export type {
  ShieldConfig,
  ShieldContext,
  ShieldCondition,
  ShieldTransform,
  ShieldOptions,
  FilterOptions,
  ShieldErrorInfo,
  ShieldErrorTrace,
} from './types';

export { SHIELD_ROLES, SHIELD_USER_ID } from './types';

// Error handling
export { ShieldError } from './errors';

// Registry (for advanced use)
export { PolicyRegistry, parseSchemaShield } from './registry';

// Filter functions (for manual filtering)
export {
  filterDocument,
  filterDocuments,
  filterWithPopulate,
} from './filter';

// Document utilities
export { attachRoleContext } from './document';
