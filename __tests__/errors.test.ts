/**
 * FieldShield - Error Handling Tests
 *
 * Tests developer experience:
 * - Missing .role() error
 * - Missing shield config error (strict mode)
 * - Invalid config errors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldError } from '../src';

describe('Error Handling', () => {
  describe('Missing .role() error', () => {
    beforeEach(() => {
      resetModels();
      setupFieldShield({ strict: true, debug: false });
    });

    it('should throw when .role() is not called', async () => {
      const ItemSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
      });
      const Item = mongoose.model('Item', ItemSchema);

      await Item.create({ name: 'Test' });

      // Query without .role() should throw
      await expect(Item.findOne()).rejects.toThrow(ShieldError);
      await expect(Item.find()).rejects.toThrow(ShieldError);
    });

    it('should include helpful error message with model and method name', async () => {
      const TaskSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
      });
      const Task = mongoose.model('Task', TaskSchema);

      await Task.create({ title: 'Do something' });

      try {
        await Task.findOne();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ShieldError);
        expect((error as ShieldError).info.title).toContain('Task');
        expect((error as ShieldError).info.title).toContain('findOne');
        expect((error as ShieldError).info.fix).toContain('.role(');
      }
    });
  });

  describe('Strict mode validation', () => {
    it('should throw when schema field lacks shield config in strict mode', async () => {
      resetModels();
      setupFieldShield({ strict: true, debug: false });

      const BadSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        email: { type: String }, // Missing shield!
      });
      // Error is thrown IMMEDIATELY at model creation
      expect(() => {
        mongoose.model('BadModel', BadSchema);
      }).toThrow(ShieldError);
    });

    it('should include field name in error message', async () => {
      resetModels();
      setupFieldShield({ strict: true, debug: false });

      const BadSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        secretField: { type: String }, // Missing shield!
      });
      try {
        mongoose.model('BadModel2', BadSchema);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ShieldError);
        expect((error as ShieldError).info.title).toContain('secretField');
      }
    });

    it('should allow missing shield in non-strict mode', async () => {
      resetModels();
      setupFieldShield({ strict: false, debug: false });

      const LooseSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        other: { type: String }, // No shield, but strict is false
      });
      const LooseModel = mongoose.model('LooseModel', LooseSchema);
      
      await LooseModel.create({ name: 'test', other: 'value' });
      
      // Should not throw
      const result = await LooseModel.findOne().role('public');
      expect(result).toBeDefined();
    });
  });

  describe('Condition errors', () => {
    beforeEach(() => {
      resetModels();
      setupFieldShield({ strict: true, debug: false });
    });

    it('should handle condition function errors gracefully', async () => {
      const BrokenSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        data: {
          type: String,
          shield: {
            roles: ['user'],
            condition: () => {
              throw new Error('Condition exploded!');
            },
          },
        },
      });
      const Broken = mongoose.model('Broken', BrokenSchema);

      await Broken.create({ name: 'Test', data: 'Secret' });

      // With projection-based architecture, condition errors are handled gracefully
      // in toJSON - the field is excluded and error is logged
      const result = await Broken.findOne().role('user');
      const json = result?.toJSON();
      
      // The document should be returned
      expect(json).toHaveProperty('name', 'Test');
      // The field with broken condition should be excluded (safe default)
      expect(json).not.toHaveProperty('data');
    });
  });
});
