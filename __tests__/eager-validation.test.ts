/**
 * FieldShield - Eager Validation Tests
 *
 * Tests the eager validation logic that runs when mongoose.model() is called.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldError } from '../src';

describe('Eager Validation', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false });
  });

  it('should validate schema successfully when all fields are shielded', () => {
    const GoodSchema = new Schema({
      name: { type: String, shield: { roles: ['public'] } },
      email: { type: String, shield: { roles: ['admin'] } },
    });

    expect(() => {
      mongoose.model('Good', GoodSchema);
    }).not.toThrow();
  });

  it('should throw immediately when a top-level field is missing shield config', () => {
    const BadSchema = new Schema({
      name: { type: String, shield: { roles: ['public'] } },
      secret: { type: String }, // Missing shield
    });

    expect(() => {
      mongoose.model('Bad', BadSchema);
    }).toThrow(ShieldError);
  });

  it('should throw immediately when a nested field is missing shield config', () => {
    const NestedSchema = new Schema({
      profile: {
        bio: { type: String, shield: { roles: ['public'] } },
        age: { type: Number }, // Missing shield
      },
    });

    expect(() => {
      mongoose.model('Nested', NestedSchema);
    }).toThrow(ShieldError);
  });

  it('should allow unshielded fields in non-strict mode', () => {
    resetModels();
    setupFieldShield({ strict: false, debug: false });

    const LooseSchema = new Schema({
      name: { type: String }, // Missing shield okay
    });

    expect(() => {
      mongoose.model('Loose', LooseSchema);
    }).not.toThrow();
  });

  it('should validate array subdocuments eagerly', () => {
    const ItemSchema = new Schema({
      name: { type: String, shield: { roles: ['public'] } },
      price: { type: Number }, // Missing shield
    });

    const OrderSchema = new Schema({
      id: { type: String, shield: { roles: ['public'] } },
      items: [ItemSchema], // Array of embedded schemas
    });

    expect(() => {
      mongoose.model('Order', OrderSchema);
    }).toThrow(ShieldError);
  });
});
