# FieldShield

**Native Mongoose Global Plugin for Field-Level Access Control**

[![npm version](https://img.shields.io/npm/v/@wecon/mongoose-field-shield.svg?style=flat-square)](https://www.npmjs.com/package/@wecon/mongoose-field-shield)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Mongoose](https://img.shields.io/badge/Mongoose-6.x%20|%207.x%20|%208.x-green.svg?style=flat-square)](https://mongoosejs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)

FieldShield forces developers to explicitly define which roles are authorized to access specific fields, then automatically filters query results based on the provided role. It integrates directly into the Mongoose query lifecycle to ensure data security at the database abstraction layer.

## Compatibility

| Dependency | Supported Versions |
|------------|-------------------|
| **Mongoose** | `^6.0.0`, `^7.0.0`, `^8.0.0` |
| **Node.js** | `>=18.0.0` |

## Key Features

- **Field-Level Security:** Define access control rules directly within your Mongoose Schemas.
- **Role-Based Access:** Simple role string matching for clear authorization logic.
- **Nested Object Support:** Parent fields automatically inherit roles from their children.
- **Array Subdocument Support:** Shield configs on array item fields are properly inherited.
- **Dynamic Conditions:** Support for runtime evaluations (e.g., owner checks) per field.
- **Data Transformation:** Capability to mask or transform sensitive data based on roles.

## Installation

```bash
npm install @wecon/mongoose-field-shield
# or
yarn add @wecon/mongoose-field-shield
```


## Quick Start

### 1. Registration

Register the plugin globally with Mongoose before defining any models.

```typescript
import mongoose from 'mongoose';
import { installFieldShield } from '@wecon/mongoose-field-shield';

installFieldShield(mongoose, { strict: true });
```

### 2. Schema Definition

Add the `shield` configuration object to your schema paths.

```typescript
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    shield: { roles: ['public'] }
  },
  email: {
    type: String,
    shield: { roles: ['admin', 'user'] }
  },
  password: {
    type: String,
    shield: { roles: [] } // Hidden from everyone
  }
});
```

### 3. Executing Queries

Queries must include the `.role()` modifier.

```typescript
const users = await User.find().role('admin');
const user = await User.findById(id).role('user').userId(currentUserId);
```

---

## Progressive Examples

### Basic: Simple Fields

```typescript
const ProductSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['public'] } },
  price: { type: Number, shield: { roles: ['public'] } },
  cost: { type: Number, shield: { roles: ['admin'] } }, // Hidden from public
});
```

### Intermediate: Nested Objects

For nested objects, you can define shield on individual child fields. **Parent fields automatically inherit the union of their children's roles.**

```typescript
const UserSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['public'] } },
  
  // Nested object - each child has its own shield
  preferences: {
    theme: { type: String, shield: { roles: ['user', 'admin'] } },
    locale: { type: String, shield: { roles: ['user', 'admin'] } },
    timezone: { type: String, shield: { roles: ['user', 'admin'] } },
  },
});

// Query with 'user' role will include preferences object
const user = await User.findOne().role('user');
// { name: 'John', preferences: { theme: 'dark', locale: 'en', timezone: 'UTC' } }

// Query with 'public' role will NOT include preferences
const publicUser = await User.findOne().role('public');
// { name: 'John' }
```

### Intermediate: Mixed Nested Roles

When children have different roles, the parent inherits the union (combination) of all children's roles.

```typescript
const SettingsSchema = new mongoose.Schema({
  display: {
    publicBio: { type: String, shield: { roles: ['public'] } },
    privateNotes: { type: String, shield: { roles: ['admin'] } },
  },
});

// 'public' role sees the display object, but only publicBio is visible inside
const settings = await Settings.findOne().role('public');
// { display: { publicBio: 'Hello world' } }

// 'admin' role sees both fields
const adminSettings = await Settings.findOne().role('admin');
// { display: { publicBio: 'Hello world', privateNotes: 'Internal note' } }
```

### Advanced: Array of Subdocuments

For arrays containing objects, define shield on individual item fields:

```typescript
const ContactSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['public'] } },
  
  addresses: [{
    street: { type: String, shield: { roles: ['user', 'admin'] } },
    city: { type: String, shield: { roles: ['public'] } },
    postalCode: { type: String, shield: { roles: ['admin'] } },
  }],
});

// 'public' role sees addresses array with only city visible
const contact = await Contact.findOne().role('public');
// { name: 'Jane', addresses: [{ city: 'NYC' }, { city: 'LA' }] }

// 'user' role sees street and city
const userContact = await Contact.findOne().role('user');
// { name: 'Jane', addresses: [{ street: '123 Main', city: 'NYC' }, ...] }

// 'admin' role sees all fields
const adminContact = await Contact.findOne().role('admin');
// { name: 'Jane', addresses: [{ street: '123 Main', city: 'NYC', postalCode: '10001' }, ...] }
```

### Advanced: Deeply Nested Structures

FieldShield handles arbitrary nesting depth:

```typescript
const ConfigSchema = new mongoose.Schema({
  app: {
    settings: {
      security: {
        secretKey: { type: String, shield: { roles: [] } }, // Hidden
        publicKey: { type: String, shield: { roles: ['admin'] } },
      },
    },
  },
});

// Parent paths (app, app.settings, app.settings.security) are automatically
// synthesized with the combined roles of their children
```

---

## Common Pitfalls

### 1. Forgetting `.role()` on Queries

```typescript
// ERROR: ShieldError - Missing .role() on User.find()
const users = await User.find();

// CORRECT
const users = await User.find().role('admin');
```

### 2. Missing Shield Config in Strict Mode

When `strict: true`, ALL schema fields must have a shield config:

```typescript
// ERROR: ShieldError - Missing shield config for "email"
const UserSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['public'] } },
  email: { type: String }, // Missing shield!
});

// CORRECT
const UserSchema = new mongoose.Schema({
  name: { type: String, shield: { roles: ['public'] } },
  email: { type: String, shield: { roles: ['user'] } },
});
```

### 3. Async Conditions Are Not Supported

Conditions must be synchronous. Async conditions are silently skipped:

```typescript
// WRONG - async condition will be ignored
email: {
  type: String,
  shield: {
    roles: ['user'],
    condition: async (ctx) => await checkPermission(ctx.userId) // Ignored!
  }
}

// CORRECT - synchronous condition
email: {
  type: String,
  shield: {
    roles: ['user'],
    condition: (ctx) => ctx.document._id.equals(ctx.userId)
  }
}
```

### 4. Aggregation Computed Fields ($addFields)

FieldShield injects filtering **early** in the pipeline. Fields added via `$addFields` or `$set` later in the pipeline are **preserved**.

> **Warning:** Be careful not to use `$addFields` to overwrite a field that should be hidden (e.g., `password`), as the pipeline modification happens *after* FieldShield's protection stage.

---

## Configuration Reference

### Shield Options

| Property | Type | Description |
|----------|------|-------------|
| `roles` | `string[]` | **Required.** Allowed roles. Use `['*']` for all authenticated, `['public']` for everyone, `[]` for hidden. |
| `condition` | `Function` | Optional sync function returning boolean. Context: `{ roles, userId, document, field }`. |
| `transform` | `Function` | Optional function to modify value (e.g., masking). |

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `true` | Throws error if any field is missing shield config. |
| `debug` | `boolean` | `false` | Enables verbose logging. |

## API Reference

### Query Methods

- **`.role(roles: string | string[])`** - Specifies the role(s) for the query. Required.
- **`.userId(id: string)`** - Specifies the user ID for condition evaluations.
- **`.bypassShield()`** - Disables field filtering for this query (use with caution).

## License

MIT License

