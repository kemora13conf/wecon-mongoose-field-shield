# 🛡️ FieldShield

**Native Mongoose Global Plugin for Field-Level Access Control**

FieldShield forces developers to explicitly define which roles can see which fields, then automatically filters query results based on the specified role.

## 🎯 The Problem

```typescript
// Without FieldShield - DANGEROUS!
const users = await User.find();
return res.json({ data: users }); 
// ⚠️ Exposes ALL fields: password, salary, internal notes...
```

## ✨ The Solution

```typescript
// With FieldShield - SECURE!
const users = await User.find().role(['admin']);
return res.json({ data: users }); 
// ✅ Each role sees only their authorized fields
```

## 📦 Installation

```bash
npm install field-shield
# or
yarn add field-shield
```

## 🚀 Quick Start

### 1. Install the Plugin (BEFORE defining models)

```typescript
import mongoose from 'mongoose';
import { installFieldShield } from 'field-shield';

// Call this first!
installFieldShield(mongoose, { strict: true });
```

### 2. Define Schema with Shield Config

```typescript
const UserSchema = new mongoose.Schema({
  // Public - visible to everyone
  username: {
    type: String,
    shield: { roles: ['public'] }
  },
  
  // Protected - authenticated users only
  email: {
    type: String,
    shield: { 
      roles: ['admin', 'user'],
      condition: (ctx) => ctx.document._id.equals(ctx.userId) // Owner only
    }
  },
  
  // Admin only
  salary: {
    type: Number,
    shield: { roles: ['admin', 'hr'] }
  },
  
  // Hidden from EVERYONE
  password: {
    type: String,
    shield: { roles: [] }  // Empty = hidden
  }
});
```

### 3. Query with Role (REQUIRED)

```typescript
// ✅ Correct - specify role
const users = await User.find().role(['admin']);
const user = await User.findById(id).role('user').userId(currentUserId);

// ❌ Throws error - role is mandatory
const users = await User.find(); // ShieldError: Missing .role()
```

## 📋 Shield Config Options

```typescript
shield: {
  // Required: array of role strings
  roles: ['admin', 'user'],    // Only these roles can see
  roles: ['*'],                 // All authenticated users
  roles: ['public'],            // Everyone (including anonymous)
  roles: [],                    // Hidden from ALL (even admins)
  
  // Optional: dynamic access condition
  condition: (ctx) => {
    // ctx.roles - user's roles
    // ctx.userId - user's ID
    // ctx.document - full document
    return ctx.document.ownerId.equals(ctx.userId);
  },
  
  // Optional: transform value
  transform: (value, ctx) => {
    if (ctx.roles.includes('admin')) return value;
    return `***-${value.slice(-4)}`; // Mask for others
  }
}
```

## 🔧 API Reference

### `installFieldShield(mongoose, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | boolean | `true` | Error if any field lacks shield config |
| `debug` | boolean | `!production` | Log registered models at startup |
| `defaultRoles` | string[] | `[]` | Default roles when `strict: false` |

### Query Methods

| Method | Description |
|--------|-------------|
| `.role(roles)` | **Required.** Specify roles for filtering |
| `.userId(id)` | Specify user ID for owner conditions |

## 🔍 Response Examples

Given a User with all fields populated:

**Public User:**
```json
{ "_id": "...", "username": "johndoe", "avatar": "..." }
```

**Regular User (viewing own profile):**
```json
{ "_id": "...", "username": "johndoe", "avatar": "...", "email": "john@example.com", "phone": "***-4567" }
```

**Admin:**
```json
{ "_id": "...", "username": "johndoe", "avatar": "...", "email": "john@example.com", "phone": "555-123-4567", "salary": 100000, "internalNotes": "Great employee" }
```

## ⚠️ Error Messages

FieldShield provides helpful error messages:

```
-=> FieldShield caught an error <=-

✖ Error: Missing .role() on User.find()

  Details: FieldShield requires every query to specify roles...

  Location: /app/routes/users.ts:42:15

  💡 How to fix:
  Add .role() before executing the query:

    await User.find(query).role(['admin']);
```

## 📄 License

MIT
