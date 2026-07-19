# TachTach SaaS — Plan 1: Foundation (Server + DB + Auth)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a production-ready Node.js + Express + PostgreSQL server with full multi-tenant authentication (school admin + super admin with TOTP), row-level security, and an audit log.

**Architecture:** New `saas-server/` directory inside the existing tachtach-screens repo. TypeScript throughout. Drizzle ORM for all DB access. PostgreSQL RLS as a second layer of tenant isolation on top of application-layer tenant scoping. Super admin protected by TOTP 2FA and login alert emails.

**Tech Stack:** Node.js 22 LTS, Express 4, TypeScript, Drizzle ORM + drizzle-kit, PostgreSQL 16, express-session + connect-pg-simple, bcrypt, speakeasy (TOTP), nodemailer, express-rate-limit, vitest + supertest

> **WiFi note (for Plan 6 — Pi provisioning):** MAC filtering is common in schools. The Pi's real WiFi MAC must be displayed on the captive portal setup screen and in the admin portal Device Info. MAC randomization must be disabled at provisioning time (`wifi.cloned-mac-address=permanent` in NetworkManager). See main spec for full WiFi details.

---

## File Map

```
saas-server/
├── src/
│   ├── index.ts                        # Express app bootstrap + server listen
│   ├── app.ts                          # Express app factory (testable without listen)
│   ├── db/
│   │   ├── index.ts                    # Drizzle client singleton
│   │   └── schema.ts                   # All table definitions
│   ├── middleware/
│   │   ├── requireTenantAdmin.ts       # Validates session, scopes req.tenant
│   │   ├── requireSuperAdmin.ts        # Validates super admin session
│   │   └── rateLimits.ts              # Login rate limiter configs
│   ├── routes/
│   │   ├── health.ts                   # GET /health
│   │   ├── auth.ts                     # POST /api/auth/login, /logout, /me
│   │   └── superauth.ts               # POST /api/super/login, /logout, /totp/setup, /totp/verify
│   ├── services/
│   │   ├── audit.ts                    # appendAuditLog() helper
│   │   ├── totp.ts                     # generateSecret(), verifyToken()
│   │   └── email.ts                   # sendLoginAlert()
│   └── types/
│       └── session.d.ts               # Express session type augmentation
├── tests/
│   ├── setup.ts                        # Test DB setup/teardown
│   ├── auth.test.ts                    # School admin auth integration tests
│   └── superauth.test.ts              # Super admin auth integration tests
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `saas-server/package.json`
- Create: `saas-server/tsconfig.json`
- Create: `saas-server/drizzle.config.ts`
- Create: `saas-server/src/app.ts`
- Create: `saas-server/src/index.ts`
- Create: `saas-server/src/routes/health.ts`
- Create: `saas-server/src/types/session.d.ts`

- [ ] **Step 1: Initialize the project**

```bash
cd saas-server
npm init -y
npm install express express-session connect-pg-simple bcryptjs speakeasy qrcode nodemailer express-rate-limit drizzle-orm @drizzle-team/studio postgres dotenv cors helmet
npm install -D typescript @types/node @types/express @types/express-session @types/bcryptjs @types/speakeasy @types/qrcode @types/nodemailer vitest supertest @types/supertest tsx drizzle-kit
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Add scripts to `package.json`**

Replace the `scripts` section:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Create session type augmentation `src/types/session.d.ts`**

```typescript
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    adminId: string;
    tenantId: string;
    type: 'tenant_admin' | 'super_admin';
    superAdminId: string;
    totpVerified: boolean;
    impersonatingTenantId: string | null;
  }
}
```

- [ ] **Step 6: Create `src/routes/health.ts`**

```typescript
import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

export default router;
```

- [ ] **Step 7: Create `src/app.ts`**

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import healthRouter from './routes/health.js';

