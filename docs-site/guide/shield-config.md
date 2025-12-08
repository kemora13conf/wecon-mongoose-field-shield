# Shield Configuration

Every field in a shielded schema requires a `shield` configuration object. This page covers all available options.

## Basic Structure

```typescript
{
  fieldName: {
    type: String,  // Mongoose type
    shield: {
      roles: string[],           // Required: who can see this field
      condition?: ShieldCondition,  // Optional: dynamic access check
      transform?: ShieldTransform   // Optional: value modification
    }
  }
}
```

## Roles

The `roles` array defines which roles can access the field.

### Special Values

| Value | Meaning |
|-------|---------|
| `[]` (empty) | Hidden from **everyone** (even admins) |
| `['*']` | Visible to **all authenticated** users |
| `['public']` | Visible to **everyone** (including guests) |
| `['admin', 'hr']` | Visible only to listed roles |

### Examples

```typescript
const UserSchema = new Schema({
  // Hidden from everyone - use for passwords, internal flags
  password: {
    type: String,
    shield: { roles: [] }
  },
  
  // All authenticated users can see
  displayName: {
    type: String,
    shield: { roles: ['*'] }
  },
  
  // Public - even unauthenticated users
  publicBio: {
    type: String,
    shield: { roles: ['public'] }
  },
  
  // Only HR and admin
  salary: {
    type: Number,
    shield: { roles: ['admin', 'hr'] }
  }
});
```

## Conditions

Conditions allow dynamic access control based on the request context.

```typescript
{
  shield: {
    roles: ['user'],
    condition: (ctx) => boolean
  }
}
```

### Context Object

The condition function receives:

```typescript
interface ShieldContext {
  roles: string[];        // User's roles
  userId?: string;        // From .userId() call
  document: object;       // The full document
  field: string;          // Current field name
  model: string;          // Model name
}
```

### Owner Check Example

```typescript
const PostSchema = new Schema({
  title: { type: String, shield: { roles: ['*'] } },
  
  // Only author can see their drafts
  content: {
    type: String,
    shield: {
      roles: ['*'],
      condition: (ctx) => {
        // Published posts are visible to everyone
        if (ctx.document.status === 'published') return true;
        // Drafts only visible to author
        return ctx.document.authorId?.toString() === ctx.userId;
      }
    }
  }
});

// Query with userId
await Post.find().role(['user']).userId(req.user.id);
```

## Transforms

Transforms modify field values before returning them.

```typescript
{
  shield: {
    roles: ['*'],
    transform: (value, ctx) => modifiedValue
  }
}
```

### Common Transform Patterns

```typescript
// Mask phone number
phone: {
  type: String,
  shield: {
    roles: ['*'],
    transform: (val) => val?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }
}

// Partial email
email: {
  type: String,
  shield: {
    roles: ['*'],
    transform: (val) => {
      const [name, domain] = val.split('@');
      return `${name[0]}***@${domain}`;
    }
  }
}

// Role-based formatting
salary: {
  type: Number,
  shield: {
    roles: ['hr', 'admin'],
    transform: (val, ctx) => {
      if (ctx.roles.includes('admin')) return val;
      return 'Confidential';  // HR sees "Confidential"
    }
  }
}
```

## Full Example

```typescript
const EmployeeSchema = new Schema({
  // Public info
  name: { type: String, shield: { roles: ['public'] } },
  department: { type: String, shield: { roles: ['public'] } },
  
  // Authenticated users
  email: { type: String, shield: { roles: ['*'] } },
  
  // HR and Admin only with masking for HR
  salary: {
    type: Number,
    shield: {
      roles: ['hr', 'admin', 'self'],
      condition: (ctx) => {
        // Self can always see own salary
        if (ctx.document._id?.toString() === ctx.userId) return true;
        // Others need explicit role
        return ctx.roles.includes('hr') || ctx.roles.includes('admin');
      },
      transform: (val, ctx) => {
        // Admin sees exact, others see range
        if (ctx.roles.includes('admin')) return val;
        return `${Math.floor(val / 10000) * 10}k - ${Math.ceil(val / 10000) * 10}k`;
      }
    }
  },
  
  // Never exposed
  ssn: { type: String, shield: { roles: [] } },
  
  // Admin only
  performanceReviews: { type: [String], shield: { roles: ['admin'] } }
});
```
