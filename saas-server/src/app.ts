import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import healthRouter from './routes/health.js';

const PgSession = connectPgSimple(session);

/**
 * Sessions are signed with SESSION_SECRET. In production a missing secret must stop
 * the server (a public fallback constant would make sessions forgeable); locally a
 * dev-only constant keeps `npm run dev` working.
 */
export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production (refusing to start with a built-in secret).');
  }
  console.warn('[saas-server] SESSION_SECRET not set: using an insecure development secret.');
  return 'dev-secret-change-in-production';
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.ADMIN_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json());

  const sessionStore = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
  });

  app.use(session({
    store: sessionStore,
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 4 * 60 * 60 * 1000, // 4 hours
    },
  }));

  app.use('/health', healthRouter);

  return app;
}
