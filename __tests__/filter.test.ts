/**
 * FieldShield - Core Filtering Tests
 *
 * Tests the core filtering logic:
 * - Role-based field access
 * - Hidden fields
 * - Condition-based access
 * - Transform functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldContext } from '../src';

describe('Core Filtering', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false });
  });

  describe('Role-based access', () => {
    it('should filter fields based on role', async () => {
      const UserSchema = new Schema({
        username: { type: String, shield: { roles: ['public'] } },
        email: { type: String, shield: { roles: ['admin', 'user'] } },
        salary: { type: Number, shield: { roles: ['admin'] } },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({
        username: 'john',
        email: 'john@example.com',
        salary: 100000,
      });

      // Admin sees all
      const adminResult = await User.findOne().role('admin');
      expect(adminResult).toHaveProperty('username', 'john');
      expect(adminResult).toHaveProperty('email', 'john@example.com');
      expect(adminResult).toHaveProperty('salary', 100000);

      // User sees username and email
      const userResult = await User.findOne().role('user');
      expect(userResult).toHaveProperty('username', 'john');
      expect(userResult).toHaveProperty('email', 'john@example.com');
      expect(userResult).not.toHaveProperty('salary');

      // Public sees only username
      const publicResult = await User.findOne().role('public');
      expect(publicResult).toHaveProperty('username', 'john');
      expect(publicResult).not.toHaveProperty('email');
      expect(publicResult).not.toHaveProperty('salary');
    });

    it('should handle wildcard (*) role for all authenticated users', async () => {
      const PostSchema = new Schema({
        title: { type: String, shield: { roles: ['*'] } },
        content: { type: String, shield: { roles: ['*'] } },
      });
      const Post = mongoose.model('Post', PostSchema);

      await Post.create({ title: 'Hello', content: 'World' });

      // Any authenticated role should see all fields
      const result = await Post.findOne().role('random-role');
      expect(result).toHaveProperty('title', 'Hello');
      expect(result).toHaveProperty('content', 'World');
    });

    it('should handle public role for unauthenticated access', async () => {
      const PageSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        views: { type: Number, shield: { roles: ['admin'] } },
      });
      const Page = mongoose.model('Page', PageSchema);

      await Page.create({ title: 'Welcome', views: 1000 });

      // Public sees only title
      const result = await Page.findOne().role('public');
      expect(result).toHaveProperty('title', 'Welcome');
      expect(result).not.toHaveProperty('views');
    });
  });

  describe('Hidden fields', () => {
    it('should hide fields with empty roles array', async () => {
      const UserSchema = new Schema({
        username: { type: String, shield: { roles: ['public'] } },
        password: { type: String, shield: { roles: [] } },
        refreshToken: { type: String, shield: { roles: [] } },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({
        username: 'john',
        password: 'secret123',
        refreshToken: 'token456',
      });

      // Even admin cannot see hidden fields
      const adminResult = await User.findOne().role('admin');
      expect(adminResult).toHaveProperty('username', 'john');
      expect(adminResult).not.toHaveProperty('password');
      expect(adminResult).not.toHaveProperty('refreshToken');

      // And neither can anyone else
      const publicResult = await User.findOne().role('public');
      expect(publicResult).toHaveProperty('username', 'john');
      expect(publicResult).not.toHaveProperty('password');
    });
  });

  describe('Condition-based access', () => {
    it('should evaluate conditions for field access', async () => {
      const UserSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        username: { type: String, shield: { roles: ['public'] } },
        email: {
          type: String,
          shield: {
            roles: ['user'],
            condition: (ctx: ShieldContext) =>
              ctx.document._id?.toString() === ctx.userId,
          },
        },
      });
      const User = mongoose.model('User', UserSchema);

      const user = await User.create({
        username: 'john',
        email: 'john@example.com',
      });

      // Owner can see email
      const ownerResult = await User.findOne()
        .role('user')
        .userId(user._id!.toString());
      expect(ownerResult).toHaveProperty('email', 'john@example.com');

      // Non-owner cannot see email
      const otherResult = await User.findOne()
        .role('user')
        .userId('different-user-id');
      expect(otherResult).not.toHaveProperty('email');
    });

    it('should allow admin to bypass owner condition when in roles', async () => {
      const UserSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        username: { type: String, shield: { roles: ['public'] } },
        email: {
          type: String,
          shield: {
            roles: ['admin', 'user'],
            condition: (ctx: ShieldContext) =>
              ctx.roles.includes('admin') ||
              ctx.document._id?.toString() === ctx.userId,
          },
        },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({
        username: 'john',
        email: 'john@example.com',
      });

      // Admin can see any user's email
      const adminResult = await User.findOne().role('admin');
      expect(adminResult).toHaveProperty('email', 'john@example.com');
    });
  });

  describe('Transform functions', () => {
    it('should transform field values based on role', async () => {
      const UserSchema = new Schema({
        username: { type: String, shield: { roles: ['public'] } },
        phone: {
          type: String,
          shield: {
            roles: ['admin', 'user'],
            transform: (value: string, ctx: ShieldContext) =>
              ctx.roles.includes('admin') ? value : `***-***-${value.slice(-4)}`,
          },
        },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({
        username: 'john',
        phone: '555-123-4567',
      });

      // Admin sees full phone
      const adminResult = await User.findOne().role('admin');
      expect(adminResult).toHaveProperty('phone', '555-123-4567');

      // User sees masked phone
      const userResult = await User.findOne().role('user');
      expect(userResult).toHaveProperty('phone', '***-***-4567');
    });

    it('should transform to hide partial data', async () => {
      const PaymentSchema = new Schema({
        amount: { type: Number, shield: { roles: ['admin', 'user'] } },
        cardNumber: {
          type: String,
          shield: {
            roles: ['admin', 'user'],
            transform: (value: string, ctx: ShieldContext) =>
              ctx.roles.includes('admin') ? value : `****-****-****-${value.slice(-4)}`,
          },
        },
      });
      const Payment = mongoose.model('Payment', PaymentSchema);

      await Payment.create({
        amount: 99.99,
        cardNumber: '4111111111111111',
      });

      const userResult = await Payment.findOne().role('user');
      expect(userResult).toHaveProperty('cardNumber', '****-****-****-1111');
    });
  });
});