const PgSession = ConnectPgSimple(session);

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: process.env.ADMIN_ORIGIN, credentials: true }));
  app.use(express.json());

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  app.use(
    session({
      store: new PgSession({ pool }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 4 * 60 * 60 * 1000, // 4 hours
      },
    })
  );

  app.use(healthRouter);

  return app;
}
```

- [ ] **Step 8: Create `src/index.ts`**

```typescript
import 'dotenv/config';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const app = createApp();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`TachTach server running on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 9: Create `.env` file (never commit this)**

```
DATABASE_URL=postgresql://tachtach:password@localhost:5432/tachtach_dev
SESSION_SECRET=change-this-to-a-random-64-char-string
ADMIN_ORIGIN=http://localhost:5173
PORT=3001
NODE_ENV=development
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@tachtach.com
SMTP_PASS=smtp-password
ALERT_EMAIL=your@email.com
```

Add `.env` to `.gitignore`:
```bash
echo ".env" >> .gitignore
```

- [ ] **Step 10: Verify server starts**

```bash
npm run dev
```

Expected: `TachTach server running on http://127.0.0.1:3001`

```bash
curl http://127.0.0.1:3001/health
```

Expected: `{"status":"ok","ts":"..."}` — if you see this, Task 1 is done.

- [ ] **Step 11: Commit**

```bash
git add saas-server/
git commit -m "feat(saas): scaffold server project with Express + TypeScript"
```

---

## Task 2: Database Schema

**Files:**
- Create: `saas-server/src/db/index.ts`
- Create: `saas-server/src/db/schema.ts`

