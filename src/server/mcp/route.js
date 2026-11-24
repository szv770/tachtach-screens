/**
 * POST /mcp: the AI connector (MCP, Streamable HTTP, stateless).
 *
 * Gate, in order (every step fails closed):
 *   1. AI connections must be switched on (settings.aiAccess.enabled): otherwise 404, as if the address did not exist.
 *   2. Only POST (there is nothing to stream): anything else is 405.
 *   3. `Authorization: Bearer ttk_...` must be a valid key. No cookie is ever looked at.
 *   4. Not on a TLS port (the tool layer talks to this server over plain loopback HTTP).
 *   5. Per-key request limit (looking things up is free of the CHANGE limit, but not unlimited).
 * Only after that is the body read (256 kB), so nobody unauthenticated can make the server buffer it.
 * The key's person and ceiling come from middleware.js userForApiKey: the same rules as the REST chain.
 */
import express from 'express';
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { readJSON } from '../storage.js';
import { aiAccessFrom, createChangeLimiter } from '../../shared/aiAccess.js';
import { effectiveCaps } from '../../shared/permissions.js';
import { userForApiKey } from '../middleware.js';
import { createExecutor } from './executor.js';
import { createDispatcher } from './dispatch.js';
import { createMcpServer } from './server.js';

const requestLimiter = createChangeLimiter();
const REQUESTS_PER_MINUTE = 120;

const jsonRpcError = (res, status, message) => res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });

export function createMcpRouter({ dispatch = createDispatcher() } = {}) {
  const router = Router();

  router.use(async (req, res, next) => {
    try {
      const access = aiAccessFrom(await readJSON('settings.json').catch(() => null));
      if (!access.enabled) return res.status(404).end();
      if (req.method !== 'POST') { res.set('Allow', 'POST'); return jsonRpcError(res, 405, 'Use POST.'); }
      const h = req.headers.authorization;
      const m = typeof h === 'string' ? /^Bearer\s+(\S+)\s*$/i.exec(h) : null;
      if (!m) { res.set('WWW-Authenticate', 'Bearer'); return jsonRpcError(res, 401, 'Send your AI connection key as "Authorization: Bearer ttk_...".'); }
      const auth = await userForApiKey(m[1]);
      if (auth.error) { res.set('WWW-Authenticate', 'Bearer'); return jsonRpcError(res, 401, auth.error); }
      if (req.socket.encrypted) return jsonRpcError(res, 400, 'Use the normal web address for the AI connector, not the local secure one.');
      const lim = requestLimiter.check(`mcp:${auth.user.ai.connectionId}`, { changesPerMinute: REQUESTS_PER_MINUTE, changesPerDay: 100_000 });
      if (!lim.ok) { res.set('Retry-After', String(lim.retryAfterSec)); return jsonRpcError(res, 429, 'Too many requests. Wait a moment.'); }
      req.mcp = { secret: m[1], user: auth.user, access: auth.access };
      next();
    } catch (e) {
      console.error('[mcp] gate:', e.message);
      jsonRpcError(res, 500, 'The connector could not start.');
    }
  });

  router.use(express.json({ limit: '256kb' }));

  router.post('/', async (req, res) => {
    const { secret, user, access } = req.mcp;
    const ctx = {
      api: createExecutor({ port: req.socket.localPort, key: secret, clientIp: req.ip }),
      user,
      caps: effectiveCaps(user),
      mode: user.ai.mode,
      access,
      connectionId: user.ai.connectionId,
      now: () => new Date(),
    };
    const server = createMcpServer({ ctx, dispatch });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('[mcp] request:', e.message);
      if (!res.headersSent) jsonRpcError(res, 500, 'The connector hit an error.');
    }
  });

  return router;
}
