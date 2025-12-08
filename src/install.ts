/**
 * FieldShield v2 - Installation
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
import { patchQueryPrototype, registerQueryMiddleware, resetQueryPatch } from './query';
import { patchAggregatePrototype, registerAggregateMiddleware, resetAggregatePatch } from './aggregate';
import { registerDocumentTransforms } from './document';
import { ShieldError } from './errors';

// Track installation state
let isInstalled = false;

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
 * import { installFieldShield } from 'field-shield';
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
    defaultRoles = [],
  } = options;

  if (debug) {
    console.log(
      chalk.cyan.bold('\n🛡️  FieldShield v2') +
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
  // ============================================================================

  mongoose.plugin(function fieldShieldPlugin(schema: Schema, opts: any) {
    // Hook into model compilation to register middleware
    const modelName = opts?.modelName;

    // We need to wait for the schema to be attached to a model
    // Use a flag to track if we've processed this schema
    (schema as any)._shieldPending = {
      strict,
      defaultRoles,
      debug,
    };
  });

  // ============================================================================
  // 4. Override mongoose.model to register middleware per-model
  // ============================================================================

  const originalModel = mongoose.model.bind(mongoose);

  (mongoose as any).model = function (
    name: string,
    schema?: Schema,
    collection?: string,
    options?: any
  ) {
    // If schema is provided, set up FieldShield middleware
    if (schema && !PolicyRegistry.hasModel(name)) {
      const shieldOptions = (schema as any)._shieldPending || {
        strict,
        defaultRoles,
        debug,
      };

      registerModelShield(schema, name, shieldOptions, debug);
    }

    return originalModel(name, schema, collection, options);
  };

  isInstalled = true;

  if (debug) {
    console.log(chalk.cyan('  FieldShield v2 ready!\n'));
  }
}

/**
 * Register FieldShield middleware for a model.
 */
function registerModelShield(
  schema: Schema,
  modelName: string,
  options: { strict: boolean; defaultRoles: string[]; debug: boolean },
  debug: boolean
): void {
  const { strict, defaultRoles } = options;

  try {
    // Parse shield config from schema
    const { policy, schemaFields } = parseSchemaShield(schema, modelName);

    // If no shield configs found, skip
    if (policy.size === 0) {
      if (debug) {
        console.log(
          chalk.gray(`  ○ Skipped: ${modelName}`) +
            chalk.gray(' (no shield config)')
        );
      }
      return;
    }

    // Strict mode validation
    if (strict) {
      const missingFields: string[] = [];

      for (const field of schemaFields) {
        // Skip internal Mongoose fields
        if (field === '_id' || field === '__v') continue;
        if (field.startsWith('_')) continue;

        if (!policy.has(field)) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        ShieldError.missingShieldConfig(modelName, missingFields[0]);
      }
    }

    // Register the model's policy
    PolicyRegistry.register(modelName, policy);

    // Register query middleware (pre/post find, findOne, etc.)
    registerQueryMiddleware(schema, modelName);

    // Register aggregate middleware (pre aggregate)
    registerAggregateMiddleware(schema, modelName);

    // Register document transforms (toJSON, toObject)
    registerDocumentTransforms(schema, modelName);

    if (debug) {
      console.log(
        chalk.green('  ✓') +
          chalk.white(` Registered: ${modelName}`) +
          chalk.gray(` (${policy.size} shielded fields)`)
      );
    }
  } catch (error) {
    if (error instanceof ShieldError) {
      throw error;
    }
    console.error(
      chalk.red(`  ✗ Failed to register ${modelName}:`),
      error
    );
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
 * Useful for testing.
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
