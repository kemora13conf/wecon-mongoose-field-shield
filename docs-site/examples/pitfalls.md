# Common Pitfalls

Avoid these common mistakes when using FieldShield.

## 1. Forgetting .role() on Queries

**Problem**: Queries without `.role()` throw an error.

```typescript
// ❌ This throws ShieldError
const users = await User.find();
```

**Solution**: Always call `.role()`:

```typescript
// ✅ Correct
const users = await User.find().role(['user']);

// For internal use
const users = await User.find().bypassShield();
```

---

## 2. Checking Fields on Mongoose Documents

**Problem**: Mongoose documents have getters for all schema fields, even if not fetched.

```typescript
// ❌ This will log 'undefined', not fail
const user = await User.findOne().role(['public']);
console.log(user.password);  // undefined (but getter exists!)
```

**Solution**: Use `toJSON()` to get filtered object:

```typescript
// ✅ Check on serialized object
const user = await User.findOne().role(['public']);
const json = user.toJSON();
console.log('password' in json);  // false
```

---

## 3. Async Conditions in toJSON

**Problem**: `toJSON` is synchronous; async conditions are ignored.

```typescript
// ❌ This won't work
shield: {
  roles: ['user'],
  condition: async (ctx) => {
    const hasPermission = await checkPermission(ctx.userId);
    return hasPermission;
  }
}
```

**Solution**: Pre-check permissions and use roles:

```typescript
// ✅ Check before query
const canViewSalary = await checkPermission(req.user.id, 'view_salary');
const roles = canViewSalary ? ['user', 'salary-viewer'] : ['user'];
const user = await User.findById(id).role(roles);
```

---

## 4. Missing Shield Config (Strict Mode)

**Problem**: In strict mode, all fields need shield config.

```typescript
// ❌ Throws on first query if strict: true
const UserSchema = new Schema({
  name: { type: String, shield: { roles: ['*'] } },
  age: { type: Number }  // Missing shield!
});
```

**Solution**: Add shield to all fields:

```typescript
// ✅ All fields configured
const UserSchema = new Schema({
  name: { type: String, shield: { roles: ['*'] } },
  age: { type: Number, shield: { roles: ['*'] } }
});
```

---

## 5. Populate Without Shield

**Problem**: Populated documents retain shield config of their own model.

```typescript
// Post has author populated
const post = await Post.findById(id)
  .populate('author')
  .role(['user']);

// post.author is a User document with User's shield config
// but it was queried without .role()!
```

**Solution**: The populated document uses the role from the parent query. Ensure both models have appropriate shield configs.

---

## 6. $lookup Bypass

**Problem**: `$lookup` joins data that isn't automatically shielded.

```typescript
// ❌ Joined orders are NOT shielded
await User.aggregate([
  { $lookup: { from: 'orders', ... } }
]).role(['user']);
```

**Solution**: Use pipeline with explicit projection:

```typescript
// ✅ Manual projection in nested pipeline
await User.aggregate([
  { $lookup: {
    from: 'orders',
    pipeline: [
      { $project: { amount: 1, date: 1 } }  // Only safe fields
    ],
    as: 'orders'
  }}
]).role(['user']);
```

---

## 7. Transform Side Effects

**Problem**: Transforms that modify external state.

```typescript
// ❌ Side effect in transform
shield: {
  roles: ['user'],
  transform: (val, ctx) => {
    logAccess(ctx.userId, ctx.field);  // Side effect!
    return val;
  }
}
```

**Solution**: Keep transforms pure; log elsewhere:

```typescript
// ✅ Pure transform
shield: {
  roles: ['user'],
  transform: (val) => maskValue(val)
}

// Log in middleware instead
app.use((req, res, next) => {
  res.on('finish', () => logAccess(req.user?.id));
  next();
});
```

---

## 8. Performance: Complex Conditions

**Problem**: Heavy conditions run for every document.

```typescript
// ❌ Expensive condition
shield: {
  roles: ['user'],
  condition: (ctx) => {
    return heavyComputation(ctx.document);
  }
}
```

**Solution**: Pre-filter or use simple conditions:

```typescript
// ✅ Filter at query level
const allowedIds = await getAccessibleIds(req.user.id);
const docs = await Model.find({ _id: { $in: allowedIds } })
  .role(['user']);
```
