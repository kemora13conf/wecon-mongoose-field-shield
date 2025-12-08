# FieldShield Enhancement Plan

## Overview
This document outlines the roadmap for transforming FieldShield from a working prototype into a robust, "framework-agnostic" production library. It addresses the critical architectural weaknesses identified in the recent audit and provides specific technical solutions.

## Issue Remediation Table

| Severity | Issue | Risks | Proposed Solution |
|:---:|---|---|---|
| 🚨 **CRITICAL** | **Global Monkey-Patching**<br>`(mongoose as any).model = ...` | Conflicts with other plugins;<br>Breakage on Mongoose updates;<br>Hidden side effects. | **Deprecate & Remove.**<br>Move registration logic to `schema.plugin()`.<br>Require users to explicitly apply the plugin to schemas or use `mongoose.plugin()` globally. |
| 🔴 **HIGH** | **Fragile Aggregation Injection**<br>Blindly inserting `$project` after `$match`. | Breaks complex pipelines (`$geoNear`, `$redact`);<br>Performance regression (index usage);<br>May strip needed fields early. | **Smart Stage Merging.**<br>Analyze pipeline structure.<br>If a compatible `$project` exists, merge projections.<br>Ensure insertion respects stage order (e.g. `$geoNear` first). |
| 🟡 **MED** | **Synchronous Filtering**<br>`toJSON` runs on main thread. | Event loop blocking on large datasets;<br>Compute-heavy conditions cause lag. | **Async/Option Patterns.**<br>Add `lean({ virtuals: true })` support for faster skipping.<br>Add strict options to throw on expensive/async conditions in dev. |
| 🟡 **MED** | **Middleware "Any" Typing**<br>`this: any` in pre/post hooks. | Loss of type safety;<br>Dev experience friction. | **Proper Generic Typing.**<br>Define `ShieldedQuery<T>` interface.<br>Cast `this` to typed context in middleware. |
| 🔵 **LOW** | **Hardcoded Singleton**<br>`PolicyRegistry` | Testing state leaks;<br>Inflexible for multi-tenant apps. | **Instance-based Registry.**<br>Attach registry to Mongoose instance or Connection instance rather than global module scope. |

---

## Technical Deep Dive: Aggregation Merging

The current implementation bluntly inserts a new `$project` stage:
```typescript
pipeline.splice(insertIndex, 0, { $project: allowedFields });
```

**Proposed "Smart Merge" Strategy:**

We need to merge our security projection with user-defined projections to ensure we don't break their logic while maintaining security.

### Scenario A: User provides `$project`
**Proposal:** Merge our whitelist into their projection if safe, or wrap.

```typescript
// Pseudo-implementation of smart merge
const userProject = pipeline.find(stage => stage.$project);

if (userProject) {
  // 1. Identify what user wants
  // 2. Intersect with what is allowed
  const cleanProject = {
    ...userProject.$project,        // User's computed fields / renames
    ...shieldAllowedFields          // Our strict whitelist (overwrites if collision??)
     // CAUTION: logic needs to be "Intersect", not just spread.
     // actually, we likely need to ADD our restrictions.
  };
  
  // Realistically, we might need TWO stages or a careful merge:
  // 1. Calculate allowed fields
  // 2. If user projects field 'A' but it's forbidden -> Remove 'A' from user project
  // 3. If user projects field 'B' (computed) -> Allow if dependencies are allowed? (Hard)
}
```

**Refined Approach:**
Instead of complex analysis, we should **force** our whitelist **BEFORE** the user's `$project` if possible (to restrict data source), OR **AFTER** (to restrict output).

*   **Restrict Source (Early):** Keeps sensitive data out of the pipeline early. Best for performance.
*   **Restrict Output (Late):** Ensures no sensitive data leaks at the end.

**Recommended Hybrid:**
1.  **Strict Mode:** Inject a minimal `{ $project: allowed_fields }` early (current behavior).
2.  **Compatibility Mode:** If `$project` exists, attempt to merge `approved_fields` into it to avoid pipeline length growth.

```javascript
/* Proposed Structure for merged stage */
$project: {
  // Preserve user computations
  ...user_defined_project,
  
  // Enforce our visibility rules (conceptually)
  // Note: In MongoDB, { a: 1, b: 0 } is mixed mode error.
  // We must ensure we generate a VALID strict whitelist.
}
```

### Action Plan
1.  **Create `src/pipeline-manager.ts`**: Dedicated logic for parsing/mutating pipelines.
2.  **Implement `mergeProjection(userStage, shieldFields)`**: Smart object merging logic.
3.  **Add `Aggregation.secure()`**: Explicit method to trigger security, replacing the implicit middleware magic if desired.

---

## production Readiness Roadmap

1.  **v2.1 (Immediate):** Fix types and Deprecation warning for `mongoose.model`.
2.  **v2.2:** Implementation of Smart Aggregation Merging.
3.  **v3.0:** Removal of Monkey-Patch; Switch to `schema.plugin(fieldShield)` exclusively.
