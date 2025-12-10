/**
 * FieldShield v2.1 - Installation
 *
 * Main entry point for installing FieldShield into Mongoose.
 * Uses native middleware patterns for Mongoose-friendly integration.
 *
 * Call this BEFORE defining any models.
 */

import type { Mongoose, Schema } from 'mongoose';
import chalk from 'chalk';
import { ShieldOptions } from './types';
import { PolicyRegistry, parseSchemaShield } from './registry';
import { patchQueryPrototype, resetQueryPatch } from './query';
import { patchAggregatePrototype, resetAggregatePatch } from './aggregate';
import { registerDocumentTransforms } from './document';
import { ShieldError } from './errors';
import { calculateAllowedFields, checkRoleAccess } from './registry';
import {
  findSafeProjectInsertIndex,
  findProjectStageIndex,
  mergeProjections,
  validatePipelineForShield,
} from './pipeline-utils';

// Track installation state
let isInstalled = false;
let globalStrict = true;
let globalDebug = false;

/**
 * Install FieldShield into Mongoose.
 *
 * MUST be called before defining any models.
 *
 * @param mongoose - Mongoose instance
 * @param options - Configuration options
 *
 * @example
 * import mongoose from 'mongoose';
 * import { installFieldShield } from '@wecon/mongoose-field-shield';
 *
 * // Call first!
 * installFieldShield(mongoose, { strict: true });
 *
 * // Then define models
 * const UserSchema = new mongoose.Schema({
 *   email: { type: String, shield: { roles: ['admin', 'user'] } },
 *   password: { type: String, shield: { roles: [] } }
 * });
 */
export function installFieldShield(
  mongoose: Mongoose,
  options: ShieldOptions = {}
): void {
  const {
    strict = true,
    debug = process.env.NODE_ENV !== 'production',
    defaultRoles: _defaultRoles = [],
  } = options;

  globalStrict = strict;
  globalDebug = debug;

  if (debug) {
    console.log(
      chalk.cyan.bold('\n🛡️  FieldShield v2.1') +
        chalk.white(' installing...') +
        chalk.gray(` (strict: ${strict})`) +
        '\n'
    );
  }

  // ============================================================================
  // 1. Patch Query prototype with .role(), .userId(), .bypassShield() methods
  // ============================================================================

  patchQueryPrototype(mongoose);

  // ============================================================================
  // 2. Patch Aggregate prototype with .role(), .userId(), .bypassShield() methods
  // ============================================================================

  patchAggregatePrototype(mongoose);

  // ============================================================================
  // 3. Register global plugin that sets up per-schema middleware
  //    Middleware is registered immediately; model name resolved at runtime
  // ============================================================================

  mongoose.plugin(function fieldShieldPlugin(schema: Schema) {
    // Store options on schema for access in middleware
    (schema as any)._shieldOptions = { strict, debug };

    // Track if this schema has been processed (lazy init)
    const processedModels = new Set<string>();

    // ========================================================================
    // Register Pre-Query Middleware (handles projection)
    // ========================================================================
    const queryOps = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'] as const;

    for (const op of queryOps) {
      schema.pre(op, function (this: any) {
        // Get model name dynamically
        const modelName = this.model?.modelName;
        if (!modelName) return;

        // Lazy registration: parse and register policy on first query
        // Use globalStrict/globalDebug to allow test resets
        if (!processedModels.has(modelName) && !PolicyRegistry.hasModel(modelName)) {
          registerModelPolicyFromSchema(schema, modelName, globalStrict, globalDebug);
          processedModels.add(modelName);
        }

        // Now apply the shield logic
        if (this._shieldBypassed) return;
        if (!PolicyRegistry.hasModel(modelName)) return;

        const roles = this._shieldRoles;
        if (!roles) {
          ShieldError.missingRole(modelName, op);
        }

        // Calculate which fields to select
        const { selectFields, conditionFields } = calculateAllowedFields(modelName, roles);

        // Apply projection
        const projectionObj: Record<string, 1> = {};
        for (const field of selectFields) {
          projectionObj[field] = 1;
        }
        this.select(projectionObj);

        // Store context for post-processing
        this.setOptions({
          _shieldConditionFields: conditionFields,
          _shieldRoles: roles,
          _shieldUserId: this._shieldUserId,
        });
      });

      // Post middleware to attach role context
      schema.post(op, function (this: any, result: any) {
        if (this._shieldBypassed || !result) return;

        const roles = this._shieldRoles || this.getOptions()?._shieldRoles;
        const userId = this._shieldUserId || this.getOptions()?._shieldUserId;
        if (!roles) return;

        attachRoleContext(result, roles, userId);
      });
    }

    // ========================================================================
    // Register Pre-Aggregate Middleware
    // ========================================================================
    schema.pre('aggregate', function (this: any) {
      const modelName = (this as any)._model?.modelName;
      if (!modelName) return;

      // Lazy registration
      if (!processedModels.has(modelName) && !PolicyRegistry.hasModel(modelName)) {
        registerModelPolicyFromSchema(schema, modelName, globalStrict, globalDebug);
        processedModels.add(modelName);
      }

      if (this._shieldBypassed) return;
      if (!PolicyRegistry.hasModel(modelName)) return;

      const roles = this._shieldRoles;
      if (!roles) {
        ShieldError.missingRoleOnAggregate(modelName);
      }

      // Calculate allowed fields
      const { selectFields } = calculateAllowedFields(modelName, roles);

      const pipeline = this.pipeline();

      // Validate pipeline and log warnings in debug mode
      if (globalDebug) {
        const warnings = validatePipelineForShield(pipeline);
        for (const warning of warnings) {
          console.warn(chalk.yellow(`[FieldShield] ${modelName}:`), warning);
        }
      }

      // Check for existing $project stage
      const existingProjectIndex = findProjectStageIndex(pipeline);

      if (existingProjectIndex >= 0) {
        // Merge with existing $project
        const existingProject = pipeline[existingProjectIndex].$project;
        const merged = mergeProjections(existingProject, selectFields);
        pipeline[existingProjectIndex] = { $project: merged };
      } else {
        // Insert new $project stage at safe position
        const projectStage: Record<string, 1> = {};
        for (const field of selectFields) {
          projectStage[field] = 1;
        }

        const insertIndex = findSafeProjectInsertIndex(pipeline);
        pipeline.splice(insertIndex, 0, { $project: projectStage });
      }
    });

    // ========================================================================
    // Register Document Transforms (toJSON, toObject)
    // ========================================================================
    registerDocumentTransformsForSchema(schema, processedModels, globalStrict, globalDebug);
  });

  isInstalled = true;

  if (debug) {
    console.log(chalk.cyan('  FieldShield v2.1 ready!\n'));
  }
}

