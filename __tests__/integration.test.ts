/**
 * FieldShield - Integration Tests
 *
 * Tests real-world scenarios:
 * - Populate with nested filtering
 * - toJSON/toObject filtering
 * - Multiple models with relationships
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { setupFieldShield, resetModels } from './setup';
import { ShieldContext } from '../src';

describe('Integration Tests', () => {
  beforeEach(() => {
    resetModels();
    setupFieldShield({ strict: true, debug: false });
  });

  describe('Multiple related models', () => {
    it('should handle separate policies for different models', async () => {
      // Author model
      const AuthorSchema = new Schema({
        name: { type: String, shield: { roles: ['public'] } },
        email: { type: String, shield: { roles: ['admin'] } },
      });
      const Author = mongoose.model('Author', AuthorSchema);

      // Book model
      const BookSchema = new Schema({
        title: { type: String, shield: { roles: ['public'] } },
        isbn: { type: String, shield: { roles: ['admin', 'librarian'] } },
        authorId: { type: Schema.Types.ObjectId, ref: 'Author', shield: { roles: ['public'] } },
      });
      const Book = mongoose.model('Book', BookSchema);

      const author = await Author.create({
        name: 'John Doe',
        email: 'john@publisher.com',
      });

      await Book.create({
        title: 'Great Book',
        isbn: '978-3-16-148410-0',
        authorId: author._id,
      });

      // Public can see book title but not ISBN
      const publicBook = await Book.findOne().role('public');
      expect(publicBook?.toJSON()).toHaveProperty('title', 'Great Book');
      expect(publicBook?.toJSON()).not.toHaveProperty('isbn');

      // Librarian can see ISBN
      const librarianBook = await Book.findOne().role('librarian');
      expect(librarianBook?.toJSON()).toHaveProperty('title', 'Great Book');
      expect(librarianBook?.toJSON()).toHaveProperty('isbn', '978-3-16-148410-0');
    });
  });

  describe('Complex conditions', () => {
    it('should handle organization-based access', async () => {
      const EmployeeSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        name: { type: String, shield: { roles: ['public'] } },
        orgId: { type: String, shield: { roles: ['user', 'manager', 'hr'] } },
        salary: {
          type: Number,
          shield: {
            roles: ['hr', 'manager'],
            condition: (ctx: ShieldContext) => {
              // HR can see anyone's salary
              if (ctx.roles.includes('hr')) return true;
              // Managers can only see their org's salaries
              if (ctx.roles.includes('manager')) {
                return ctx.document.orgId === ctx.userId; // Using userId as orgId for test
              }
              return false;
            },
          },
        },
      });
      const Employee = mongoose.model('Employee', EmployeeSchema);

      await Employee.create([
        { name: 'Alice', orgId: 'org-1', salary: 80000 },
        { name: 'Bob', orgId: 'org-2', salary: 90000 },
      ]);

      // HR sees all salaries
      const hrResults = await Employee.find().role('hr');
      expect(hrResults).toHaveLength(2);
      hrResults.forEach((e: any) => {
        const json = e.toJSON();
        expect(json).toHaveProperty('salary');
      });

      // Manager sees only their org's salaries
      // Note: Manager from org-1 queries, but salary condition checks ctx.userId against doc.orgId
      const managerResults = await Employee.find()
        .role('manager')
        .userId('org-1'); // Simulating org context

      // With projection-based architecture, both employees have salary field fetched
      // but toJSON should filter based on condition
      const org1Employee = managerResults.find((e: any) => e.orgId === 'org-1');
      const org2Employee = managerResults.find((e: any) => e.orgId === 'org-2');

      expect(org1Employee?.toJSON()).toHaveProperty('salary', 80000);
      expect(org2Employee?.toJSON()).not.toHaveProperty('salary');
    });
  });

  describe('Real-world user model', () => {
    it('should correctly filter a typical user model', async () => {
      const UserSchema = new Schema({
        _id: { type: Schema.Types.ObjectId, auto: true, shield: { roles: ['public'] } },
        username: { type: String, shield: { roles: ['public'] } },
        avatar: { type: String, shield: { roles: ['public'] } },
        email: {
          type: String,
          shield: {
            roles: ['admin', 'user'],
            condition: (ctx: ShieldContext) =>
              ctx.roles.includes('admin') ||
              ctx.document._id?.toString() === ctx.userId,
          },
        },
        phone: {
          type: String,
          shield: {
            roles: ['admin', 'user'],
            transform: (value: string, ctx: ShieldContext) =>
              ctx.roles.includes('admin') ? value : `***-***-${value.slice(-4)}`,
          },
        },
        salary: { type: Number, shield: { roles: ['admin', 'hr'] } },
        password: { type: String, shield: { roles: [] } },
        refreshToken: { type: String, shield: { roles: [] } },
        createdAt: { type: Date, shield: { roles: ['admin'] } },
      });
      const User = mongoose.model('User', UserSchema);

      const user = await User.create({
        username: 'johndoe',
        avatar: 'https://example.com/avatar.jpg',
        email: 'john@example.com',
        phone: '555-123-4567',
        salary: 100000,
        password: 'hashed_secret',
        refreshToken: 'token_secret',
        createdAt: new Date(),
      });

      // Public view
      const publicView = await User.findById(user._id).role('public');
      expect(publicView?.toJSON()).toHaveProperty('username', 'johndoe');
      expect(publicView?.toJSON()).toHaveProperty('avatar');
      expect(publicView?.toJSON()).not.toHaveProperty('email');
      expect(publicView?.toJSON()).not.toHaveProperty('phone');
      expect(publicView?.toJSON()).not.toHaveProperty('salary');
      expect(publicView?.toJSON()).not.toHaveProperty('password');

      // User (not owner)
      const otherUserView = await User.findById(user._id)
        .role('user')
        .userId('different-id');
      expect(otherUserView?.toJSON()).toHaveProperty('username');
      expect(otherUserView?.toJSON()).not.toHaveProperty('email'); // Condition failed
      expect(otherUserView?.toJSON()).toHaveProperty('phone', '***-***-4567'); // Masked

      // Owner
      const ownerView = await User.findById(user._id)
        .role('user')
        .userId(user._id!.toString());
      expect(ownerView?.toJSON()).toHaveProperty('email', 'john@example.com');
      expect(ownerView?.toJSON()).toHaveProperty('phone', '***-***-4567'); // Still masked

      // Admin
      const adminView = await User.findById(user._id).role('admin');
      expect(adminView?.toJSON()).toHaveProperty('username');
      expect(adminView?.toJSON()).toHaveProperty('email');
      expect(adminView?.toJSON()).toHaveProperty('phone', '555-123-4567'); // Full
      expect(adminView?.toJSON()).toHaveProperty('salary', 100000);
      expect(adminView?.toJSON()).toHaveProperty('createdAt');
      expect(adminView?.toJSON()).not.toHaveProperty('password'); // Still hidden
      expect(adminView?.toJSON()).not.toHaveProperty('refreshToken'); // Still hidden
    });
  });
});