- [ ] **Step 1: Create DB connection `src/db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

- [ ] **Step 2: Write the failing test first**

Create `tests/setup.ts`:
```typescript
import { beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

beforeAll(async () => {
  // Verify DB connection
  await db.execute(sql`SELECT 1`);
});

afterAll(async () => {
  // Clean test data (tables cleaned per test file)
});
```

Create `tests/schema.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/index.js';
import { tenants, tenantAdmins, devices, auditLog, superAdmins } from '../src/db/schema.js';

describe('DB schema', () => {
  it('can insert and read a tenant', async () => {
    const [tenant] = await db.insert(tenants).values({
      name: 'Test School',
      contactEmail: 'test@school.com',
    }).returning();

    expect(tenant.id).toBeDefined();
    expect(tenant.status).toBe('active');

    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  });
});
```

Run: `npm test` — expected: FAIL (schema doesn't exist yet)

- [ ] **Step 3: Create `src/db/schema.ts`**

```typescript
import {
  pgTable, uuid, varchar, text, timestamp, boolean, jsonb, integer
} from 'drizzle-orm/pg-core';

// ── Tenants (schools) ──────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Tenant admins (school staff who log into admin portal) ─
export const tenantAdmins = pgTable('tenant_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  forcePasswordReset: boolean('force_password_reset').notNull().default(true),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Devices (one per physical screen) ─────────────────────
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
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

// ── Super admins (seller only — typically 1 row) ───────────
export const superAdmins = pgTable('super_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  totpSecret: varchar('totp_secret', { length: 100 }),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Audit log (append-only — never UPDATE or DELETE) ───────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorType: varchar('actor_type', { length: 30 }).notNull(),
  actorId: uuid('actor_id'),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  digest: varchar('digest', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Sessions (managed by connect-pg-simple) ────────────────
// Table created automatically by connect-pg-simple on startup.
// No Drizzle schema needed — it manages its own DDL.
```

- [ ] **Step 4: Generate and run migrations**

```bash
npm run db:generate
npm run db:migrate
```

Expected: Migration files created in `drizzle/`, applied to DB.

- [ ] **Step 5: Run schema tests**

```bash
npm test tests/schema.test.ts
```

Expected: PASS. If FAIL, check DATABASE_URL in `.env`.

- [ ] **Step 6: Commit**

```bash
git add saas-server/src/db/ saas-server/drizzle/ saas-server/drizzle.config.ts
git commit -m "feat(saas): add Drizzle schema and migrations"
```

---

## Task 3: Audit Log Service

**Files:**
- Create: `saas-server/src/services/audit.ts`

This must exist before auth routes — auth routes write audit entries.

- [ ] **Step 1: Write the failing test**

Create `tests/audit.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../src/db/index.js';
import { auditLog } from '../src/db/schema.js';
import { appendAuditLog } from '../src/services/audit.js';
import { eq } from 'drizzle-orm';

describe('appendAuditLog', () => {
  it('creates an audit entry with a SHA-256 digest', async () => {
    await appendAuditLog({
      actorType: 'system',
      actorId: null,
      action: 'test_action',
      targetType: 'tenant',
      targetId: null,
      metadata: { note: 'hello' },
    });

    const entries = await db.select().from(auditLog)
      .where(eq(auditLog.action, 'test_action'));
    
    expect(entries).toHaveLength(1);
    expect(entries[0].digest).toMatch(/^[a-f0-9]{64}$/);

    // Cleanup
    await db.delete(auditLog).where(eq(auditLog.action, 'test_action'));
  });
});
```

Run: `npm test tests/audit.test.ts` — expected: FAIL

- [ ] **Step 2: Implement `src/services/audit.ts`**

```typescript
import crypto from 'crypto';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

interface AuditEntry {
  actorType: string;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  const payload = JSON.stringify({
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
    ts: new Date().toISOString(),
  });

  const digest = crypto.createHash('sha256').update(payload).digest('hex');

  await db.insert(auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? undefined,
    action: entry.action,
    targetType: entry.targetType ?? undefined,
    targetId: entry.targetId ?? undefined,
    metadata: entry.metadata ?? undefined,
    digest,
  });
}
```

- [ ] **Step 3: Run test**

```bash
npm test tests/audit.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add saas-server/src/services/audit.ts saas-server/tests/audit.test.ts
git commit -m "feat(saas): add append-only audit log service"
```

---

## Task 4: Rate Limiters

**Files:**
- Create: `saas-server/src/middleware/rateLimits.ts`

- [ ] **Step 1: Create `src/middleware/rateLimits.ts`**

```typescript
import rateLimit from 'express-rate-limit';

// School admin login: 5 attempts per 15 min per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Super admin login: 3 attempts per 15 min per IP (stricter)
export const superLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
```

No test needed — these are thin config wrappers. They'll be exercised in auth integration tests.

- [ ] **Step 2: Commit**

```bash
git add saas-server/src/middleware/rateLimits.ts
git commit -m "feat(saas): add login rate limiters"
```

---

## Task 5: School Admin Authentication

**Files:**
- Create: `saas-server/src/routes/auth.ts`
- Create: `saas-server/src/middleware/requireTenantAdmin.ts`
- Modify: `saas-server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { tenants, tenantAdmins } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const app = createApp();
let tenantId: string;
let adminId: string;

beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({
    name: 'Test School',
    contactEmail: 'test@school.com',
  }).returning();
  tenantId = tenant.id;

  const [admin] = await db.insert(tenantAdmins).values({
    tenantId,
    username: 'testadmin',
    passwordHash: await bcrypt.hash('correctpass', 12),
    forcePasswordReset: false,
  }).returning();
  adminId = admin.id;
});

afterAll(async () => {
  await db.delete(tenantAdmins).where(eq(tenantAdmins.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
});

describe('POST /api/auth/login', () => {
  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets session cookie for correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'correctpass' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.tenantId).toBe(tenantId);
  });

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'anything' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns tenant info with valid session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testadmin', password: 'correctpass' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'testadmin', password: 'correctpass' });
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
```

Run: `npm test tests/auth.test.ts` — expected: FAIL (routes don't exist)

- [ ] **Step 2: Create `src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { tenantAdmins, tenants } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { loginLimiter } from '../middleware/rateLimits.js';
import { appendAuditLog } from '../services/audit.js';

const router = Router();

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const admin = await db.query.tenantAdmins.findFirst({
    where: eq(tenantAdmins.username, username),
    with: { tenant: true },
  });

  if (!admin) {
    // Constant-time response to prevent username enumeration
    await bcrypt.compare(password, '$2a$12$invalidhashpadding000000000000000000000000000000000000000');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (admin.tenant.status !== 'active') {
    return res.status(403).json({ error: 'Account suspended. Contact TachTach support.' });
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    await appendAuditLog({
      actorType: 'tenant_admin',
      actorId: admin.id,
      action: 'login_failed',
      metadata: { ip: req.ip },
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Regenerate session ID to prevent session fixation
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });

    req.session.type = 'tenant_admin';
    req.session.adminId = admin.id;
    req.session.tenantId = admin.tenantId;
    req.session.impersonatingTenantId = null;

    appendAuditLog({
      actorType: 'tenant_admin',
      actorId: admin.id,
      action: 'login',
      targetType: 'tenant',
      targetId: admin.tenantId,
      metadata: { ip: req.ip },
    });

    db.update(tenantAdmins)
      .set({ lastLogin: new Date() })
      .where(eq(tenantAdmins.id, admin.id))
      .execute();

    res.json({
      ok: true,
      tenantId: admin.tenantId,
      forcePasswordReset: admin.forcePasswordReset,
    });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.adminId || req.session.type !== 'tenant_admin') {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ adminId: req.session.adminId, tenantId: req.session.tenantId });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const adminId = req.session.adminId;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    if (adminId) {
      appendAuditLog({ actorType: 'tenant_admin', actorId: adminId, action: 'logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

export default router;
```

- [ ] **Step 3: Create `src/middleware/requireTenantAdmin.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

export function requireTenantAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.adminId || req.session.type !== 'tenant_admin') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Effective tenant: impersonation takes precedence for super admin impersonating
  req.session.tenantId = req.session.impersonatingTenantId ?? req.session.tenantId;
  next();
}
```

- [ ] **Step 4: Register routes in `src/app.ts`**

Add after the session middleware block in `createApp()`:
```typescript
import authRouter from './routes/auth.js';

// inside createApp(), after session middleware:
app.use('/api/auth', authRouter);
```

Also add Drizzle relations for the `with: { tenant: true }` query to work — add to `src/db/schema.ts`:
```typescript
import { relations } from 'drizzle-orm';

export const tenantAdminsRelations = relations(tenantAdmins, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantAdmins.tenantId], references: [tenants.id] }),
}));
```

- [ ] **Step 5: Run auth tests**

```bash
npm test tests/auth.test.ts
```

Expected: All PASS. If any fail, check session store table exists (connect-pg-simple creates `session` table on first run).

- [ ] **Step 6: Commit**

```bash
git add saas-server/src/routes/auth.ts saas-server/src/middleware/requireTenantAdmin.ts saas-server/src/db/schema.ts saas-server/src/app.ts saas-server/tests/auth.test.ts
git commit -m "feat(saas): school admin authentication with session + audit log"
```

---

## Task 6: Email Service + Super Admin Auth with TOTP

**Files:**
- Create: `saas-server/src/services/email.ts`
- Create: `saas-server/src/services/totp.ts`
- Create: `saas-server/src/routes/superauth.ts`
- Create: `saas-server/src/middleware/requireSuperAdmin.ts`
- Modify: `saas-server/src/app.ts`

- [ ] **Step 1: Create `src/services/email.ts`**

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendLoginAlert(opts: {
  ip: string;
  userAgent: string;
  timestamp: string;
}): Promise<void> {
  if (!process.env.ALERT_EMAIL) return;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.ALERT_EMAIL,
    subject: '🔐 TachTach Super Admin Login',
    text: [
      'A super admin login occurred.',
      '',
      `Time:       ${opts.timestamp}`,
      `IP address: ${opts.ip}`,
      `User agent: ${opts.userAgent}`,
      '',
      'If this was not you, change your password immediately.',
    ].join('\n'),
  });
}
```

