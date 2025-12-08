/**
 * Test Setup - MongoDB Memory Server
 *
 * Provides in-memory MongoDB for all tests.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { installFieldShield, clearShield } from '../src';

let mongoServer: MongoMemoryServer;

/**
 * Start MongoDB Memory Server and connect mongoose
 */
export async function setupTestDB(): Promise<void> {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

/**
 * Disconnect and stop MongoDB Memory Server
 */
export async function teardownTestDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Clear all collections between tests
 */
export async function clearCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Reset mongoose models and shield registry
 */
export function resetModels(): void {
  // Clear all registered models
  const modelNames = mongoose.modelNames();
  for (const name of modelNames) {
    delete (mongoose.connection.models as any)[name];
    delete (mongoose as any).models[name];
  }
  // Clear shield registry
  clearShield();
}

/**
 * Install FieldShield for testing
 */
export function setupFieldShield(options?: { strict?: boolean; debug?: boolean }): void {
  installFieldShield(mongoose, {
    strict: options?.strict ?? true,
    debug: options?.debug ?? false,
  });
}

// Vitest global hooks
beforeAll(async () => {
  await setupTestDB();
});

afterAll(async () => {
  await teardownTestDB();
});

afterEach(async () => {
  await clearCollections();
  resetModels();
});
