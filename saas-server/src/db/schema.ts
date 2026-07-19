import { pgTable, uuid, varchar, boolean, timestamp, text, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ─── Tenants (organizations: shuls, yeshivos, schools, etc.) ─────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Tenant Admins (org login credentials) ───────────────────────────────────
export const tenantAdmins = pgTable('tenant_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  forcePasswordReset: boolean('force_password_reset').notNull().default(true),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Devices (physical Pi screens) ───────────────────────────────────────────
export const devices = pgTable('devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull().default('Main Screen'),
  serialNumber: varchar('serial_number', { length: 100 }),
  encryptedIdentityKey: text('encrypted_identity_key'),
  provisioningSecret: varchar('provisioning_secret', { length: 255 }),
  screenTokenHash: varchar('screen_token_hash', { length: 255 }),
  tokenExpiresAt: timestamp('token_expires_at'),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  lastHeartbeatIp: varchar('last_heartbeat_ip', { length: 45 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Super Admins (seller/operator only — you) ────────────────────────────────
export const superAdmins = pgTable('super_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  totpSecret: varchar('totp_secret', { length: 100 }),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Audit Log (append-only, NEVER update or delete) ─────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorType: varchar('actor_type', { length: 30 }).notNull(), // 'system' | 'tenant_admin' | 'super_admin'
  actorId: uuid('actor_id'),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  digest: varchar('digest', { length: 64 }).notNull(), // SHA-256 hex
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────
export const tenantsRelations = relations(tenants, ({ many }) => ({
  admins: many(tenantAdmins),
  devices: many(devices),
}));

export const tenantAdminsRelations = relations(tenantAdmins, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantAdmins.tenantId], references: [tenants.id] }),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  tenant: one(tenants, { fields: [devices.tenantId], references: [tenants.id] }),
}));
