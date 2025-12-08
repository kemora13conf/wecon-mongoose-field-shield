# Dynamic Conditions

Conditions allow complex access logic that can't be expressed with static roles alone.

## Basic Syntax

```typescript
{
  shield: {
    roles: ['user'],  // Roles are checked FIRST
    condition: (ctx) => boolean  // Then condition is evaluated
  }
}
```

::: info
Conditions are evaluated in `toJSON()`/`toObject()` transforms, not at the database level. The field IS fetched from MongoDB but may be filtered out during serialization.
:::

## Context Object

```typescript
interface ShieldContext {
  roles: string[];        // User's roles from .role()
  userId?: string;        // User ID from .userId()
  document: object;       // The document being accessed
  field: string;          // Name of the field being checked
  model: string;          // Model name (e.g., 'User')
}
```

## Common Patterns

### Owner-Only Access

```typescript
const PostSchema = new Schema({
  content: {
    type: String,
    shield: {
      roles: ['*'],
      condition: (ctx) => ctx.document.authorId?.equals(ctx.userId)
    }
  }
});

// Query with userId
await Post.find().role(['user']).userId(req.user.id);
```

### Status-Based Access

```typescript
const DocumentSchema = new Schema({
  content: {
    type: String,
    shield: {
      roles: ['*'],
      condition: (ctx) => {
        // Published documents are visible to all
        if (ctx.document.status === 'published') return true;
        // Drafts only visible to author
        return ctx.document.authorId?.toString() === ctx.userId;
      }
    }
  }
});
```

### Time-Based Access

```typescript
const PromoSchema = new Schema({
  discountCode: {
    type: String,
    shield: {
      roles: ['user'],
      condition: (ctx) => {
        const now = new Date();
        return ctx.document.startsAt <= now && ctx.document.endsAt >= now;
      }
    }
  }
});
```

### Relationship-Based Access

```typescript
const ProjectSchema = new Schema({
  budget: {
    type: Number,
    shield: {
      roles: ['user'],
      condition: (ctx) => {
        // Check if user is a team member
        return ctx.document.teamMembers?.some(
          member => member.userId?.toString() === ctx.userId
        );
      }
    }
  }
});
```

### Combined Conditions

```typescript
const MessageSchema = new Schema({
  content: {
    type: String,
    shield: {
      roles: ['user'],
      condition: (ctx) => {
        // Sender can always see
        if (ctx.document.senderId?.toString() === ctx.userId) return true;
        // Recipient can see
        if (ctx.document.recipientId?.toString() === ctx.userId) return true;
        // Admin can see all
        if (ctx.roles.includes('admin')) return true;
        return false;
      }
    }
  }
});
```

## Error Handling

If a condition throws an error, the field is excluded and a warning is logged:

```typescript
// Bad condition that might throw
shield: {
  roles: ['user'],
  condition: (ctx) => {
    // This could throw if 'metadata' is undefined
    return ctx.document.metadata.isVisible;  // ❌
  }
}

// Safe condition with null check
shield: {
  roles: ['user'],
  condition: (ctx) => {
    return ctx.document.metadata?.isVisible ?? false;  // ✅
  }
}
```

## Async Conditions

::: warning
Async conditions are **not supported** in `toJSON` transforms because `toJSON` is synchronous. If you use an async condition, the field will be excluded and a warning logged.
:::

```typescript
// ❌ This won't work properly
condition: async (ctx) => {
  const hasPermission = await checkPermission(ctx.userId);
  return hasPermission;
}
```

For async checks, perform them before the query:

```typescript
// ✅ Check async permission first
const canViewSalary = await checkPermission(req.user.id, 'view_salary');

const roles = canViewSalary ? ['user', 'salary-viewer'] : ['user'];
const user = await User.findById(id).role(roles);
```

## Performance Considerations

1. **Keep conditions simple** - They run for every document in the result
2. **Avoid heavy computation** - Use roles when possible
3. **Cache expensive checks** - Do them outside the condition

```typescript
// ❌ Expensive: runs for each document
condition: (ctx) => {
  return expensiveCheck(ctx.userId, ctx.document._id);
}

// ✅ Better: precompute
const allowedIds = await getAllowedIds(req.user.id);
const docs = await Model.find({ _id: { $in: allowedIds } }).role(['user']);
```
