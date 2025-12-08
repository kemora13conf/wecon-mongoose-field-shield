# FAQ

Frequently asked questions about FieldShield.

## General

### Does FieldShield work with Mongoose 8?

Yes! FieldShield supports Mongoose 6.x, 7.x, and 8.x.

### Is FieldShield production-ready?

Yes. FieldShield uses database-level projections for filtering, which means sensitive data never leaves MongoDB. It's designed to be secure by default.

### Does FieldShield affect performance?

FieldShield actually **improves** performance for most use cases:

- **Database-level projections** reduce data transfer
- **No application-side filtering** of large objects
- Minimal overhead from middleware

---

## Configuration

### Can I use FieldShield with existing models?

Yes, but you need to add `shield` config to all fields (in strict mode) or the fields you want to protect.

### What happens if I forget .role()?

FieldShield throws a descriptive `ShieldError` with instructions on how to fix it.

### Can I disable strict mode?

Yes:

```typescript
installFieldShield(mongoose, { strict: false });
```

In non-strict mode, fields without shield config are treated as hidden.

---

## Roles & Access

### How do I implement "owner can edit" patterns?

Use the `self` role pattern:

```typescript
// Add 'self' role when viewing own resource
const roles = [...req.user.roles];
if (req.params.id === req.user.id) {
  roles.push('self');
}
await User.findById(req.params.id).role(roles);
```

### Can I check multiple conditions?

Yes, combine logic in your condition function:

```typescript
condition: (ctx) => {
  const isOwner = ctx.document.ownerId?.equals(ctx.userId);
  const isPublished = ctx.document.status === 'published';
  const isAdmin = ctx.roles.includes('admin');
  
  return isOwner || isPublished || isAdmin;
}
```

### What about team-based access?

Use contextual roles or conditions:

```typescript
// Option 1: Add team role
const roles = [...req.user.roles];
if (req.user.teams?.includes(resource.teamId)) {
  roles.push('team-member');
}

// Option 2: Condition check
condition: (ctx) => {
  const userTeams = await getUserTeams(ctx.userId);
  return userTeams.includes(ctx.document.teamId);
}
```

---

## Technical

### Does FieldShield work with lean()?

FieldShield's toJSON transforms don't apply to lean queries. For lean queries, use the helper:

```typescript
import { filterLeanDocument } from '@wecon/mongoose-field-shield';

const doc = await User.findById(id).lean();
const filtered = filterLeanDocument(doc, 'User', ['user']);
```

### Can I use FieldShield with GraphQL?

Yes! Apply roles in your resolvers:

```typescript
const resolvers = {
  Query: {
    user: async (_, { id }, ctx) => {
      return User.findById(id).role(ctx.user.roles);
    }
  }
};
```

### Does FieldShield support transactions?

Yes, FieldShield works with Mongoose transactions normally:

```typescript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await User.create([{ ... }], { session });
  await User.findOne().role(['admin']).session(session);
});
```

---

## Debugging

### How do I see which fields are being filtered?

Enable debug mode:

```typescript
installFieldShield(mongoose, { debug: true });
```

Use debug info:

```typescript
import { getShieldDebugInfo } from '@wecon/mongoose-field-shield';
console.log(getShieldDebugInfo());
```

### Why is my field still showing?

Check:
1. Are roles correct? Use `['admin']` not `'admin'`
2. Is the model registered? Check debug output
3. Are you using `toJSON()`? Raw documents have all fields as getters

---

## Migration

### How do I migrate from custom filtering?

Replace manual filtering:

```typescript
// Before
const user = await User.findById(id);
if (!isAdmin) {
  delete user.salary;
  delete user.ssn;
}

// After
const user = await User.findById(id).role(isAdmin ? ['admin'] : ['user']);
// Fields automatically filtered!
```
