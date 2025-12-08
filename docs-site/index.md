---
layout: home

hero:
  name: "Mongoose FieldShield"
  text: "Field-Level Access Control"
  tagline: Secure your MongoDB data at the field level with role-based access control, dynamic conditions, and value transforms.
  image:
    src: /logo.svg
    alt: FieldShield Logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/kemora13conf/wecon-mongoose-field-shield

features:
  - icon: 🛡️
    title: Role-Based Field Filtering
    details: Define which roles can access each field. Hide sensitive data automatically based on user roles.
  - icon: ⚡
    title: Database-Level Projection
    details: Filters data at the MongoDB query level for maximum performance. Sensitive data never leaves the database.
  - icon: 🔄
    title: Dynamic Conditions
    details: Use functions to determine field access dynamically. Perfect for "owner-only" patterns.
  - icon: 🎭
    title: Value Transforms
    details: Mask or redact field values based on role. Show partial data like masked phone numbers.
  - icon: 📊
    title: Aggregation Security
    details: Secure aggregation pipelines with automatic $project injection. Prevents data leaks in complex queries.
  - icon: 📝
    title: TypeScript First
    details: Full TypeScript support with type-safe configuration and IDE autocompletion.
---

## Quick Example

```typescript
import mongoose from 'mongoose';
import { installFieldShield } from '@wecon/mongoose-field-shield';

// Install before defining models
installFieldShield(mongoose, { strict: true });

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    shield: { roles: ['*'] }  // All authenticated users
  },
  email: { 
    type: String, 
    shield: { roles: ['admin', 'self'] }  // Admin or self only
  },
  password: { 
    type: String, 
    shield: { roles: [] }  // Hidden from everyone
  },
  salary: {
    type: Number,
    shield: { 
      roles: ['hr', 'admin'],
      transform: (val, ctx) => ctx.roles.includes('admin') ? val : '***'
    }
  }
});

// Query with role - returns filtered Mongoose Document
const user = await User.findOne({ username: 'john' }).role(['user']);
// password is NOT fetched from DB (projection)
// email is hidden unless user is admin or self
```