/**
 * Register policy from schema (lazy initialization).
 */
function registerModelPolicyFromSchema(
  schema: Schema,
  modelName: string,
  strict: boolean,
  debug: boolean
): void {
  try {
    const { policy, schemaFields } = parseSchemaShield(schema, modelName);

    if (policy.size === 0) {
      if (debug) {
        console.log(chalk.gray(`  ○ Skipped: ${modelName} (no shield config)`));
      }
      return;
    }

    // Strict mode validation
    if (strict) {
      for (const field of schemaFields) {
        if (field === '_id' || field === '__v' || field.startsWith('_')) continue;
        
        // Check if field has direct policy
        if (policy.has(field)) continue;
        
        // Check if field is covered by a parent policy (synthesized or explicit)
        // e.g., 'preferences.theme' is covered if 'preferences' has a policy
        const parts = field.split('.');
        let isCoveredByParent = false;
        for (let i = 1; i < parts.length; i++) {
          const parentPath = parts.slice(0, i).join('.');
          if (policy.has(parentPath)) {
            isCoveredByParent = true;
            break;
          }
        }
        if (isCoveredByParent) continue;
        
        // Check if field has children with policies (it's a parent of shielded fields)
        // e.g., 'addresses' is covered if 'addresses.street' has a policy
        const hasChildPolicies = Array.from(policy.keys()).some(
          p => p.startsWith(field + '.')
        );
        if (hasChildPolicies) continue;
        
        ShieldError.missingShieldConfig(modelName, field);
      }
    }

    PolicyRegistry.register(modelName, policy);

    if (debug) {
      console.log(
        chalk.green('  ✓') +
          chalk.white(` Registered: ${modelName}`) +
          chalk.gray(` (${policy.size} shielded fields)`)
      );
    }
  } catch (error) {
    if (error instanceof ShieldError) throw error;
    console.error(chalk.red(`  ✗ Failed to register ${modelName}:`), error);
  }
}

