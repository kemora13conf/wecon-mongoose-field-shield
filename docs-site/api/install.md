# installFieldShield

The main function to install FieldShield into your Mongoose instance.

## Signature

```typescript
function installFieldShield(
  mongoose: Mongoose,
  options?: ShieldOptions
): void
```

## Parameters

### mongoose

The Mongoose instance to install FieldShield on.

```typescript
import mongoose from 'mongoose';
installFieldShield(mongoose);
```

### options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `true` | Require all fields to have shield config |
| `debug` | `boolean` | `!production` | Log registration details |
| `defaultRoles` | `string[]` | `[]` | Default roles for unspecified fields |

## Usage

```typescript
import mongoose from 'mongoose';
import { installFieldShield } from '@wecon/mongoose-field-shield';

// Basic installation
installFieldShield(mongoose);

// With options
installFieldShield(mongoose, {
  strict: true,
  debug: process.env.NODE_ENV === 'development'
});
```

## Related Functions

### isShieldInstalled()

Check if FieldShield is installed.

```typescript
import { isShieldInstalled } from '@wecon/mongoose-field-shield';

if (!isShieldInstalled()) {
  installFieldShield(mongoose);
}
```

### getShieldDebugInfo()

Get debug information about registered models.

```typescript
import { getShieldDebugInfo } from '@wecon/mongoose-field-shield';

console.log(getShieldDebugInfo());
// Output:
// FieldShield Registered Models:
// Shield config for User:
//   username: *, admin
//   email: admin, self
//   password: (hidden)
```

### clearShield()

Clear all registered policies. Useful for testing.

```typescript
import { clearShield } from '@wecon/mongoose-field-shield';

beforeEach(() => {
  clearShield();  // Reset state between tests
});
```
