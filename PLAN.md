# Plan: Move Strict Mode Validation to Model Definition Time

## Current Behavior (Problem)
- Shield validation happens **lazily** on first query execution
- If a field is missing shield config, error only appears when that query runs
- Risk: App can start and run with incomplete shield protection

## Desired Behavior
- Shield validation happens **eagerly** when `mongoose.model()` is called
- Errors appear immediately at app startup
- Fail-fast: Can't run with missing shield configs

---

## Performance Analysis

### Current Hot Paths (per query)

1. **`calculateAllowedFields()`** - Called on EVERY query
   - Iterates all policy fields: O(n) where n = number of shielded fields
   - Calls `checkRoleAccess()` for each field
   - Calls `removeRedundantParentPaths()` which is O(n²) worst case

2. **Lazy registration check** - Called on EVERY query
   - `processedModels.has(modelName)` - O(1) but unnecessary
   - `PolicyRegistry.hasModel(modelName)` - O(1) but unnecessary

### Performance Optimizations

#### 1. Pre-compute Role-to-Fields Mapping (NEW)

Instead of calculating allowed fields on every query, **pre-compute** at model registration:

```typescript
// In PolicyRegistry, store pre-computed projections per role combination
interface CachedProjection {
  selectFields: string[];
  conditionFields: Set<string>;
}

// Cache key: sorted roles joined (e.g., "admin,user")
const projectionCache = new Map<string, Map<string, CachedProjection>>();
```

**Trade-off**: Memory vs CPU. For most apps, role combinations are limited (admin, user, public, etc.)

#### 2. Remove Lazy Registration Overhead

Current code checks on every query:
```typescript
if (!processedModels.has(modelName) && !PolicyRegistry.hasModel(modelName)) {
  registerModelPolicyFromSchema(...); // Only runs once, but check runs every time
}
```

With eager registration, this entire block is removed.

#### 3. Optimize `checkRoleAccess()` with Set

Current:
```typescript
return allowedRoles.some((role) => userRoles.includes(role)); // O(n*m)
```

Optimized:
```typescript
const userRoleSet = new Set(userRoles); // O(m)
return allowedRoles.some((role) => userRoleSet.has(role)); // O(n)
```

#### 4. Cache `removeRedundantParentPaths()` Result

This function is deterministic for a given policy. Compute once at registration, not per query.

---

## Revised Approach

### Phase 1: Eager Validation (Security)

1. **Wrap `mongoose.model()`** - Validate at model creation
2. **Remove lazy registration** from middleware
3. **Throw early** for missing shield configs

### Phase 2: Performance Cache (Speed)

1. **Pre-compute projections** per role at registration time
2. **Cache common role combinations** (admin, user, public, *)
3. **Store pre-filtered field lists** to avoid runtime iteration

---

## Implementation Steps

### Step 1: Wrap `mongoose.model()` for eager validation

```typescript
let originalModel: typeof mongoose.model | null = null;

function installFieldShield(mongoose, options) {
  // Store and wrap mongoose.model
  originalModel = mongoose.model.bind(mongoose);

  mongoose.model = function(name: string, schema?: Schema, ...args: any[]) {
    // Validate schema if provided (not just retrieving model)
    if (schema && typeof name === 'string') {
      validateAndRegisterSchema(schema, name, globalStrict, globalDebug);
    }
    return originalModel!(name, schema, ...args);
  };
}
```

### Step 2: Pre-compute projections at registration

```typescript
// In registry.ts
interface PrecomputedAccess {
  // Map of role -> allowed fields
  roleProjections: Map<string, string[]>;
  // Fields needing condition checks
  conditionFields: Set<string>;
}

function registerModelPolicy(modelName: string, policy: ModelPolicy): void {
  // Store raw policy
  policies.set(modelName, policy);

  // Pre-compute common role projections
  const precomputed = precomputeProjections(policy);
  precomputedAccess.set(modelName, precomputed);
}
```

### Step 3: Fast path for common roles

```typescript
function getProjectionForRoles(modelName: string, roles: string[]): string[] {
  const precomputed = precomputedAccess.get(modelName);

  // Fast path: single common role
  if (roles.length === 1 && precomputed.roleProjections.has(roles[0])) {
    return precomputed.roleProjections.get(roles[0])!;
  }

  // Slow path: compute union for multiple roles (cache result)
  return computeAndCacheProjection(modelName, roles);
}
```

### Step 4: Simplify middleware

```typescript
schema.pre('find', function() {
  if (this._shieldBypassed) return;

  const modelName = this.model?.modelName;
  if (!modelName || !PolicyRegistry.hasModel(modelName)) return;

  const roles = this._shieldRoles;
  if (!roles) ShieldError.missingRole(modelName, 'find');

  // Fast lookup - no iteration, just cache hit
  const selectFields = PolicyRegistry.getProjectionForRoles(modelName, roles);
  this.select(selectFields.reduce((acc, f) => ({ ...acc, [f]: 1 }), {}));
});
```

---

## Performance Comparison

| Operation | Current | Optimized |
|-----------|---------|-----------|
| Model creation | O(1) | O(n) - one-time validation |
| Query (first) | O(n²) - lazy reg + calc | O(1) - cache lookup |
| Query (subsequent) | O(n) - calc every time | O(1) - cache lookup |
| Memory | Low | Medium (cache per model) |

**Net effect**: Slightly slower app startup (validation), much faster queries.

---

## Files to Modify

1. **`src/install.ts`**
   - Wrap `mongoose.model()`
   - Remove lazy registration from middleware
   - Simplify middleware to use cached projections

2. **`src/registry.ts`**
   - Add `PrecomputedAccess` interface
   - Add `precomputeProjections()` function
   - Add `getProjectionForRoles()` fast-path function
   - Optimize `checkRoleAccess()` with Set

3. **`src/types.ts`**
   - Add types for precomputed cache

4. **`__tests__/*.test.ts`**
   - Update tests for eager validation timing

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking change | Document in changelog, semver minor |
| Memory for cache | Only cache common roles; LRU eviction if needed |
| Models before install | Document requirement clearly |
| Wrapping mongoose.model | Only clean option; restore in clearShield() |

---

## Testing Checklist

- [ ] All existing 47 tests pass
- [ ] Errors thrown at `mongoose.model()` time, not query time
- [ ] Performance benchmark: queries faster than before
- [ ] Memory usage reasonable (< 1KB per model)
- [ ] `clearShield()` properly restores original `mongoose.model`
