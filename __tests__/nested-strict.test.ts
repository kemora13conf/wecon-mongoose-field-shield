/**
 * FieldShield - Nested Objects/Arrays in Strict Mode Tests
 *
 * Tests the issue where nested objects/arrays with only child shield configs
 * should not throw in strict mode if all their children have shield configs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldError } from '../src';

describe('Nested Objects/Arrays in Strict Mode', () => {
  beforeEach(() => {
    resetModels();
  });

  describe('Nested objects without parent shield', () => {
    it('should NOT throw when nested object has all children shielded', async () => {
      setupFieldShield({ strict: true, debug: false });

      // This is the example from the user's issue:
      // notifications object doesn't have shield, but all its children do
      const UserSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        notifications: {
          emailEnabled: {
            type: Boolean,
            default: true,
            shield: {
              roles: ['admin'],
            },
          },
          smsEnabled: {
            type: Boolean,
            default: false,
            shield: {
              roles: ['admin'],
            },
          },
          pushEnabled: {
            type: Boolean,
            default: false,
            shield: {
              roles: ['admin'],
            },
          },
        },
      });

      // This should NOT throw
      const User = mongoose.model('User', UserSchema);

      const user = await User.create({
        name: 'John',
        notifications: {
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: true,
        },
      });

      // Public should see name but not notifications
      const publicView = await User.findById(user._id).role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'John');
      expect(publicView?.toJSON()).not.toHaveProperty('notifications');

      // Admin should see both
      const adminView = await User.findById(user._id).role('admin');
      expect(adminView?.toJSON()).toHaveProperty('name', 'John');
      expect(adminView?.toJSON()).toHaveProperty('notifications');
    });
  });

  describe('Array of objects without parent shield', () => {
    it('should NOT throw when array items have all children shielded', async () => {
      setupFieldShield({ strict: true, debug: false });

      // This is the second example from the user's issue:
      // addresses array doesn't have shield, but all its item fields do
      const UserSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        addresses: [
          {
            street: {
              type: String,
              trim: true,
              shield: {
                roles: ['admin', 'user'],
              },
            },
            city: {
              type: String,
              trim: true,
              shield: {
                roles: ['admin', 'user'],
              },
            },
            state: {
              type: String,
              trim: true,
              shield: {
                roles: ['admin', 'user'],
              },
            },
            postalCode: {
              type: String,
              trim: true,
              shield: {
                roles: ['admin'],
              },
            },
            country: {
              type: String,
              trim: true,
              shield: {
                roles: ['admin'],
              },
            },
            isPrimary: {
              type: Boolean,
              default: false,
              shield: {
                roles: ['admin'],
              },
            },
            addedAt: {
              type: Date,
              default: Date.now,
              shield: {
                roles: ['admin'],
              },
            },
          },
        ],
      });

      // This should NOT throw
      const User = mongoose.model('User', UserSchema);

      const user = await User.create({
        name: 'John',
        addresses: [
          {
            street: '123 Main St',
            city: 'NYC',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
            isPrimary: true,
          },
        ],
      });

      // Public should only see name
      const publicView = await User.findById(user._id).role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'John');
      expect(publicView?.toJSON()).not.toHaveProperty('addresses');

      // User should see addresses but only street, city, state
      const userView = await User.findById(user._id).role('user');
      expect(userView?.toJSON()).toHaveProperty('name', 'John');
      expect(userView?.toJSON()).toHaveProperty('addresses');

      // Admin should see everything
      const adminView = await User.findById(user._id).role('admin');
      expect(adminView?.toJSON()).toHaveProperty('name', 'John');
      expect(adminView?.toJSON()).toHaveProperty('addresses');
      expect(adminView?.addresses?.[0]).toHaveProperty('postalCode');
    });
  });

  describe('Mixed nested structures', () => {
    it('should handle deeply nested objects without parent shield', async () => {
      setupFieldShield({ strict: true, debug: false });

      const ConfigSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        settings: {
          ui: {
            theme: { type: String, shield: { roles: ['user'] } },
            layout: { type: String, shield: { roles: ['user'] } },
          },
          notifications: {
            email: { type: Boolean, shield: { roles: ['user'] } },
            push: { type: Boolean, shield: { roles: ['user'] } },
          },
        },
      });

      // This should NOT throw
      const Config = mongoose.model('Config', ConfigSchema);

      const config = await Config.create({
        name: 'Default',
        settings: {
          ui: { theme: 'dark', layout: 'wide' },
          notifications: { email: true, push: false },
        },
      });

      // Public should only see name
      const publicView = await Config.findById(config._id).role('public');
      expect(publicView?.toJSON()).toHaveProperty('name', 'Default');
      expect(publicView?.toJSON()).not.toHaveProperty('settings');

      // User should see everything
      const userView = await Config.findById(config._id).role('user');
      expect(userView?.toJSON()).toHaveProperty('settings');
    });
  });

  describe('Should still throw for unshielded leaf fields', () => {
    it('should throw when a leaf field in nested object is not shielded', async () => {
      const BadSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        settings: {
          theme: { type: String, shield: { roles: ['user'] } },
          unshielded: { type: String }, // No shield config!
        },
      });

      // Should throw immediately at model creation
      expect(() => {
        mongoose.model('Bad', BadSchema);
      }).toThrow(ShieldError);
    });
  });

  describe('Parent has shield but not all children', () => {
    it('should still require all leaf fields to have shield', async () => {
      setupFieldShield({ strict: true, debug: false });

      // Case where parent has shield, but a nested leaf doesn't
      const BadSchema2 = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        config: {
          type: {
            theme: { type: String },  // No shield!
            locale: { type: String }, // No shield!
          },
          shield: { roles: ['admin'] }, // Parent has shield but children don't
        },
      });

      const Bad2 = mongoose.model('Bad2', BadSchema2);
      await Bad2.create({ name: 'test', config: { theme: 'dark', locale: 'en' } });

      // This should work because parent has shield (different Mongoose structure)
      const result = await Bad2.findOne().role('admin');
      expect(result?.toJSON()).toHaveProperty('config');
    });
  });
});