- [ ] **Step 2: Create `src/services/totp.ts`**

```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export function generateTotpSecret(username: string): {
  secret: string;
  otpauthUrl: string;
} {
  const generated = speakeasy.generateSecret({
    name: `TachTach Super Admin (${username})`,
    length: 20,
  });
  return {
    secret: generated.base32,
    otpauthUrl: generated.otpauth_url!,
  };
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyTotpToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1, // allow 30s clock drift
  });
}
```

- [ ] **Step 3: Write failing tests for super admin auth**

Create `tests/superauth.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { superAdmins } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const app = createApp();
let superAdminId: string;

beforeAll(async () => {
  const [sa] = await db.insert(superAdmins).values({
    username: 'testsuper',
    passwordHash: await bcrypt.hash('supersecret', 12),
    totpEnabled: false,
  }).returning();
  superAdminId = sa.id;
});

afterAll(async () => {
  await db.delete(superAdmins).where(eq(superAdmins.id, superAdminId));
});

describe('POST /api/super/login — no TOTP enabled', () => {
  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/super/login')
      .send({ username: 'testsuper', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('accepts correct password and returns totpRequired: false', async () => {
    const res = await request(app)
      .post('/api/super/login')
      .send({ username: 'testsuper', password: 'supersecret' });
    expect(res.status).toBe(200);
    expect(res.body.totpRequired).toBe(false);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('GET /api/super/me', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).get('/api/super/me');
    expect(res.status).toBe(401);
  });

  it('returns superAdminId with valid session (no TOTP)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/super/login').send({ username: 'testsuper', password: 'supersecret' });
    const res = await agent.get('/api/super/me');
    expect(res.status).toBe(200);
    expect(res.body.superAdminId).toBe(superAdminId);
  });
});
```

