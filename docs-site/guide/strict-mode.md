# Strict Mode

Strict mode ensures all schema fields have explicit shield configuration, preventing accidental data exposure.

## Enabling Strict Mode

```typescript
installFieldShield(mongoose, { strict: true });  // Default
```

## How It Works

In strict mode, FieldShield validates that every field (except `_id` and `__v`) has a `shield` config on first query.

```typescript
// ❌ Will throw on first query (missing shield)
const BadSchema = new Schema({
  name: { type: String, shield: { roles: ['*'] } },
  age: { type: Number }  // No shield config!
});

// ✅ All fields configured
const GoodSchema = new Schema({
  name: { type: String, shield: { roles: ['*'] } },
  age: { type: Number, shield: { roles: ['*'] } }
});
```

## Error Message

```
ShieldError: Missing shield config for "age" in User schema

DETAILS:
Strict mode requires all schema fields to have explicit 
shield configuration. This prevents accidental data exposure.

FIX:
Add shield config to the field:
  const UserSchema = new Schema({
    age: {
      type: Number,
      shield: { roles: ['admin'] }
    }
  });
```

## Disabling Strict Mode

```typescript
installFieldShield(mongoose, { strict: false });
```

In non-strict mode:
- Fields without `shield` are treated as hidden
- No validation errors on model creation

## Best Practices

### 1. Start with Strict Mode

Always use strict mode in new projects to catch missing configs early.

### 2. Use Hidden by Default

If unsure, hide the field:

```typescript
newField: {
  type: String,
  shield: { roles: [] }  // Hidden until you decide
}
```

### 3. Review Before Disabling

If you disable strict mode, audit all fields to ensure nothing is exposed unintentionally.
