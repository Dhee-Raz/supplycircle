import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const businesses = sqliteTable('businesses', {
  id: text('id').primaryKey(), name: text('name').notNull(), owner: text('owner').notNull(),
});
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(),
  name: text('name').notNull(), identifier: text('identifier').notNull().unique(),
  kind: text('kind').notNull(), passwordHash: text('password_hash').notNull(),
  created: text('created').notNull(),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), accountId: text('account_id').notNull(),
  expires: integer('expires').notNull(),
});
export const authAttempts = sqliteTable('auth_attempts', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull(),
});
export const members = sqliteTable('members', {
  email: text('email').primaryKey(), business: text('business').notNull(),
  name: text('name').notNull(), role: text('role').notNull(), accountId: text('account_id').unique(), storeId: text('store_id'),
});
export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(), business: text('business').notNull(),
  identifier: text('identifier').notNull(), name: text('name').notNull(), role: text('role').notNull(),
  storeId: text('store_id'), tokenHash: text('token_hash').notNull().unique(), expires: integer('expires').notNull(), usedAt: text('used_at'),
});
export const stores = sqliteTable('stores', {
  id: text('id').primaryKey(), business: text('business').notNull(),
  name: text('name').notNull(), location: text('location').notNull(),
});
export const items = sqliteTable('items', {
  id: text('id').primaryKey(), business: text('business').notNull(), store: text('store').notNull(),
  name: text('name').notNull(), quantity: integer('quantity').notNull(), unit: text('unit').notNull(),
  category: text('category').notNull(), priority: text('priority').notNull(), note: text('note').notNull(),
  status: text('status').notNull(), addedBy: text('added_by').notNull(), boughtBy: text('bought_by'),
  created: text('created').notNull(), boughtAt: text('bought_at'),
  addedById: text('added_by_id'), boughtById: text('bought_by_id'),
});
