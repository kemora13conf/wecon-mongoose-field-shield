# Basic Usage Examples

Common patterns and examples for using FieldShield in your applications.

## User Profile API

A complete example of a user profile API with role-based access:

```typescript
// models/User.ts
import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    shield: { roles: ['public'] }  // Anyone can see usernames
  },
  email: {
    type: String,
    required: true,
    shield: { roles: ['admin', 'self'] }
  },
  avatar: {
    type: String,
    shield: { roles: ['public'] }
  },
  bio: {
    type: String,
    shield: { roles: ['public'] }
  },
  phone: {
    type: String,
    shield: { 
      roles: ['admin', 'self'],
      transform: (val, ctx) => {
        if (ctx.roles.includes('admin')) return val;
        return val?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
      }
    }
  },
  password: {
    type: String,
    required: true,
    shield: { roles: [] }
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    shield: { roles: ['admin'] }
  },
  lastLoginAt: {
    type: Date,
    shield: { roles: ['admin', 'self'] }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    shield: { roles: ['*'] }
  }
});

export const User = mongoose.model('User', UserSchema);
```

```typescript
// routes/users.ts
import express from 'express';
import { User } from '../models/User';

const router = express.Router();

// Helper to get roles with 'self' check
function getUserRoles(req: any, resourceUserId?: string) {
  const roles = [...(req.user?.roles || ['guest'])];
  
  if (resourceUserId && req.user?.id === resourceUserId) {
    roles.push('self');
  }
  
  return roles;
}

// GET /users - List users (public view)
router.get('/users', async (req, res) => {
  const users = await User.find()
    .role(['public'])
    .limit(50);
  
  res.json(users);
});

// GET /users/:id - Get user profile
router.get('/users/:id', async (req, res) => {
  const roles = getUserRoles(req, req.params.id);
  
  const user = await User.findById(req.params.id)
    .role(roles)
    .userId(req.user?.id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(user);
});

// GET /me - Get current user profile
router.get('/me', async (req, res) => {
  const user = await User.findById(req.user.id)
    .role([...req.user.roles, 'self'])
    .userId(req.user.id);
  
  res.json(user);
});

export default router;
```

## Blog with Author Visibility

Posts with different visibility based on publication status:

```typescript
const PostSchema = new Schema({
  title: {
    type: String,
    shield: { roles: ['public'] }
  },
  slug: {
    type: String,
    shield: { roles: ['public'] }
  },
  content: {
    type: String,
    shield: {
      roles: ['public'],
      condition: (ctx) => {
        // Published posts visible to all
        if (ctx.document.status === 'published') return true;
        // Drafts only to author
        return ctx.document.authorId?.toString() === ctx.userId;
      }
    }
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    shield: { roles: ['self', 'admin'] }
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    shield: { roles: ['public'] }
  },
  viewCount: {
    type: Number,
    default: 0,
    shield: { roles: ['self', 'admin'] }  // Only author/admin sees stats
  }
});
```

## E-Commerce Product

Product with role-based pricing visibility:

```typescript
const ProductSchema = new Schema({
  name: {
    type: String,
    shield: { roles: ['public'] }
  },
  description: {
    type: String,
    shield: { roles: ['public'] }
  },
  images: {
    type: [String],
    shield: { roles: ['public'] }
  },
  price: {
    type: Number,
    shield: { roles: ['*'] }  // Must be logged in to see price
  },
  costPrice: {
    type: Number,
    shield: { roles: ['admin', 'inventory'] }
  },
  stockQuantity: {
    type: Number,
    shield: { roles: ['admin', 'inventory'] }
  },
  supplier: {
    type: String,
    shield: { roles: ['admin'] }
  }
});
```

## Express Middleware Integration

Create middleware to automatically add roles:

```typescript
// middleware/attachRoles.ts
export function attachShieldRoles(req, res, next) {
  // Store roles on request for easy access
  req.shieldRoles = req.user?.roles || ['guest'];
  next();
}

// Usage
app.use(attachShieldRoles);

// In route
const users = await User.find().role(req.shieldRoles);
```
