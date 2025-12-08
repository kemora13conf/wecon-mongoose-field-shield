# Installation

## Requirements

- **Node.js**: >= 18.0.0
- **Mongoose**: 6.x, 7.x, or 8.x
- **TypeScript**: >= 5.0 (optional but recommended)

## Package Installation

::: code-group

```bash [npm]
npm install @wecon/mongoose-field-shield
```

```bash [yarn]
yarn add @wecon/mongoose-field-shield
```

```bash [pnpm]
pnpm add @wecon/mongoose-field-shield
```

:::

## Peer Dependencies

FieldShield requires `mongoose` as a peer dependency. Make sure you have it installed:

```bash
npm install mongoose
```

## TypeScript Setup

FieldShield is written in TypeScript and includes type definitions. No additional `@types` package is needed.

For best TypeScript experience, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "node"
  }
}
```

## Initialization

FieldShield must be installed **before** defining any Mongoose models:

```typescript
// db.ts or app.ts - MUST be called first!
import mongoose from 'mongoose';
import { installFieldShield } from '@wecon/mongoose-field-shield';

// Install FieldShield
installFieldShield(mongoose, {
  strict: true,  // Require shield config on all fields
  debug: process.env.NODE_ENV !== 'production'
});

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI);

// Now import your models
import './models/User';
import './models/Post';
```

::: warning IMPORTANT
`installFieldShield()` must be called **before** any `mongoose.model()` calls. If you call it after models are defined, those models won't have shield protection.
:::

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `true` | Require all schema fields to have shield config |
| `debug` | `boolean` | `NODE_ENV !== 'production'` | Log registration info |
| `defaultRoles` | `string[]` | `[]` | Default roles if none specified |

## Verifying Installation

To verify FieldShield is installed correctly:

```typescript
import { isShieldInstalled, getShieldDebugInfo } from '@wecon/mongoose-field-shield';

console.log('Installed:', isShieldInstalled());
console.log(getShieldDebugInfo());
```

## Next Steps

- [Quick Start](/guide/quick-start) - Create your first shielded model
