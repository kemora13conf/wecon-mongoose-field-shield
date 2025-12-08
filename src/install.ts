/**
 * FieldShield v1 - Installation
 *
 * Main entry point for installing FieldShield into Mongoose.
 * Call this BEFORE defining any models.
 */

import type { Mongoose } from 'mongoose';
import chalk from 'chalk';
import { ShieldOptions } from './types';
import { PolicyRegistry, parseSchemaShield } from './registry';
import { patchQueryPrototype } from './query';
import { patchSchemaTransforms } from './document';
import { ShieldError } from './errors';

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
      chalk.cyan.bold('\n🛡️  FieldShield') +
        chalk.white(' installing...') +
        chalk.gray(` (strict: ${strict})`) +
        '\n'
    );
  }

  // ============================================================================
  // 1. Patch Query prototype
  // ============================================================================

  patchQueryPrototype(mongoose);

  // ============================================================================
  // 2. Register global plugin to parse schemas
  // ============================================================================

  mongoose.plugin(function fieldShieldPlugin(schema, opts) {
    // This runs for every new schema

    // Hook into model compilation
    schema.pre('init', function () {
      // Get model name from constructor
      const modelName = (this.constructor as any).modelName;
      if (!modelName) return;

      // Check if we've already registered this model
      if (PolicyRegistry.hasModel(modelName)) return;

      // Parse shield config from schema
      const { policy, schemaFields } = parseSchemaShield(schema, modelName);

      // Handle strict mode validation
      if (strict && policy.size > 0) {
        // Only validate if schema has at least one shield field
        const validation = PolicyRegistry.validateStrict(modelName, schemaFields);

        if (!validation.valid) {
          for (const field of validation.missingFields) {
            ShieldError.missingShieldConfig(modelName, field);
          }
        }
      }

      // Register if we have any shield configs
      if (policy.size > 0) {
        PolicyRegistry.register(modelName, policy);

        // Apply toJSON/toObject transforms
        patchSchemaTransforms(schema, modelName);

        if (debug) {
          console.log(
            chalk.green('  ✓') +
              chalk.white(` Registered: ${modelName}`) +
              chalk.gray(` (${policy.size} shielded fields)`)
          );
        }
      }
    });

    // Also try to register during model creation
    schema.post('init', function () {
      // Re-register if needed after document init
      const modelName = (this.constructor as any).modelName;
      if (modelName && !PolicyRegistry.hasModel(modelName)) {
        registerModelFromSchema(schema, modelName, strict, defaultRoles, debug);
      }
    });
  });

  // ============================================================================
  // 3. Override mongoose.model to catch all model creations
  // ============================================================================

  const originalModel = mongoose.model.bind(mongoose);

  (mongoose as any).model = function (
    name: string,
    schema?: any,
    collection?: string,
    options?: any
  ) {
    // If schema is provided, register it
    if (schema) {
      registerModelFromSchema(schema, name, strict, defaultRoles, debug);
    }

    return originalModel(name, schema, collection, options);
  };

  if (debug) {
    console.log(chalk.cyan('  FieldShield ready!\n'));
  }
}

/**
 * Register a model's shield config from its schema.
 */
function registerModelFromSchema(
  schema: any,
  modelName: string,
  strict: boolean,
  defaultRoles: string[],
  debug: boolean
): void {
  // Don't re-register
  if (PolicyRegistry.hasModel(modelName)) return;

  try {
    const { policy, schemaFields } = parseSchemaShield(schema, modelName);

    // If no shield configs found and not strict, skip
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
        // Skip internal Mongoose fields (auto-generated)
        if (field === '_id' || field === '__v') continue;
        // Skip other internal fields
        if (field.startsWith('_')) continue;

        if (!policy.has(field)) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        // Report first missing field
        ShieldError.missingShieldConfig(modelName, missingFields[0]);
      }
    }

    // Register
    PolicyRegistry.register(modelName, policy);
    patchSchemaTransforms(schema, modelName);

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
 * Clear all registered policies.
 * Useful for testing.
 */
export function clearShield(): void {
  PolicyRegistry.clear();
}

export default { installFieldShield, getShieldDebugInfo, clearShield };
