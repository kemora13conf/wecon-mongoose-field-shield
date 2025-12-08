/**
 * FieldShield - Edge Cases Tests
 *
 * Tests edge cases and potential issues:
 * - Null/undefined values
 * - Empty documents
 * - Special field names
 * - Large datasets
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';

describe('Edge Cases', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false });
  });

  describe('Null and undefined values', () => {
    it('should handle null field values', async () => {
      const DocSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        content: { type: String, shield: { roles: ['public'] } },
      });
      const Doc = mongoose.model('Doc', DocSchema);

      await Doc.create({ title: 'Test', content: null });

      const result = await Doc.findOne().role('public');
      expect(result?.toJSON()).toHaveProperty('title', 'Test');
      // content should be present even if null
      expect(result?.content).toBeNull();
    });

    it('should handle undefined (missing) field values', async () => {
      const DocSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        optional: { type: String, required: false, shield: { roles: ['public'] } },
      });
      const Doc = mongoose.model('Doc', DocSchema);

      await Doc.create({ title: 'Test' }); // optional not provided

      const result = await Doc.findOne().role('public');
      expect(result?.toJSON()).toHaveProperty('title', 'Test');
    });
  });

  describe('Special field names', () => {
    it('should handle _id field correctly', async () => {
      const ItemSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        name: { type: String, shield: { roles: ['public'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      const item = await Item.create({ name: 'Test' });
      const result = await Item.findOne().role('public');

      expect(result?._id?.toString()).toBe(item._id!.toString());
    });

    it('should handle __v field (versionKey)', async () => {
      const ItemSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      await Item.create({ name: 'Test' });
      const result = await Item.findOne().role('public');

      // __v is internal and doesn't have shield config
      // It should be excluded since strict mode is on
      expect(result?.toJSON()).not.toHaveProperty('__v');
    });
  });

  describe('Large datasets', () => {
    it('should handle filtering many documents', async () => {
      const DataSchema = new Schema({
        index: { type: Number, shield: { roles: ['public'] } },
        value: { type: String, shield: { roles: ['admin'] } },
      });
      const Data = mongoose.model('Data', DataSchema);

      // Create 100 documents
      const docs = Array.from({ length: 100 }, (_, i) => ({
        index: i,
        value: `secret-${i}`,
      }));
      await Data.insertMany(docs);

      const results = await Data.find().role('public');

      expect(results).toHaveLength(100);
      results.forEach((doc: any, i: number) => {
        const json = doc.toJSON();
        expect(json).toHaveProperty('index');
        expect(json).not.toHaveProperty('value');
      });
    });
  });

  describe('Mixed access patterns', () => {
    it('should handle same model with different roles in parallel', async () => {
      const RecordSchema = new Schema({
        public: { type: String, shield: { roles: ['public'] } },
        private: { type: String, shield: { roles: ['admin'] } },
      });
      const Record = mongoose.model('Record', RecordSchema);

      await Record.create({ public: 'visible', private: 'hidden' });

      // Run queries in parallel
      const [publicResult, adminResult] = await Promise.all([
        Record.findOne().role('public'),
        Record.findOne().role('admin'),
      ]);

      expect(publicResult?.toJSON()).toHaveProperty('public', 'visible');
      expect(publicResult?.toJSON()).not.toHaveProperty('private');

      expect(adminResult?.toJSON()).toHaveProperty('public', 'visible');
      expect(adminResult?.toJSON()).toHaveProperty('private', 'hidden');
    });
  });

  describe('Nested objects', () => {
    it('should handle nested object fields', async () => {
      const ProfileSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        address: {
          type: {
            street: String,
            city: String,
            country: String,
          },
          shield: { roles: ['admin'] },
        },
      });
      const Profile = mongoose.model('Profile', ProfileSchema);

      await Profile.create({
        name: 'John',
        address: { street: '123 Main St', city: 'NYC', country: 'USA' },
      });

      const publicView = await Profile.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'John');
      expect(publicView?.toJSON()).not.toHaveProperty('address');

      const adminView = await Profile.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('address');
      // Mongoose adds _id to subdocuments, so use toMatchObject
      expect(adminView?.address).toMatchObject({
        street: '123 Main St',
        city: 'NYC',
        country: 'USA',
      });
    });
  });

  describe('Array fields', () => {
    it('should handle array fields', async () => {
      const UserSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        tags: { type: [String], shield: { roles: ['admin'] } },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({ name: 'John', tags: ['vip', 'beta-tester'] });

      const publicView = await User.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'John');
      expect(publicView?.toJSON()).not.toHaveProperty('tags');

      const adminView = await User.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('tags');
      expect(adminView?.tags).toEqual(['vip', 'beta-tester']);
    });
  });
});
