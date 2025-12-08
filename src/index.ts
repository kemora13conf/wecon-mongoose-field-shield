/**
 * FieldShield v2 - Field-Level Access Control for Mongoose
 *
 * A native Mongoose global plugin that provides role-based field filtering
 * using projection-based architecture for performance and Mongoose integrity.
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
 * // Query with role - returns real Mongoose Document
 * const user = await User.findOne().role(['admin']);
 * user.name = 'Updated';
 * await user.save(); // Works!
 *
 * // Aggregation with role
 * const results = await User.aggregate([{ $match: {} }]).role('admin');
 */

// Main installation function
export { installFieldShield, getShieldDebugInfo, clearShield, isShieldInstalled } from './install';

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
export { PolicyRegistry, parseSchemaShield, calculateAllowedFields, checkRoleAccess } from './registry';

// Document utilities
export { attachRoleContext, filterLeanDocument, filterLeanDocuments } from './document';

// Query utilities (for testing)
export { resetQueryPatch } from './query';

// Aggregate utilities (for testing)
export { resetAggregatePatch } from './aggregate';
