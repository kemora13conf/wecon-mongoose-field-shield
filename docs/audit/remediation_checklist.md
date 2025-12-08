# FieldShield Remediation Checklist (Revised)
## Goal: Absolute Data Protection via Mandatory Role Context

This plan ensures that **no data leaves the database** without being filtered according to the user's role. It strictly enforces that every query and aggregation MUST have a defined role, or it will fail.

### Phase 1: Restore Mongoose Integrity (The Foundation)
We must stop returning broken "plain objects" and return real Mongoose Documents, while maintaining strict security.

- [ ] **Remove `Query.exec` Override**
    - [ ] Delete the `src/query.ts` override that intercepts execution and returns POJOs.
    - [ ] **Why**: Returning plain objects breaks `.save()`, virtuals, and instance methods, making the plugin unusable for many applications.

- [ ] **Implement Database-Level Projections (The Core Fix)**
    - [ ] Create a `pre('find')`, `pre('findOne')`, and `pre('findOneAndUpdate')` middleware.
    - [ ] **Logic**:
        1.  Check if `.role()` has been called. If NOT, **THROW AN ERROR** (Strict Enforcement).
        2.  Calculate the union of allowed fields for the roles.
        3.  Apply `this.select(allowedFields)` to the query.
    - [ ] **Result**: The database *only* returns allowed data. The resulting Mongoose Document is safe to use and `.save()` because it simply lacks the hidden fields.

### Phase 2: Complete Lockdown (Aggregations)
Aggregations are the most common bypass for security plugins. We will plug this hole.

- [ ] **Implement `pre('aggregate')` Middleware**
    - [ ] Intercept all aggregation pipelines.
    - [ ] **Logic**:
        1.  Check if roles are defined (via an option or context on the model). If NOT, **THROW AN ERROR**.
        2.  Inject a `$project` stage at the appropriately earliest point in the pipeline.
        3.  This `$project` stage will explicitlywhitelist *only* the allowed fields, similar to the query projection.

### Phase 3: Correctness & Edge Cases
Ensure "hidden" but "necessary" fields (like `_id`) are handled correctly.

- [ ] **Fix `_id` and `__v` Access**
    - [ ] Hardcode the projection logic to **always include `_id`**.
    - [ ] **Why**: `_id` is required for Mongoose to hydrate documents. Hiding it breaks the ORM capabilities. Applications that need to hide `_id` from the *end user* should do so in the API serialization layer (Phase 4), not the DB layer.

- [ ] **Handle Dynamic Conditions (Smart Selection)**
    - [ ] If a field has a `condition` (e.g. `ownerId == userId`), we MUST select the fields required to evaluate that condition (e.g. `ownerId`), even if the user might not be allowed to see the final field.
    - [ ] **Logic**: "Allowed to Select" != "Allowed to See".
        -   **Select**: All purely role-visible fields + fields with conditions + fields needed for conditions.
        -   **Post-Process**: Use `toJSON` transform to check the actual condition and strip the value if it fails.

### Phase 4: Final Serialization Layer (toJSON)
Because some checks (like dynamic conditions) happen *after* fetching data, we need a final safety net.

- [ ] **Refine `toJSON` Transform**
    - [ ] Implement a robust `toJSON` transform in `src/document.ts`.
    - [ ] It should check the `condition` logic for any fields that were fetched but might still need hiding.
    - [ ] Ensure it runs reliably even if `.lean()` was used (by providing a helper function for lean results).

### Phase 5: Testing & Verification
Prove that it works and is secure.

- [ ] **Security Test Suite**
    - [ ] Test: `User.find()` without `.role()` -> **MUST FAIL**.
    - [ ] Test: `User.aggregate()` without context -> **MUST FAIL**.
    - [ ] Test: `User.find().role('public')` -> MUST return Document with `_id` but NO hidden fields.
    - [ ] Test: `user.save()` on a result -> MUST succeed.

### Summary of Safety Mechanism
1.  **Query Start**: Developer calls `User.find().role('user')`.
2.  **Middleware**: Plugin sees role 'user'. Calculates allowed fields (e.g. `name, email`). Adds `.select('name email')`.
3.  **DB Execution**: MongoDB returns ONLY `name` and `email` (and `_id`).
4.  **Result**: Mongoose hydrates a Document with only those fields.
5.  **Safety**: Attempting to access `user.password` returns `undefined` because it was never fetched.

This approach guarantees that **users never receive a field they can't see**, while keeping Mongoose functional.
