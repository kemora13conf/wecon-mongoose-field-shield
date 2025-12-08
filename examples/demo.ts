/**
 * FieldShield Demo
 *
 * Run with: npx ts-node examples/demo.ts
 */

import mongoose from 'mongoose';
import { installFieldShield, ShieldContext } from '../src';

// ============================================================================
// 1. Install FieldShield BEFORE defining any models
// ============================================================================

installFieldShield(mongoose, {
  strict: true,   // Require shield config on all fields
  debug: true,    // Log registered models
});

// ============================================================================
// 2. Define schema with shield configuration
// ============================================================================

const UserSchema = new mongoose.Schema({
  // Public fields - visible to everyone
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true,
    shield: { roles: ['public'] },
  },
  username: {
    type: String,
    required: true,
    shield: { roles: ['public'] },
  },
  avatar: {
    type: String,
    shield: { roles: ['public'] },
  },

  // Protected fields - visible to authenticated users
  email: {
    type: String,
    required: true,
    shield: {
      roles: ['admin', 'user'],
      // Only owner or admin can see full email
      condition: (ctx: ShieldContext) =>
        ctx.roles.includes('admin') ||
        ctx.document._id?.toString() === ctx.userId,
    },
  },
  phone: {
    type: String,
    shield: {
      roles: ['admin', 'user'],
      // Mask phone for non-admins
      transform: (value: string, ctx: ShieldContext) =>
        ctx.roles.includes('admin') ? value : `***-${value.slice(-4)}`,
    },
  },

  // Admin-only fields
  salary: {
    type: Number,
    shield: { roles: ['admin', 'hr'] },
  },
  internalNotes: {
    type: String,
    shield: { roles: ['admin'] },
  },

  // Hidden from EVERYONE (including admins)
  password: {
    type: String,
    required: true,
    shield: { roles: [] },  // Empty = hidden from all
  },
  refreshToken: {
    type: String,
    shield: { roles: [] },
  },
});

const User = mongoose.model('User', UserSchema);

// ============================================================================
// 3. Demo queries with different roles
// ============================================================================

async function demo() {
  // Connect to in-memory MongoDB
  await mongoose.connect('mongodb://localhost:27017/fieldshield-demo');

  // Create test user
  const testUser = await User.create({
    username: 'johndoe',
    avatar: 'https://example.com/avatar.jpg',
    email: 'john@example.com',
    phone: '555-123-4567',
    salary: 100000,
    internalNotes: 'Great employee',
    password: 'hashed_password_123',
    refreshToken: 'secret_token',
  });

  console.log('\n─────────────────────────────────────────');
  console.log('📋 Original document (unfiltered):');
  console.log(testUser.toObject());

  console.log('\n─────────────────────────────────────────');
  console.log('👤 Query as PUBLIC user:');
  const publicView = await User.findById(testUser._id).role('public');
  console.log(publicView);
  // Only sees: _id, username, avatar

  console.log('\n─────────────────────────────────────────');
  console.log('👤 Query as regular USER (different user):');
  const userView = await User.findById(testUser._id)
    .role('user')
    .userId('different-user-id');
  console.log(userView);
  // Sees: _id, username, avatar, phone (masked)
  // Does NOT see email (condition failed - not owner)

  console.log('\n─────────────────────────────────────────');
  console.log('👤 Query as the OWNER:');
  const ownerView = await User.findById(testUser._id)
    .role('user')
    .userId(testUser._id!.toString());
  console.log(ownerView);
  // Sees: _id, username, avatar, email (is owner), phone (masked)

  console.log('\n─────────────────────────────────────────');
  console.log('👑 Query as ADMIN:');
  const adminView = await User.findById(testUser._id).role('admin');
  console.log(adminView);
  // Sees everything except password and refreshToken

  // Cleanup
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

// Run demo
demo().catch(console.error);
