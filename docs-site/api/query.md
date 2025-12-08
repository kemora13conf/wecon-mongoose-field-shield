# Query Methods

FieldShield extends Mongoose Query with additional methods for role-based filtering.

## .role()

Specify roles for field filtering. **Required** for all queries on shielded models.

### Signature

```typescript
query.role(roles: string | string[]): Query
```

### Usage

```typescript
// Single role
await User.findOne().role('admin');

// Multiple roles
await User.findOne().role(['admin', 'support']);

// With other query methods
await User.find({ status: 'active' })
  .sort({ createdAt: -1 })
  .limit(10)
  .role(['user']);
```

### Examples

```typescript
// List all users (filtered by role)
const users = await User.find().role(req.user.roles);

// Find by ID
const user = await User.findById(id).role(['admin', 'self']);

// With select (combined filtering)
const user = await User.findById(id)
  .select('name email')  // Your selection
  .role(['user']);       // Shield filtering applied on top

// With populate
const post = await Post.findById(id)
  .populate('author')
  .role(['user']);
```

---

## .userId()

Specify the current user's ID for owner-based conditions.

### Signature

```typescript
query.userId(id: string): Query
```

### Usage

```typescript
// For owner checks in conditions
await Post.find()
  .role(['user'])
  .userId(req.user.id);
```

### When to Use

Use `.userId()` when your schema has conditions that check ownership:

```typescript
// Schema
content: {
  shield: {
    roles: ['*'],
    condition: (ctx) => ctx.document.authorId?.equals(ctx.userId)
  }
}

// Query
await Post.find().role(['user']).userId(req.user.id);
```

---

## .bypassShield()

Bypass FieldShield filtering. Use for internal operations.

### Signature

```typescript
query.bypassShield(): Query
```

### Usage

```typescript
// Admin script - bypass all filtering
const allData = await User.find().bypassShield();

// Authentication - need password hash
const user = await User.findOne({ email }).bypassShield();
const isValid = await bcrypt.compare(password, user.password);
```

::: danger
Use with extreme caution! This exposes all fields regardless of shield configuration.
:::

---

## Supported Query Types

FieldShield intercepts these query methods:

| Method | Supported |
|--------|-----------|
| `find()` | ✅ |
| `findOne()` | ✅ |
| `findById()` | ✅ |
| `findOneAndUpdate()` | ✅ |
| `findOneAndDelete()` | ✅ |
| `findOneAndReplace()` | ✅ |
| `countDocuments()` | ❌ (no projection) |
| `updateOne()` | ❌ (no projection) |
| `deleteOne()` | ❌ (no projection) |

---

## Error Handling

### Missing Role

```typescript
// ❌ Will throw ShieldError
await User.find();  // No .role() call

// ✅ Correct
await User.find().role(['user']);
```

### Error Message

```
ShieldError: Missing .role() on User query

DETAILS:
All queries on shielded models must specify a role...

FIX:
Add .role(['your-role']) to the query:
  User.find().role(['user'])
```
