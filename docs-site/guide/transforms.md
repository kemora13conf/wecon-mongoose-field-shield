# Transforms

Transforms modify field values before returning them to the client. Use them for masking, redaction, or role-based formatting.

## Basic Syntax

```typescript
{
  shield: {
    roles: ['user'],
    transform: (value, ctx) => modifiedValue
  }
}
```

## Context Object

```typescript
interface ShieldContext {
  roles: string[];      
  userId?: string;      
  document: object;    
  field: string;       
  model: string;        
}
```

## Common Patterns

### Phone Number Masking

```typescript
phone: {
  type: String,
  shield: {
    roles: ['*'],
    transform: (val) => {
      if (!val) return val;
      return val.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
    }
  }
}
// "1234567890" → "123****890"
```

### Email Partial Reveal

```typescript
email: {
  type: String,
  shield: {
    roles: ['*'],
    transform: (val) => {
      if (!val) return val;
      const [name, domain] = val.split('@');
      return `${name[0]}${'*'.repeat(name.length - 1)}@${domain}`;
    }
  }
}
// "john.doe@example.com" → "j*******@example.com"
```

### Credit Card Masking

```typescript
cardNumber: {
  type: String,
  shield: {
    roles: ['user'],
    transform: (val) => val ? `****-****-****-${val.slice(-4)}` : null
  }
}
// "4111111111111111" → "****-****-****-1111"
```

### Role-Based Display

```typescript
salary: {
  type: Number,
  shield: {
    roles: ['hr', 'admin', 'self'],
    transform: (val, ctx) => {
      // Admin sees exact value
      if (ctx.roles.includes('admin')) {
        return val;
      }
      // HR sees range
      if (ctx.roles.includes('hr')) {
        const base = Math.floor(val / 10000) * 10000;
        return { min: base, max: base + 10000 };
      }
      // Self sees formatted
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(val);
    }
  }
}
```

### Date Formatting

```typescript
birthDate: {
  type: Date,
  shield: {
    roles: ['*'],
    transform: (val, ctx) => {
      if (ctx.roles.includes('admin')) {
        return val;  // Full date
      }
      // Others see only year
      return val.getFullYear();
    }
  }
}
```

## Error Handling

If a transform throws, the field is excluded and a warning logged:

```typescript
// Safe transform with null check
transform: (val) => val?.toUpperCase() ?? null
```

## Async Transforms

::: warning
Async transforms are NOT supported in `toJSON`. Keep transforms synchronous.
:::