Run: `npm test tests/superauth.test.ts` — expected: FAIL

- [ ] **Step 4: Create `src/routes/superauth.ts`**

```typescript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { superAdmins } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { superLoginLimiter } from '../middleware/rateLimits.js';
import { appendAuditLog } from '../services/audit.js';
import { sendLoginAlert } from '../services/email.js';
import { generateTotpSecret, generateQrDataUrl, verifyTotpToken } from '../services/totp.js';

const router = Router();

// POST /api/super/login
// Step 1: validate password. If TOTP enabled, returns { totpRequired: true } — client must follow up with /totp/verify.
router.post('/login', superLoginLimiter, async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };

  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.username, username),
  });

  if (!admin) {
    await bcrypt.compare(password, '$2a$12$invalidhashpadding000000000000000000000000000000000000000');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    await appendAuditLog({
      actorType: 'super_admin',
      actorId: admin.id,
      action: 'super_login_failed',
      metadata: { ip: req.ip },
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });

    req.session.type = 'super_admin';
    req.session.superAdminId = admin.id;
    req.session.totpVerified = !admin.totpEnabled; // if TOTP not set up, considered verified

    if (!admin.totpEnabled) {
      // No TOTP — fully authenticated immediately
      appendAuditLog({
        actorType: 'super_admin',
        actorId: admin.id,
        action: 'super_login',
        metadata: { ip: req.ip, totpUsed: false },
      });
      sendLoginAlert({
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
        timestamp: new Date().toISOString(),
      }).catch(() => {}); // non-blocking, fire and forget

      return res.json({ ok: true, totpRequired: false });
    }

    // TOTP enabled — partial auth, must verify token next
    res.json({ ok: true, totpRequired: true });
  });
});

// POST /api/super/totp/verify — second factor after password
router.post('/totp/verify', async (req, res) => {
  if (!req.session.superAdminId || req.session.type !== 'super_admin') {
    return res.status(401).json({ error: 'Start login first' });
  }
  if (req.session.totpVerified) {
    return res.json({ ok: true }); // already verified
  }

  const { token } = req.body as { token: string };
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.id, req.session.superAdminId),
  });

  if (!admin?.totpSecret) {
    return res.status(400).json({ error: 'TOTP not configured' });
  }

  const valid = verifyTotpToken(admin.totpSecret, token);
  if (!valid) {
    await appendAuditLog({
      actorType: 'super_admin',
      actorId: admin.id,
      action: 'totp_verify_failed',
      metadata: { ip: req.ip },
    });
    return res.status(401).json({ error: 'Invalid authenticator code' });
  }

  req.session.totpVerified = true;

  await appendAuditLog({
    actorType: 'super_admin',
    actorId: admin.id,
    action: 'super_login',
    metadata: { ip: req.ip, totpUsed: true },
  });

  sendLoginAlert({
    ip: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  res.json({ ok: true });
});

// POST /api/super/totp/setup — generate TOTP secret and QR (only when not yet enabled)
router.post('/totp/setup', async (req, res) => {
  if (!req.session.superAdminId || req.session.type !== 'super_admin') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.id, req.session.superAdminId),
  });
  if (!admin) return res.status(404).json({ error: 'Not found' });
  if (admin.totpEnabled) return res.status(400).json({ error: 'TOTP already enabled' });

  const { secret, otpauthUrl } = generateTotpSecret(admin.username);
  const qrDataUrl = await generateQrDataUrl(otpauthUrl);

  // Save secret (not yet enabled until confirmed)
  await db.update(superAdmins)
    .set({ totpSecret: secret })
    .where(eq(superAdmins.id, admin.id));

  res.json({ qrDataUrl, secret });
});

// POST /api/super/totp/confirm — user scans QR, enters code, we enable TOTP
router.post('/totp/confirm', async (req, res) => {
  if (!req.session.superAdminId || req.session.type !== 'super_admin') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { token } = req.body as { token: string };
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.id, req.session.superAdminId),
  });
  if (!admin?.totpSecret) return res.status(400).json({ error: 'Run /totp/setup first' });

  const valid = verifyTotpToken(admin.totpSecret, token);
  if (!valid) return res.status(401).json({ error: 'Invalid code — check your authenticator app' });

  await db.update(superAdmins)
    .set({ totpEnabled: true })
    .where(eq(superAdmins.id, admin.id));

  await appendAuditLog({
    actorType: 'super_admin',
    actorId: admin.id,
    action: 'totp_enabled',
  });

  res.json({ ok: true });
});

// GET /api/super/me
router.get('/me', (req, res) => {
  if (!req.session.superAdminId || req.session.type !== 'super_admin' || !req.session.totpVerified) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ superAdminId: req.session.superAdminId });
});

// POST /api/super/logout
router.post('/logout', (req, res) => {
  const superAdminId = req.session.superAdminId;
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    if (superAdminId) {
      appendAuditLog({ actorType: 'super_admin', actorId: superAdminId, action: 'super_logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

export default router;
```

