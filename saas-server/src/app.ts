import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import healthRouter from './routes/health.js';

const PgSession = connectPgSimple(session);

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
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
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
