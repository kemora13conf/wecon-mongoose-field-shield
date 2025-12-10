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

  describe('Nested field inheritance', () => {
    it('should synthesize parent from nested children with same roles', async () => {
      const UserSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        preferences: {
          theme: { type: String, shield: { roles: ['admin'] } },
          locale: { type: String, shield: { roles: ['admin'] } },
          timezone: { type: String, shield: { roles: ['admin'] } },
        },
      });
      const User = mongoose.model('User', UserSchema);

      await User.create({
        name: 'John',
        preferences: { theme: 'dark', locale: 'en', timezone: 'UTC' },
      });

      // Public should NOT see preferences
      const publicView = await User.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'John');
      expect(publicView?.toJSON()).not.toHaveProperty('preferences');

      // Admin SHOULD see preferences
      const adminView = await User.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('name', 'John');
      expect(adminView?.toJSON()).toHaveProperty('preferences');
      expect(adminView?.preferences).toMatchObject({
        theme: 'dark',
        locale: 'en',
        timezone: 'UTC',
      });
    });

    it('should synthesize parent with mixed child roles (union)', async () => {
      const SettingsSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        settings: {
          publicSetting: { type: String, shield: { roles: ['public'] } },
          adminSetting: { type: String, shield: { roles: ['admin'] } },
        },
      });
      const Settings = mongoose.model('Settings', SettingsSchema);

      await Settings.create({
        name: 'App',
        settings: { publicSetting: 'visible', adminSetting: 'hidden' },
      });

      // Public should see settings (parent is union of public+admin)
      // but only the publicSetting child field
      const publicView = await Settings.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('settings');
      // Note: The parent 'settings' is included, but children are filtered by toJSON

      // Admin should see both
      const adminView = await Settings.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('settings');
    });

    it('should handle deeply nested fields (3 levels)', async () => {
      const DeepSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        level1: {
          level2: {
            level3: { type: String, shield: { roles: ['admin'] } },
          },
        },
      });
      const Deep = mongoose.model('Deep', DeepSchema);

      await Deep.create({
        name: 'Test',
        level1: { level2: { level3: 'deep-value' } },
      });

      // Public should NOT see level1
      const publicView = await Deep.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'Test');
      expect(publicView?.toJSON()).not.toHaveProperty('level1');

      // Admin SHOULD see full nested structure
      const adminView = await Deep.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('level1');
      expect(adminView?.level1?.level2?.level3).toBe('deep-value');
    });

    it('should handle array of objects with shielded parent', async () => {
      // Note: Mongoose represents array of objects as a single path 'addresses'
      // Individual item field paths like 'addresses.street' are NOT separate paths
      // So we need to shield the array parent itself
      const ContactSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        addresses: {
          type: [{
            street: { type: String },
            city: { type: String },
          }],
          shield: { roles: ['admin', 'public'] }, // Shield on array parent
        },
      });
      const Contact = mongoose.model('Contact', ContactSchema);

      await Contact.create({
        name: 'Jane',
        addresses: [
          { street: '123 Main St', city: 'NYC' },
          { street: '456 Oak Ave', city: 'LA' },
        ],
      });

      // Public should see addresses array
      const publicView = await Contact.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'Jane');
      expect(publicView?.toJSON()).toHaveProperty('addresses');

      // Admin should see full addresses
      const adminView = await Contact.findOne().role('admin');
      expect(adminView?.toJSON()).toHaveProperty('addresses');
      expect(adminView?.addresses).toHaveLength(2);
    });

    it('should hide parent when all children have empty roles', async () => {
      const SecretSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        secrets: {
          token: { type: String, shield: { roles: [] } },
          key: { type: String, shield: { roles: [] } },
        },
      });
      const Secret = mongoose.model('Secret', SecretSchema);

      await Secret.create({
        name: 'Config',
        secrets: { token: 'abc123', key: 'xyz789' },
      });

      // No one should see secrets (all children are hidden)
      const publicView = await Secret.findOne().role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'Config');
      expect(publicView?.toJSON()).not.toHaveProperty('secrets');

      const adminView = await Secret.findOne().role('admin');
      expect(adminView?.toJSON()).not.toHaveProperty('secrets');
    });
  });
});
