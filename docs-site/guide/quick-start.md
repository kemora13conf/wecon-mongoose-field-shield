# Quick Start

This guide will walk you through creating a shielded User model with role-based access control.

## Step 1: Install FieldShield

```typescript
// app.ts
import mongoose from 'mongoose';
import { installFieldShield } from '@wecon/mongoose-field-shield';

installFieldShield(mongoose, { strict: true });

await mongoose.connect('mongodb://localhost:27017/myapp');
```

## Step 2: Define Your Schema

```typescript
// models/User.ts
import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  // Public fields - visible to all authenticated users
  username: {
    type: String,
    required: true,
    shield: { roles: ['*'] }
  },
  
  avatar: {
    type: String,
    shield: { roles: ['*'] }
  },
  
  // Protected fields - visible to specific roles
  email: {
    type: String,
    required: true,
    shield: { roles: ['admin', 'self'] }
  },
  
  phone: {
    type: String,
    shield: { 
      roles: ['admin', 'self'],
      transform: (value, ctx) => {
        // Mask for non-admins
        if (!ctx.roles.includes('admin')) {
          return value.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
        }
        return value;
      }
    }
  },
  
  // Private fields - never exposed via API
  password: {
    type: String,
    required: true,
    shield: { roles: [] }  // Empty = hidden from everyone
  },
  
  // Admin-only fields
  internalNotes: {
    type: String,
    shield: { roles: ['admin'] }
  }
});

export const User = mongoose.model('User', UserSchema);
```

## Step 3: Query with Roles

```typescript
// routes/users.ts
import { User } from '../models/User';

// Middleware that extracts user roles from JWT/session
const getUserRoles = (req) => {
  return req.user?.roles || ['guest'];
};

// GET /users/:id
app.get('/users/:id', async (req, res) => {
  const roles = getUserRoles(req);
  
  // Add 'self' role if viewing own profile
  if (req.params.id === req.user?.id) {
    roles.push('self');
  }
  
  const user = await User.findById(req.params.id)
    .role(roles);  // 🛡️ Apply role filtering
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(user);  // Already filtered!
});

// GET /users (list)
app.get('/users', async (req, res) => {
  const roles = getUserRoles(req);
  
  const users = await User.find()
    .role(roles)
    .limit(20);
  
  res.json(users);
});
```

## Step 4: Test It!

```typescript
// Create a test user
await User.create({
  username: 'john',
  email: 'john@example.com',
  phone: '1234567890',
  password: 'hashed_password',
  internalNotes: 'VIP customer'
});

// Query as regular user
const asUser = await User.findOne({ username: 'john' }).role(['user']);
console.log(asUser.toJSON());
// Output: { _id: '...', username: 'john', avatar: null }

// Query as admin
const asAdmin = await User.findOne({ username: 'john' }).role(['admin']);
console.log(asAdmin.toJSON());
// Output: { _id: '...', username: 'john', email: 'john@example.com', 
//           phone: '1234567890', internalNotes: 'VIP customer' }

// Note: password is NEVER returned (not even to admin)
```

## What's Happening?

1. **Pre-query**: FieldShield applies `.select()` based on allowed fields
2. **MongoDB**: Only returns the projected fields (efficient!)
3. **Post-query**: Role context is attached to the document
4. **toJSON**: Conditions and transforms are evaluated

## Next Steps

- [Shield Configuration](/guide/shield-config) - All configuration options
- [Dynamic Conditions](/guide/conditions) - Owner checks and more
- [Value Transforms](/guide/transforms) - Masking and redaction