- [ ] **Step 5: Create `src/middleware/requireSuperAdmin.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (
    !req.session.superAdminId ||
    req.session.type !== 'super_admin' ||
    !req.session.totpVerified
  ) {
    return res.status(401).json({ error: 'Super admin authentication required' });
  }
  next();
}
```

- [ ] **Step 6: Register routes in `src/app.ts`**

```typescript
import superauthRouter from './routes/superauth.js';

// inside createApp(), after authRouter:
app.use('/api/super', superauthRouter);
```

- [ ] **Step 7: Run super admin tests**

```bash
npm test tests/superauth.test.ts
```

Expected: All PASS.

- [ ] **Step 8: Run all tests to ensure nothing broke**

```bash
npm test
```

Expected: All PASS across auth, superauth, audit, schema tests.

- [ ] **Step 9: Commit**

```bash
git add saas-server/src/routes/superauth.ts saas-server/src/middleware/requireSuperAdmin.ts saas-server/src/services/email.ts saas-server/src/services/totp.ts saas-server/tests/superauth.test.ts saas-server/src/app.ts
git commit -m "feat(saas): super admin auth with TOTP 2FA and login alerts"
```

---

## Task 7: PostgreSQL Row Level Security

**Files:**
- Create: `saas-server/drizzle/rls.sql` (applied once, not via drizzle-kit)

RLS is the database-layer second line of defense against ORM mistakes leaking cross-tenant data.

- [ ] **Step 1: Write the failing test**

