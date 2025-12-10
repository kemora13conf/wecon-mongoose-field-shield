# Aggregation Security

FieldShield automatically secures aggregation pipelines by injecting `$project` stages. This prevents data leaks through complex queries.

## Basic Usage

```typescript
const results = await User.aggregate([
  { $match: { status: 'active' } },
  { $group: { _id: '$department', count: { $sum: 1 } } }
]).role(['user']);  // 🛡️ Required!
```

FieldShield will inject a `$project` stage to filter fields based on the user's role.

## How It Works

1. **Before your pipeline runs**, FieldShield analyzes the allowed fields
2. **Injects a `$project` stage** at the optimal position
3. **Merges with existing $project** if present

```typescript
// Your pipeline:
[
  { $match: { status: 'active' } }
]

// After FieldShield (for 'user' role):
[
  { $match: { status: 'active' } },
  { $project: { name: 1, email: 1, _id: 1 } }  // Injected!
]
```

## Smart Stage Handling

FieldShield respects MongoDB's stage ordering requirements:

### $geoNear

Must be the first stage. FieldShield inserts `$project` after it:

```typescript
await Location.aggregate([
  { $geoNear: { near: point, distanceField: 'dist' } },
  { $limit: 10 }
]).role(['user']);

// Result:
// [
//   { $geoNear: ... },        // Stays first
//   { $project: { ... } },    // Inserted second
//   { $limit: 10 }
// ]
```

### $match Optimization

FieldShield keeps `$match` stages early for index usage:

```typescript
await User.aggregate([
  { $match: { email: /.*@company\.com/ } }
]).role(['user']);

// Result:
// [
//   { $match: { email: /.*@company\.com/ } },  // Kept first (uses index)
//   { $project: { ... } }                        // Inserted after
// ]
```

## Merging with User $project

When you have your own `$project`, FieldShield merges:

```typescript
await User.aggregate([
  { $match: { status: 'active' } },
  { $project: { fullName: { $concat: ['$firstName', ' ', '$lastName'] } } }
]).role(['user']);

// FieldShield merges your projection with allowed fields
```

## Bypass for Internal Use

For admin scripts or internal operations:

```typescript
await User.aggregate([
  { $match: {} }
]).bypassShield();  // No filtering (use with caution!)
```

## Pipeline Validation

In debug mode, FieldShield warns about risky stages:

```typescript
// These stages may expose unshielded data:
await User.aggregate([
  { $lookup: { ... } },     // ⚠️ Warning: Joined docs not shielded
  { $unwind: '$orders' },   // ⚠️ Warning: May expose array contents
  { $replaceRoot: { ... } } // ⚠️ Warning: May bypass filtering
]).role(['user']);
```

## Best Practices

### 1. Always Call .role()

```typescript
// ❌ Will throw error if model has shield config
await User.aggregate([...]);

// ✅ Correct
await User.aggregate([...]).role(['user']);
```

### 2. Use bypassShield() for Admin Scripts

```typescript
// Admin analytics script
async function generateReport() {
  return User.aggregate([
    { $group: { _id: '$plan', total: { $sum: '$revenue' } } }
  ]).bypassShield();  // OK for backend scripts
}
```

### 3. Handle $lookup Carefully

`$lookup` joins data from other collections which aren't automatically shielded:

```typescript
// The joined 'orders' won't be shielded!
await User.aggregate([
  { $match: { _id: userId } },
  { $lookup: {
    from: 'orders',
    localField: '_id',
    foreignField: 'userId',
    as: 'orders'
  }}
]).role(['user']);

// Solution: Add nested pipeline with $project
await User.aggregate([
  { $match: { _id: userId } },
  { $lookup: {
    from: 'orders',
    let: { userId: '$_id' },
    pipeline: [
      { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
      { $project: { amount: 1, date: 1 } }  // Manual field selection
    ],
    as: 'orders'
  }}
]).role(['user']);
```

### 4. Computed Fields Persistence ($addFields)

FieldShield injects its `$project` stage early in the pipeline (usually after `$match`). Any fields added **later** in the pipeline via `$addFields` or `$set` will be **preserved** and **NOT** filtered.

::: warning Overwriting Restricted Fields
If you use `$addFields` to overwrite a field that would normally be hidden (e.g., `cost` or `password`), FieldShield will **NOT** protect against this since the overwrite happens *after* the shield projection.

**Example of Risky Pipeline:**

```typescript
// 'cost' is normally hidden for 'public'
await Product.aggregate([
  { $match: { name: 'Laptop' } },
  { 
    $addFields: { 
      // OVERWRITES the hidden 'cost' field with new data!
      cost: 'Exposed String',
      
      // Safe: new computed field
      displayName: { $concat: ['$name', ' - ', '$status'] }
    } 
  }
]).role(['public']);
// Result will include 'cost': 'Exposed String'
```
:::

### 4. Test Complex Pipelines

```typescript
import { validatePipelineForShield } from '@wecon/mongoose-field-shield';

const pipeline = [
  { $match: { ... } },
  { $lookup: { ... } }
];

const warnings = validatePipelineForShield(pipeline);
console.log(warnings);
// ['Pipeline contains $lookup. Joined documents are NOT automatically shielded...']
```