/**
 * Register toJSON/toObject transforms on schema.
 */
function registerDocumentTransformsForSchema(
  schema: Schema,
  processedModels: Set<string>,
  strict: boolean,
  debug: boolean
): void {
  const originalToJSON = schema.get('toJSON') || {};

  schema.set('toJSON', {
    ...originalToJSON,
    transform: function (doc: any, ret: any, options: any) {
      if (originalToJSON.transform && typeof originalToJSON.transform === 'function') {
        ret = originalToJSON.transform(doc, ret, options);
      }

      const roles = doc._shieldRoles;
      if (!roles) return ret;

      // Get model name from document
      const modelName = doc.constructor?.modelName;
      if (!modelName) return ret;

      // Ensure policy is registered
      if (!PolicyRegistry.hasModel(modelName)) {
        registerModelPolicyFromSchema(doc.schema, modelName, globalStrict, globalDebug);
        processedModels.add(modelName);
      }

      return applyPostFiltering(ret, modelName, { roles, userId: doc._shieldUserId });
    },
  });

  const originalToObject = schema.get('toObject') || {};

  schema.set('toObject', {
    ...originalToObject,
    transform: function (doc: any, ret: any, options: any) {
      if (originalToObject.transform && typeof originalToObject.transform === 'function') {
        ret = originalToObject.transform(doc, ret, options);
      }

      const roles = doc._shieldRoles;
      if (!roles) return ret;

      const modelName = doc.constructor?.modelName;
      if (!modelName) return ret;

      if (!PolicyRegistry.hasModel(modelName)) {
        registerModelPolicyFromSchema(doc.schema, modelName, globalStrict, globalDebug);
        processedModels.add(modelName);
      }

      return applyPostFiltering(ret, modelName, { roles, userId: doc._shieldUserId });
    },
  });
}

/**
 * Apply post-filtering for conditions and transforms.
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

    if (!config) {
      if (field === '_id' || field === '__v') {
        result[field] = value;
      }
      continue;
    }

    if (!checkRoleAccess(config.roles, context.roles)) continue;

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
        if (conditionResult instanceof Promise) {
          console.warn(`[FieldShield] Async condition for ${modelName}.${field} in toJSON. Use sync conditions.`);
          continue;
        }
        if (!conditionResult) continue;
      } catch (error) {
        console.warn(`[FieldShield] Condition error for ${modelName}.${field}:`, error);
        continue;
      }
    }

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
        if (transformed instanceof Promise) {
          console.warn(`[FieldShield] Async transform for ${modelName}.${field}. Use sync transforms.`);
        } else {
          finalValue = transformed;
        }
      } catch (error) {
        console.warn(`[FieldShield] Transform error for ${modelName}.${field}:`, error);
      }
    }

    result[field] = finalValue;
  }

  return result;
}

/**
 * Attach role context to document(s).
 */
function attachRoleContext(doc: any, roles: string[], userId?: string): void {
  if (!doc) return;

  if (Array.isArray(doc)) {
    doc.forEach((d) => attachRoleContext(d, roles, userId));
    return;
  }

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
 * Get debug info for all registered models.
 */
export function getShieldDebugInfo(): string {
  const models = PolicyRegistry.getRegisteredModels();
  if (models.length === 0) {
    return 'No models registered with FieldShield';
  }

  const lines: string[] = ['FieldShield Registered Models:'];
  for (const model of models) {
    lines.push(PolicyRegistry.getDebugInfo(model));
  }
  return lines.join('\n\n');
}

/**
 * Clear all registered policies and reset state.
 */
export function clearShield(): void {
  PolicyRegistry.clear();
  resetQueryPatch();
  resetAggregatePatch();
  isInstalled = false;
}

/**
 * Check if FieldShield is installed.
 */
export function isShieldInstalled(): boolean {
  return isInstalled;
}

export default { installFieldShield, getShieldDebugInfo, clearShield, isShieldInstalled };
