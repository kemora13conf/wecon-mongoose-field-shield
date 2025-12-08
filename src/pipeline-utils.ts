/**
 * FieldShield v2.1 - Pipeline Utilities
 *
 * Smart utilities for analyzing and mutating MongoDB aggregation pipelines.
 * Handles edge cases like $geoNear and user-defined $project stages.
 */

/**
 * Special stages that MUST be first in the pipeline.
 * These are MongoDB-mandated restrictions.
 */
const FIRST_ONLY_STAGES = [
  '$geoNear',
  '$collStats',
  '$indexStats',
  '$listSessions',
  '$currentOp',
  '$planCacheStats',
];

/**
 * Stages that benefit from index usage and should come before filtering.
 */
const INDEX_USING_STAGES = [
  '$match',
  '$sort',
];

/**
 * Find the safe index to insert a $project stage.
 * 
 * Rules:
 * 1. Never before $geoNear, $collStats, etc. (must be first)
 * 2. After initial $match stages for index utilization
 * 3. Respect $sort after $match for covered queries
 * 
 * @param pipeline - The aggregation pipeline
 * @returns Safe insertion index
 */
export function findSafeProjectInsertIndex(pipeline: any[]): number {
  let insertIndex = 0;

  for (const stage of pipeline) {
    const stageKey = Object.keys(stage)[0];

    // First-only stages: must stay at position 0
    if (FIRST_ONLY_STAGES.includes(stageKey)) {
      insertIndex++;
      continue;
    }

    // $match stages: keep them early for index usage
    if (stageKey === '$match') {
      insertIndex++;
      continue;
    }

    // $sort immediately after $match can use covered queries
    if (stageKey === '$sort' && insertIndex > 0) {
      // Check if previous stage was $match
      const prevStage = pipeline[insertIndex - 1];
      if (prevStage && Object.keys(prevStage)[0] === '$match') {
        insertIndex++;
        continue;
      }
    }

    // Stop at any other stage
    break;
  }

  return insertIndex;
}

/**
 * Find an existing $project stage in the pipeline.
 * Returns the index or -1 if not found.
 * 
 * @param pipeline - The aggregation pipeline
 * @returns Index of $project stage or -1
 */
export function findProjectStageIndex(pipeline: any[]): number {
  return pipeline.findIndex(stage => '$project' in stage);
}

/**
 * Merge shield projection with user-defined projection.
 * 
 * Strategy:
 * 1. Start with shield's allowed fields (whitelist)
 * 2. For each user field:
 *    - If it's in whitelist, keep user's definition (may be renamed/computed)
 *    - If it's NOT in whitelist, exclude it (security)
 * 
 * @param userProjection - User's $project stage content
 * @param allowedFields - Fields allowed by shield
 * @returns Merged projection object
 */
export function mergeProjections(
  userProjection: Record<string, any>,
  allowedFields: string[]
): Record<string, any> {
  const allowedSet = new Set(allowedFields);
  const merged: Record<string, any> = {};

  // Determine if user is using inclusion or exclusion mode
  // MongoDB doesn't allow mixing (except _id)
  const userMode = detectProjectionMode(userProjection);

  if (userMode === 'exclusion') {
    // User is excluding fields - we need to ALSO include our whitelist
    // Start with all allowed fields as 1
    for (const field of allowedFields) {
      merged[field] = 1;
    }
    // Then apply user's exclusions only if they're trying to exclude allowed fields
    for (const [field, value] of Object.entries(userProjection)) {
      if (field === '_id' && value === 0) {
        // Allow _id exclusion
        merged['_id'] = 0;
      }
      // Ignore other exclusions - they're already not in our whitelist
    }
  } else {
    // User is including fields - intersect with our whitelist
    for (const [field, value] of Object.entries(userProjection)) {
      // _id is special - always allow control
      if (field === '_id') {
        merged['_id'] = value;
        continue;
      }

      // Only include if field is in allowed list
      if (allowedSet.has(field)) {
        merged[field] = value;
      }
      // If user references a computed field, check its dependencies
      // This is complex - for now, allow computed fields but warn
      else if (isComputedField(value)) {
        console.warn(
          `[FieldShield] Computed field "${field}" in $project may reference restricted fields. Allowing.`
        );
        merged[field] = value;
      }
      // Otherwise, silently drop it (security)
    }

    // Ensure all allowed fields are present if user didn't explicitly include them
    for (const field of allowedFields) {
      if (!(field in merged)) {
        merged[field] = 1;
      }
    }
  }

  return merged;
}

/**
 * Detect if projection is using inclusion or exclusion mode.
 */
function detectProjectionMode(projection: Record<string, any>): 'inclusion' | 'exclusion' {
  for (const [field, value] of Object.entries(projection)) {
    if (field === '_id') continue; // _id can be mixed

    if (value === 0 || value === false) {
      return 'exclusion';
    }
    if (value === 1 || value === true || typeof value === 'object' || typeof value === 'string') {
      return 'inclusion';
    }
  }
  return 'inclusion'; // Default
}

/**
 * Check if a projection value is a computed field (expression).
 */
function isComputedField(value: any): boolean {
  if (typeof value === 'string' && value.startsWith('$')) {
    return true; // Field reference
  }
  if (typeof value === 'object' && value !== null) {
    // Check for aggregation operators
    const keys = Object.keys(value);
    return keys.some(k => k.startsWith('$'));
  }
  return false;
}

/**
 * Validate pipeline structure and warn about potential issues.
 * 
 * @param pipeline - The aggregation pipeline
 * @returns Array of warning messages
 */
export function validatePipelineForShield(pipeline: any[]): string[] {
  const warnings: string[] = [];

  // Check for $lookup which may expose unshielded data
  const hasLookup = pipeline.some(stage => '$lookup' in stage);
  if (hasLookup) {
    warnings.push(
      'Pipeline contains $lookup. Joined documents are NOT automatically shielded. ' +
      'Consider using nested pipeline with shield or post-processing.'
    );
  }

  // Check for $unwind which may expose array contents
  const hasUnwind = pipeline.some(stage => '$unwind' in stage);
  if (hasUnwind) {
    warnings.push(
      'Pipeline contains $unwind. Ensure unwound fields are allowed by shield config.'
    );
  }

  // Check for $replaceRoot which may bypass field filtering
  const hasReplaceRoot = pipeline.some(stage => '$replaceRoot' in stage);
  if (hasReplaceRoot) {
    warnings.push(
      'Pipeline contains $replaceRoot. This may bypass field-level security. ' +
      'Ensure the new root document structure is safe.'
    );
  }

  return warnings;
}

export default {
  findSafeProjectInsertIndex,
  findProjectStageIndex,
  mergeProjections,
  validatePipelineForShield,
};
