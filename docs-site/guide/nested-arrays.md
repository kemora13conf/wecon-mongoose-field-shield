# Nested Objects & Arrays

FieldShield v2.2+ supports automatic role inheritance for nested objects and array subdocuments.

## Nested Objects

When you define shield configs on nested object fields, the parent automatically inherits the union of all children's roles.

### Basic Nested Object

```typescript
const UserSchema = new Schema({
  name: { type: String, shield: { roles: ['public'] } },
  
  // Each child has its own shield config
  preferences: {
    theme: { type: String, shield: { roles: ['user', 'admin'] } },
    locale: { type: String, shield: { roles: ['user', 'admin'] } },
    timezone: { type: String, shield: { roles: ['user', 'admin'] } },
  },
});
```

**Result:** The `preferences` parent automatically gets `roles: ['user', 'admin']` synthesized from its children.

```typescript
// Query with 'user' role - sees preferences
const user = await User.findOne().role('user');
// { name: 'John', preferences: { theme: 'dark', locale: 'en', timezone: 'UTC' } }

// Query with 'public' role - no preferences
const publicUser = await User.findOne().role('public');
// { name: 'John' }
```

### Mixed Child Roles

When children have different roles, the parent gets the **union**.

```typescript
const SettingsSchema = new Schema({
  display: {
    publicBio: { type: String, shield: { roles: ['public'] } },
    privateNotes: { type: String, shield: { roles: ['admin'] } },
  },
});
```

**Parent `display` gets:** `roles: ['public', 'admin']`

```typescript
// 'public' role sees display.publicBio only
const settings = await Settings.findOne().role('public');
// { display: { publicBio: 'Hello world' } }

// 'admin' role sees both fields
const adminSettings = await Settings.findOne().role('admin');
// { display: { publicBio: 'Hello world', privateNotes: 'Secret' } }
```

::: tip
This is automatic - you don't need to add a shield config on the parent `display` field.
:::

## Array Subdocuments

Arrays of objects work the same way. Define shield on individual item fields.

```typescript
const ContactSchema = new Schema({
  name: { type: String, shield: { roles: ['public'] } },
  
  addresses: [{
    street: { type: String, shield: { roles: ['user', 'admin'] } },
    city: { type: String, shield: { roles: ['public'] } },
    postalCode: { type: String, shield: { roles: ['admin'] } },
  }],
});
```

**Parent `addresses` gets:** `roles: ['public', 'user', 'admin']`

```typescript
// 'public' sees addresses with city only
const contact = await Contact.findOne().role('public');
// { name: 'Jane', addresses: [{ city: 'NYC' }, { city: 'LA' }] }

// 'user' sees street and city
const userContact = await Contact.findOne().role('user');
// { name: 'Jane', addresses: [{ street: '123 Main', city: 'NYC' }...] }

// 'admin' sees all
const adminContact = await Contact.findOne().role('admin');
// { name: 'Jane', addresses: [{ street: '123 Main', city: 'NYC', postalCode: '10001' }...] }
```

## Deep Nesting

FieldShield handles arbitrary nesting depth:

```typescript
const ConfigSchema = new Schema({
  app: {
    settings: {
      security: {
        secretKey: { type: String, shield: { roles: [] } },  // Hidden
        publicKey: { type: String, shield: { roles: ['admin'] } },
      },
    },
  },
});
```

All ancestor paths (`app`, `app.settings`, `app.settings.security`) are automatically synthesized.

## Hidden Parent Rule

If **all children** have `roles: []`, the parent is also hidden.

```typescript
const SecretSchema = new Schema({
  name: { type: String, shield: { roles: ['public'] } },
  secrets: {
    token: { type: String, shield: { roles: [] } },
    key: { type: String, shield: { roles: [] } },
  },
});
```

**Result:** `secrets` is hidden from everyone since all children are hidden.

## Important Notes

::: warning Explicit Parent Shield Takes Precedence
If you add an explicit shield config on the parent, it overrides the synthesized roles.

```typescript
preferences: {
  type: {
    theme: { type: String, shield: { roles: ['admin'] } },
    locale: { type: String, shield: { roles: ['admin'] } },
  },
  // Explicit shield on parent - takes precedence!
  shield: { roles: ['superadmin'] }
},
```
:::

::: danger Conditions on Nested Fields
Conditions (`condition` function) are only evaluated on the specific field, not inherited by parents.
:::
