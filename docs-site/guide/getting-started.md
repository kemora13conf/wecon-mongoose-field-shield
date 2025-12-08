# Getting Started

Mongoose FieldShield is a native Mongoose plugin that provides **field-level access control** for your MongoDB data. It allows you to define which roles can see each field in your schemas, with support for dynamic conditions and value transforms.

## Why FieldShield?

Traditional authorization checks happen at the route level:

```typescript
// ❌ Traditional approach - error-prone
app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  
  // Manual field filtering - easy to forget!
  if (!req.user.isAdmin) {
    delete user.salary;
    delete user.ssn;
  }
  
  res.json(user);
});
```

With FieldShield, access control is **declarative** and **automatic**:

```typescript
// ✅ FieldShield approach - secure by default
const UserSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['*'] } },
  salary: { type: String, shield: { roles: ['admin', 'hr'] } },
  ssn: { type: String, shield: { roles: [] } }  // Never exposed
});

// Filtering happens automatically based on role
const user = await User.findById(id).role(req.user.roles);
res.json(user);  // Safe! Fields already filtered
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Role-based filtering** | Define which roles can access each field |
| **Database-level projection** | Sensitive fields never leave MongoDB |
| **Dynamic conditions** | Use functions for complex access logic |
| **Value transforms** | Mask or redact values based on role |
| **Aggregation security** | Automatic $project injection in pipelines |
| **Strict mode** | Fail fast if any field lacks shield config |

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Your Query    │ -> │  FieldShield │ -> │   MongoDB   │
│  .role(['user'])│    │   Middleware │    │  (filtered) │
└─────────────────┘    └──────────────┘    └─────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  .select()   │  <- DB-level projection
                       │  projection  │
                       └──────────────┘
```

FieldShield works by:
1. **Pre-query middleware**: Applies `.select()` projection based on roles
2. **Post-query middleware**: Attaches role context to documents
3. **toJSON transform**: Evaluates conditions and applies transforms

## Next Steps

- [Installation](/guide/installation) - Add FieldShield to your project
- [Quick Start](/guide/quick-start) - Build your first shielded schema
- [Shield Configuration](/guide/shield-config) - Learn all configuration options
