# FieldShield

**Native Mongoose Global Plugin for Field-Level Access Control**

[![npm version](https://img.shields.io/npm/v/@wecon/mongoose-field-shield.svg?style=flat-square)](https://www.npmjs.com/package/@wecon/mongoose-field-shield)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

FieldShield forces developers to explicitly define which roles were authorized to access specific fields, then automatically filters query results based on the provided role. It integrates directly into the Mongoose query lifecycle to ensure data security at the database abstraction layer.

## Key Features

- **Field-Level Security:** Define access control rules directly within your Mongoose Schemas.
- **Role-Based Access:** Simple role string matching for clear authorization logic.
- **Dynamic Conditions:** Support for runtime evaluations (e.g., owner checks) per field.
- **Data Transformation:** Capability to mask or transform sensitive data based on roles.
- **Native Integration:** Works with `find`, `findOne`, and aggregation pipelines seamlessly.

## Installation

Install the package via npm or yarn:

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

// Initialize FieldShield with strict mode enabled
installFieldShield(mongoose, { strict: true });
```

### 2. Schema Definition

Add the `shield` configuration object to your schema paths.

```typescript
const UserSchema = new mongoose.Schema({
  // Publicly accessible field
  username: {
    type: String,
    shield: { roles: ['public'] }
  },
  
  // Restricted field (Admin & User roles only)
  // detailed access control via condition
  email: {
    type: String,
    shield: { 
      roles: ['admin', 'user'],
      condition: (ctx) => ctx.document._id.equals(ctx.userId) // Only owner can view
    }
  },
  
  // Highly restricted field (Admin only)
  salary: {
    type: Number,
    shield: { roles: ['admin', 'hr'] }
  },
  
  // Hidden field (Empty roles array = inaccessible)
  password: {
    type: String,
    shield: { roles: [] }
  }
});
```

### 3. Executing Queries

Function calls must include the `.role()` modifier to specify the context of the request.

```typescript
// Authorized query
const users = await User.find().role(['admin']);

// Context-aware query (for ownership checks)
const user = await User.findById(id)
  .role('user')
  .userId(currentUserId);

// Invalid query (Will throw ShieldError)
// const users = await User.find(); 
```

## Configuration

### Shield Options

The `shield` object in your schema definition accepts the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `roles` | `string[]` | **Required.** Array of allowed roles. Use `['*']` for all authenticated users, `['public']` for everyone, or specific role strings. |
| `condition` | `Function` | Optional. A synchronous function returning a boolean. Receives a context object `(ctx)` containing `roles`, `userId`, `document`, and `field`. |
| `transform` | `Function` | Optional. A function to modify the value before return. Useful for masking data (e.g., masking phone numbers). |

### Plugin Initialization

`installFieldShield(mongoose, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `true` | If true, throws an error if any schema path is missing a `shield` configuration. Recommended for security. |
| `debug` | `boolean` | `false` | Enables verbose logging of registered models and policies at startup. |
| `defaultRoles` | `string[]` | `[]` | Defines default access roles for fields without explicit configuration (only applies when `strict` is false). |

## API Reference

### Query Chain Methods

When `FieldShield` is installed, it extends the Mongoose `Query` and `Aggregate` prototypes.

#### `.role(roles: string | string[])`
Specifies the role(s) acting on the query. This is mandatory for all queries on shielded models.

#### `.userId(id: string)`
Specifies the ID of the user making the request. Required if usage of `condition` logic depends on user identity (e.g., `ctx.userId`).

## Error Handling

FieldShield is designed to fail securely. If a query violates strict mode or fails to provide necessary context, a `ShieldError` will be thrown with detailed information about the location and nature of the violation.

```text
Error: Missing .role() on User.find()
  Details: FieldShield requires every query to specify roles...
  Location: /app/services/user.service.ts:15:20
```

## License

This project is licensed under the MIT License.
