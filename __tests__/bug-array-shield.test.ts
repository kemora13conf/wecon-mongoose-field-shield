
import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldError } from '../src';

describe('Bug: Array Field Shield Parsing', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false }); // Strict mode enabled
  });

  it('should detect shield config defined inside array of primitives', () => {
    // User reported case:
    // roles: [{ type: String, shield: { roles: ['admin'] } }]
    const UserSchema = new Schema({
      tags: [{
        type: String,
        shield: {
          roles: ['admin'],
        },
      }],
    });

    // Should NOT throw ShieldError
    expect(() => {
      mongoose.model('UserArrayRepro', UserSchema);
    }).not.toThrow();
  });

  it('should detect shield config on array of numbers', () => {
    const StatsSchema = new Schema({
      scores: [{
        type: Number,
        shield: { roles: ['public'] }
      }]
    });

    expect(() => {
      mongoose.model('StatsArrayRepro', StatsSchema);
    }).not.toThrow();
  });
  
  it('should throw if array of primitives has no shield', () => {
     const BadSchema = new Schema({
      tags: [{ type: String }] // Missing shield
    });

    expect(() => {
      mongoose.model('BadArrayRepro', BadSchema);
    }).toThrow(ShieldError);
  });
});
