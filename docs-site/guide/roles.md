# Role-Based Access

FieldShield uses role strings to determine field visibility. This guide covers best practices for role management.

## Role Patterns

### Simple Roles

```typescript
// Basic role check
email: {
  type: String,
  shield: { roles: ['admin'] }
}
```

### Multiple Roles (OR logic)

Fields are visible if the user has **any** of the listed roles:

```typescript
// User needs admin OR support role
ticketDetails: {
  type: String,
  shield: { roles: ['admin', 'support'] }
}
```

### Special Role: `*` (Wildcard)

Visible to any authenticated user:

```typescript
// All logged-in users can see
displayName: {
  type: String,
  shield: { roles: ['*'] }
}
```

### Special Role: `public`

Visible to everyone, even unauthenticated:

```typescript
// Anyone can see (no auth needed)
bio: {
  type: String,
  shield: { roles: ['public'] }
}
```

## Common Role Patterns

### Self/Owner Pattern

Add a dynamic "self" role when users view their own data:

```typescript
// Route handler
app.get('/users/:id', async (req, res) => {
  const roles = [...req.user.roles];  // Copy roles
  
  // Add 'self' if viewing own profile
  if (req.params.id === req.user.id) {
    roles.push('self');
  }
  
  const user = await User.findById(req.params.id).role(roles);
  res.json(user);
});

// Schema
const UserSchema = new Schema({
  email: {
    type: String,
    shield: { roles: ['admin', 'self'] }  // Admin or self only
  }
});
```

### Hierarchical Roles

Implement role hierarchy in your role resolver:

```typescript
const ROLE_HIERARCHY = {
  superadmin: ['admin', 'moderator', 'user'],
  admin: ['moderator', 'user'],
  moderator: ['user'],
  user: []
};

function expandRoles(roles: string[]): string[] {
  const expanded = new Set(roles);
  
  for (const role of roles) {
    const children = ROLE_HIERARCHY[role] || [];
    children.forEach(r => expanded.add(r));
  }
  
  return Array.from(expanded);
}

// Usage
const userRoles = ['admin'];
const expandedRoles = expandRoles(userRoles);
// ['admin', 'moderator', 'user']

await User.find().role(expandedRoles);
```

### Context-Based Roles

Add roles based on context:

```typescript
function getContextualRoles(req, resource) {
  const roles = [...req.user.roles];
  
  // Add 'owner' if user owns the resource
  if (resource.ownerId === req.user.id) {
    roles.push('owner');
  }
  
  // Add 'team-member' if in same team
  if (resource.teamId && req.user.teams?.includes(resource.teamId)) {
    roles.push('team-member');
  }
  
  return roles;
}
```

## Role Priority in Viewing

When a user has multiple roles, FieldShield checks if **any** role grants access:

```typescript
// Schema
salary: { shield: { roles: ['hr', 'admin'] } }

// User with roles: ['user', 'admin']
// Result: CAN see salary (has 'admin' role)
```

## Best Practices

### 1. Use Meaningful Role Names

```typescript
// ✅ Good
{ roles: ['billing-admin', 'account-owner'] }

// ❌ Avoid generic
{ roles: ['level3', 'type-a'] }
```

### 2. Document Your Roles

```typescript
/**
 * Application Roles:
 * - public: Unauthenticated users
 * - user: Regular authenticated user
 * - premium: Paid subscription user
 * - moderator: Content moderation access
 * - admin: Full administrative access
 * - self: Dynamic role for own resources
 */
```

### 3. Centralize Role Constants

```typescript
// constants/roles.ts
export const ROLES = {
  PUBLIC: 'public',
  USER: 'user',
  ADMIN: 'admin',
  SELF: 'self',
  OWNER: 'owner',
} as const;

// Usage in schema
import { ROLES } from '../constants/roles';

email: {
  shield: { roles: [ROLES.ADMIN, ROLES.SELF] }
}
```