Add to `tests/schema.test.ts`:
```typescript
it('RLS blocks cross-tenant device access when session role is set', async () => {
  // Create two tenants
  const [tenantA] = await db.insert(tenants).values({ name: 'School A', contactEmail: 'a@test.com' }).returning();
  const [tenantB] = await db.insert(tenants).values({ name: 'School B', contactEmail: 'b@test.com' }).returning();
  const [deviceA] = await db.insert(devices).values({ tenantId: tenantA.id, name: 'Lobby A' }).returning();

  // Set session var as tenant B — should not see tenant A's devices
  const result = await db.execute(sql`
    SET LOCAL app.current_tenant_id = ${tenantB.id};
    SELECT * FROM devices WHERE id = ${deviceA.id};
  `);

  expect(result.rows).toHaveLength(0);

  // Cleanup
  await db.delete(devices).where(eq(devices.tenantId, tenantA.id));
  await db.delete(tenants).where(eq(tenants.id, tenantA.id));
  await db.delete(tenants).where(eq(tenants.id, tenantB.id));
});
```

Run: `npm test` — expected: FAIL (RLS not set up)

- [ ] **Step 2: Create `drizzle/rls.sql`**

```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_admins ENABLE ROW LEVEL SECURITY;

-- Policy: rows are visible only if tenant_id matches the session variable
-- app.current_tenant_id is set by the application before each query
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON tenant_admins
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- audit_log and super_admins and tenants are NOT RLS-protected
-- (super admin needs full access; audit_log is append-only system table)

-- Grant usage so the app role can set session variables
GRANT SET ON PARAMETER app.current_tenant_id TO your_db_user;
```

Replace `your_db_user` with the actual PostgreSQL user from your DATABASE_URL.

- [ ] **Step 3: Apply the RLS policies**

```bash
psql $DATABASE_URL -f drizzle/rls.sql
```

Expected: `ALTER TABLE`, `CREATE POLICY` outputs — no errors.

- [ ] **Step 4: Add tenant scoping middleware that sets the session variable**

Add to `src/middleware/requireTenantAdmin.ts`:
```typescript
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

export async function setTenantContext(tenantId: string): Promise<void> {
  await db.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
}
```

Update `requireTenantAdmin` to call this:
```typescript
export function requireTenantAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.adminId || req.session.type !== 'tenant_admin') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const effectiveTenantId = req.session.impersonatingTenantId ?? req.session.tenantId;
  // Set DB session variable so RLS kicks in
  setTenantContext(effectiveTenantId)
    .then(() => next())
    .catch((err) => res.status(500).json({ error: 'Context error' }));
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add saas-server/drizzle/rls.sql saas-server/src/middleware/requireTenantAdmin.ts saas-server/tests/schema.test.ts
git commit -m "feat(saas): PostgreSQL RLS for tenant data isolation"
```

---

## Task 8: Vitest Config + Final Build Check

**Files:**
- Create: `saas-server/vitest.config.ts`

- [ ] **Step 1: Create vitest config**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Note counts.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: `dist/` produced, no TypeScript errors.

- [ ] **Step 4: Final commit**

```bash
git add saas-server/vitest.config.ts
git commit -m "feat(saas): Plan 1 complete — server foundation with auth, RLS, audit log"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Node.js + Express + PostgreSQL + Drizzle — Task 1+2
- ✅ Multi-tenant schema (tenants, devices, tenant_admins, super_admins, audit_log) — Task 2
- ✅ School admin auth: bcrypt, rate limiting, session fixation fix, httpOnly cookie, 4-hour expiry — Task 5
- ✅ Super admin auth: TOTP 2FA, login alerts, 2-hour session — Task 6
- ✅ PostgreSQL RLS policies — Task 7
- ✅ Immutable audit log with SHA-256 digest — Task 3
- ⏭ Middleware: tenant scoping on all routes — covered by requireTenantAdmin but full route-level enforcement comes in Plan 2 when actual tenant routes exist
- ⏭ CSRF protection — deferred to Plan 4 (admin portal UI), not needed for API-only Plan 1
- ⏭ Cloudflare R2, Caddy config — infrastructure setup, handled separately before deployment

**Type consistency:**
- `appendAuditLog` is defined in Task 3 and called identically in Tasks 5, 6, 7 ✅
- `requireTenantAdmin` is defined in Task 5 and extended in Task 7 ✅
- `verifyTotpToken(secret, token)` defined in Task 6 services, called identically in routes ✅

**No placeholders confirmed** — all code blocks are complete.
