/**
 * FieldShield v1 - Error Handling
 *
 * Developer-friendly errors following the ErrorCatcher pattern.
 * Provides clear error messages with location, details, and fix suggestions.
 */

import chalk from 'chalk';
import { ShieldErrorInfo, ShieldErrorTrace } from './types';

/**
 * ShieldError - Provides helpful error messages for developers.
 *
 * Following the ErrorCatcher pattern with:
 * - Stack trace capture for precise error location
 * - Clear title, details, and "How to fix" guidance
 * - Formatted console output with chalk
 */
export class ShieldError extends Error {
  constructor(
    public readonly info: ShieldErrorInfo,
    public readonly trace: ShieldErrorTrace
  ) {
    super(info.title);
    this.name = 'ShieldError';
  }

  // ============================================================================
  // Static Error Factories
  // ============================================================================

  /**
   * Error: Query executed without .role() call
   */
  static missingRole(modelName: string, operation: string): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Missing .role() on ${modelName}.${operation}()`,
      details:
        'FieldShield requires every query to specify roles for field filtering. ' +
        'This ensures no sensitive data is accidentally exposed.',
      fix:
        `Add .role() before executing the query:\n\n` +
        `  // Single role\n` +
        `  await ${modelName}.${operation}(query).role('admin');\n\n` +
        `  // Multiple roles\n` +
        `  await ${modelName}.${operation}(query).role(['admin', 'user']);\n\n` +
        `  // Public access\n` +
        `  await ${modelName}.${operation}(query).role('public');`,
    };
    this.logAndThrow(info, trace);
  }

  /**
   * Error: Aggregation executed without .role() call
   */
  static missingRoleOnAggregate(modelName: string): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Missing .role() on ${modelName}.aggregate()`,
      details:
        'FieldShield requires every aggregation to specify roles for field filtering. ' +
        'Without this, aggregation pipelines could bypass field-level security.',
      fix:
        `Add .role() before executing the aggregation:\n\n` +
        `  // Single role\n` +
        `  await ${modelName}.aggregate(pipeline).role('admin');\n\n` +
        `  // Multiple roles\n` +
        `  await ${modelName}.aggregate(pipeline).role(['admin', 'user']);\n\n` +
        `  // For internal queries that need to bypass:\n` +
        `  await ${modelName}.aggregate(pipeline).bypassShield();`,
    };
    this.logAndThrow(info, trace);
  }

  /**
   * Error: Schema field missing shield config (strict mode)
   */
  static missingShieldConfig(modelName: string, field: string): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Missing shield config for "${field}" in ${modelName} schema`,
      details:
        'Strict mode requires all schema fields to have explicit shield configuration. ' +
        'This prevents accidental data exposure from new fields.',
      fix:
        `Add shield config to the field in your schema:\n\n` +
        `  const ${modelName}Schema = new Schema({\n` +
        `    ${field}: {\n` +
        `      type: String,\n` +
        `      shield: { roles: ['admin'] }  // Specify who can see this\n` +
        `    }\n` +
        `  });\n\n` +
        `  // To hide from everyone:\n` +
        `  shield: { roles: [] }\n\n` +
        `  // To show to all authenticated users:\n` +
        `  shield: { roles: ['*'] }`,
    };
    this.logAndThrow(info, trace);
  }

  /**
   * Error: Model not registered with FieldShield
   */
  static modelNotRegistered(modelName: string): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Model "${modelName}" is not registered with FieldShield`,
      details:
        'The model was created before installFieldShield() was called, ' +
        'or the schema has no fields with shield configuration.',
      fix:
        `Ensure installFieldShield() is called BEFORE defining models:\n\n` +
        `  import mongoose from 'mongoose';\n` +
        `  import { installFieldShield } from 'field-shield';\n\n` +
        `  // Call this first!\n` +
        `  installFieldShield(mongoose);\n\n` +
        `  // Then define your models\n` +
        `  const ${modelName}Schema = new Schema({ ... });\n` +
        `  const ${modelName} = mongoose.model('${modelName}', ${modelName}Schema);`,
    };
    this.logAndThrow(info, trace);
  }

  /**
   * Error: Invalid shield configuration
   */
  static invalidConfig(modelName: string, field: string, issue: string): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Invalid shield config for "${field}" in ${modelName}`,
      details: issue,
      fix:
        `Correct the shield configuration:\n\n` +
        `  ${field}: {\n` +
        `    type: String,\n` +
        `    shield: {\n` +
        `      roles: ['admin', 'user'],     // Required: array of role strings\n` +
        `      condition: (ctx) => boolean,  // Optional: dynamic access\n` +
        `      transform: (val, ctx) => val  // Optional: transform value\n` +
        `    }\n` +
        `  }`,
    };
    this.logAndThrow(info, trace);
  }

  /**
   * Error: Condition function failed
   */
  static conditionFailed(
    modelName: string,
    field: string,
    error: Error
  ): never {
    const trace = this.getCallerInfo();
    const info: ShieldErrorInfo = {
      title: `Shield condition failed for "${field}" in ${modelName}`,
      details: `The condition function threw an error: ${error.message}`,
      fix:
        `Check your condition function for errors:\n\n` +
        `  shield: {\n` +
        `    roles: ['user'],\n` +
        `    condition: (ctx) => {\n` +
        `      // ctx.document - the full document\n` +
        `      // ctx.roles - current user roles\n` +
        `      // ctx.userId - current user ID\n` +
        `      // Make sure to handle undefined values\n` +
        `      return ctx.document._id?.equals(ctx.userId);\n` +
        `    }\n` +
        `  }`,
    };
    this.logAndThrow(info, trace);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get caller information from stack trace.
   * Skips internal frames to find actual calling location.
   */
  private static getCallerInfo(): ShieldErrorTrace {
    const err = new Error();
    const stack = err.stack || '';

    // Split into lines, remove "Error" line
    const stackLines = stack.split('\n').slice(1);

    // Skip internal frames (getCallerInfo, the error factory method)
    // Find the first frame outside this file
    let callerLine = '';
    for (let i = 2; i < stackLines.length; i++) {
      const line = stackLines[i];
      if (!line.includes('errors.ts') && !line.includes('ShieldError')) {
        callerLine = line;
        break;
      }
    }

    if (!callerLine) {
      callerLine = stackLines[3] || stackLines[2] || '';
    }

    // Parse V8 stack trace format
    // "    at ClassName.method (file:///path/file.ts:15:23)"
    // "    at file:///path/file.ts:15:23"
    let match = callerLine.match(/\((.+?):(\d+):(\d+)\)$/);

    if (!match) {
      match = callerLine.match(/at\s+(.+?):(\d+):(\d+)$/);
    }

    if (match) {
      const file = match[1].replace('file://', '');
      const line = parseInt(match[2], 10);
      const column = parseInt(match[3], 10);

      // Extract function name
      const functionMatch = callerLine.match(/at\s+(?:async\s+)?(\S+?)\s+\(/);
      const functionName = functionMatch ? functionMatch[1] : null;

      return { file, line, column, function: functionName };
    }

    return {
      file: 'unknown',
      line: 0,
      column: 0,
      function: null,
    };
  }

  /**
   * Log error with formatted output and throw.
   */
  private static logAndThrow(
    info: ShieldErrorInfo,
    trace: ShieldErrorTrace
  ): never {
    console.error(
      chalk.red.bold('\n-=>') +
        chalk.white.bold(' FieldShield caught an error ') +
        chalk.red.bold('<=-\n')
    );

    console.error(chalk.red.bold('✖ Error:'), chalk.white(info.title));
    console.error(chalk.gray('\n  Details:'), chalk.white(info.details));
    console.error(
      chalk.gray('\n  Location:'),
      chalk.cyan(`${trace.file}:${trace.line}:${trace.column}`)
    );

    if (trace.function) {
      console.error(chalk.gray('  Function:'), chalk.cyan(trace.function));
    }

    console.error(chalk.yellow.bold('\n  💡 How to fix:'));
    console.error(chalk.yellow(`  ${info.fix.replace(/\n/g, '\n  ')}`));
    console.error('');

    throw new ShieldError(info, trace);
  }
}

export default ShieldError;
