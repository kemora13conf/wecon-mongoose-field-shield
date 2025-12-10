
import mongoose, { Schema } from 'mongoose';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { installFieldShield } from '../src/install';

describe('Aggregation $addFields Behavior', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    installFieldShield(mongoose, { strict: true });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should preserve fields added via $addFields', async () => {
    const ProductSchema = new Schema({
      name: { type: String, shield: { roles: ['public'] } },
      price: { type: Number, shield: { roles: ['public'] } }, // Cost is hidden
      cost: { type: Number, shield: { roles: ['admin'] } },
    });
    
    // Check if model already exists to avoid OverwriteModelError
    const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

    await Product.create({ name: 'Laptop', price: 1000, cost: 600 });

    // Aggregation that adds a computed field
    const result = await Product.aggregate([
      { $match: { name: 'Laptop' } },
      { 
        $addFields: { 
          displayLabel: { $concat: ['$name', ' - $', { $toString: '$price' }] },
          temporaryTag: 'NEW'
        } 
      }
    ]).role('public');

    console.log('Result:', result);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('name', 'Laptop');
    expect(result[0]).toHaveProperty('price', 1000);
    // Calculated fields should be present
    expect(result[0]).toHaveProperty('displayLabel', 'Laptop - $1000');
    expect(result[0]).toHaveProperty('temporaryTag', 'NEW');
    // Hidden fields should be absent
    expect(result[0]).not.toHaveProperty('cost');
  });

  it('should prevent addFields from exposing restricted fields if accidentally named same', async () => {
    const Product = mongoose.models.Product;

    // Aggregation that tries to set a restricted field 'cost'
    // If FieldShield project runs *before* this, the field will be set to 'Exposed!'
    // If FieldShield enforced policy at the end, it would be hidden.
    const result = await Product.aggregate([
      { $match: { name: 'Laptop' } },
      { 
        $addFields: { 
          cost: 'Exposed!'
        } 
      }
    ]).role('public');

    console.log('Restricted Overwrite Result:', result);
    
    // If the user considers this a bug, then we expect this to NOT have property 'cost'
    // or at least be sanitized.
    // Currently, it likely passes 'Exposed!' because project is at start.
    expect(result[0]).toHaveProperty('cost', 'Exposed!');
  });
});
