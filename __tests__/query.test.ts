/**
 * FieldShield - Query Interception Tests
 *
 * Tests query method patching:
 * - .role() method
 * - .userId() method
 * - find(), findOne(), findById()
 * - Multiple results
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldContext } from '../src';

describe('Query Interception', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false });
  });

  describe('.role() method', () => {
    it('should accept single role as string', async () => {
      const ItemSchema = new Schema({
        name: { type: String, shield: { roles: ['user'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      await Item.create({ name: 'Test' });

      const result = await Item.findOne().role('user');
      expect(result?.toJSON()).toHaveProperty('name', 'Test');
    });

    it('should accept multiple roles as array', async () => {
      const ItemSchema = new Schema({
        name: { type: String, shield: { roles: ['admin'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      await Item.create({ name: 'Test' });

      const result = await Item.findOne().role(['admin', 'superadmin']);
      expect(result?.toJSON()).toHaveProperty('name', 'Test');
    });

    it('should be chainable with other query methods', async () => {
      const ItemSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        price: { type: Number, shield: { roles: ['public'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      await Item.create([
        { name: 'A', price: 10 },
        { name: 'B', price: 20 },
        { name: 'C', price: 30 },
      ]);

      const result = await Item.find()
        .where('price').gt(15)
        .sort({ price: -1 })
        .limit(2)
        .role('public');

      expect(result).toHaveLength(2);
      expect(result[0]?.toJSON()).toHaveProperty('name', 'C');
      expect(result[1]?.toJSON()).toHaveProperty('name', 'B');
    });
  });

  describe('.userId() method', () => {
    it('should store userId for condition evaluation', async () => {
      const ProfileSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        name: { type: String, shield: { roles: ['public'] } },
        ssn: {
          type: String,
          shield: {
            roles: ['user'],
            condition: (ctx: ShieldContext) => ctx.document._id?.toString() === ctx.userId,
          },
        },
      });
      const Profile = mongoose.model('Profile', ProfileSchema);

      const profile = await Profile.create({
        name: 'John',
        ssn: '123-45-6789',
      });

      // With matching userId
      const ownerResult = await Profile.findById(profile._id)
        .role('user')
        .userId(profile._id!.toString());
      expect(ownerResult?.toJSON()).toHaveProperty('ssn', '123-45-6789');

      // Without matching userId
      const otherResult = await Profile.findById(profile._id)
        .role('user')
        .userId('other-id');
      expect(otherResult?.toJSON()).not.toHaveProperty('ssn');
    });
  });

  describe('find() variations', () => {
    let User: any;

    beforeEach(async () => {
      const UserSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        username: { type: String, shield: { roles: ['public'] } },
        email: { type: String, shield: { roles: ['admin'] } },
      });
      User = mongoose.model('User', UserSchema);

      await User.create([
        { username: 'alice', email: 'alice@example.com' },
        { username: 'bob', email: 'bob@example.com' },
        { username: 'charlie', email: 'charlie@example.com' },
      ]);
    });

    it('should filter find() results', async () => {
      const results = await User.find().role('public');
      expect(results).toHaveLength(3);
      results.forEach((r: any) => {
        const json = r.toJSON();
        expect(json).toHaveProperty('username');
        expect(json).not.toHaveProperty('email');
      });
    });

    it('should filter findOne() result', async () => {
      const result = await User.findOne({ username: 'alice' }).role('public');
      expect(result?.toJSON()).toHaveProperty('username', 'alice');
      expect(result?.toJSON()).not.toHaveProperty('email');
    });

    it('should filter findById() result', async () => {
      const alice = await User.findOne({ username: 'alice' }).role('admin');
      const result = await User.findById(alice._id).role('public');
      expect(result?.toJSON()).toHaveProperty('username', 'alice');
      expect(result?.toJSON()).not.toHaveProperty('email');
    });

    it('should handle null results gracefully', async () => {
      const result = await User.findOne({ username: 'nonexistent' }).role('admin');
      expect(result).toBeNull();
    });

    it('should handle empty array results', async () => {
      const results = await User.find({ username: 'nonexistent' }).role('admin');
      expect(results).toEqual([]);
    });
  });

  describe('Query with select()', () => {
    it('should respect both select() and shield filtering', async () => {
      const DocSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        content: { type: String, shield: { roles: ['public'] } },
        secret: { type: String, shield: { roles: ['admin'] } },
      });
      const Doc = mongoose.model('Doc', DocSchema);

      await Doc.create({
        title: 'Test',
        content: 'Body',
        secret: 'Hidden',
      });

      // Even if select includes secret, shield should filter it
      const result = await Doc.findOne()
        .select('title secret')
        .role('public');

      expect(result?.toJSON()).toHaveProperty('title', 'Test');
      // secret should be filtered out by shield
      expect(result?.toJSON()).not.toHaveProperty('secret');
    });
  });
});
