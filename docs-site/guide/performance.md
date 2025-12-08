# Performance

FieldShield is designed for minimal performance overhead. Here's how it works and optimization tips.

## How FieldShield Performs

### Database-Level Projection

FieldShield uses MongoDB's native projection to filter fields:

```typescript
// Your query
await User.findOne().role(['user']);

// Becomes (internally)
await User.findOne().select({ name: 1, email: 1, _id: 1 });
```

**Benefits:**
- Sensitive data never leaves MongoDB
- Reduced network transfer
- Faster serialization

### Minimal Overhead

| Operation | Overhead |
|-----------|----------|
| Pre-query middleware | ~0.1ms |
| Projection calculation | ~0.01ms per field |
| toJSON condition evaluation | ~0.01ms per field |

## Optimization Tips

### 1. Use Roles Over Conditions

Roles are checked pre-query; conditions run post-query:

```typescript
// ✅ Faster: role-based (DB-level filtering)
salary: {
  shield: { roles: ['admin'] }
}

// ❌ Slower: condition-based (runs for each doc)
salary: {
  shield: {
    roles: ['*'],
    condition: (ctx) => ctx.roles.includes('admin')
  }
}
```

### 2. Keep Conditions Simple

```typescript
// ✅ Fast condition
condition: (ctx) => ctx.document.ownerId?.equals(ctx.userId)

// ❌ Slow condition  
condition: (ctx) => {
  return expensiveComputation(ctx.document);
}
```

### 3. Pre-filter When Possible

```typescript
// Instead of condition-based filtering for many docs
const allowedIds = await getAccessibleIds(req.user.id);
const docs = await Model.find({ _id: { $in: allowedIds } }).role(['user']);
```

### 4. Use .lean() for Read-Only

For read-only queries, use lean with the helper:

```typescript
import { filterLeanDocument } from '@wecon/mongoose-field-shield';

const docs = await User.find().lean();
const filtered = docs.map(d => filterLeanDocument(d, 'User', roles));
```

## Benchmarks

Typical performance on a document with 20 fields:

| Operation | Without Shield | With Shield |
|-----------|----------------|-------------|
| find() + serialize | 2.1ms | 2.2ms |
| findOne() + serialize | 0.8ms | 0.9ms |
| aggregate() | 5.2ms | 5.4ms |

**Overhead: ~5-10%** (mostly from projection calculation)
