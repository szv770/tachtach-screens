import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/index.js';
import { tenants, tenantAdmins, devices, superAdmins } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Schema: tenants', () => {
  let tenantId: string;

  it('inserts a tenant', async () => {
    const [t] = await db.insert(tenants).values({
      name: 'Test Org',
      contactEmail: 'test@testorg.com',
    }).returning();
    expect(t.id).toBeDefined();
    expect(t.status).toBe('active');
    tenantId = t.id;
  });

  it('reads back the tenant', async () => {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    expect(t.name).toBe('Test Org');
  });

  it('inserts a tenant admin', async () => {
    const [a] = await db.insert(tenantAdmins).values({
      tenantId,
      username: 'testadmin',
      passwordHash: '$2a$12$fakehashforfixture000000000000000000000000000000000000000',
    }).returning();
    expect(a.forcePasswordReset).toBe(true);
    expect(a.tenantId).toBe(tenantId);
  });

  afterAll(async () => {
    // cleanup
    await db.delete(tenantAdmins).where(eq(tenantAdmins.tenantId, tenantId));
    await db.delete(devices).where(eq(devices.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });
});
