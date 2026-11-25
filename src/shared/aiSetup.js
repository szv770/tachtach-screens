/**
 * "Is my screen ready for an AI to connect?" (pure, shared with the doctor script and the admin).
 *
 * claude.ai connects from Anthropic's servers, so the screen's PUBLIC address has to work from outside: HTTPS on port 443,
 * a real public name (not localhost or a home-network address), no sign-in wall in front (Cloudflare Access), and nothing that
 * challenges a program that is not a browser. Each check says what is wrong in plain words and what to do about it.
 */
export const CLAUDE_IP_RANGE = '160.79.104.0/21';

export const claudeCodeCommand = (origin) => `claude mcp add --transport http tachtach ${origin}/mcp`;

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.lan|.*\.home|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;
const BARE_IP = /^(\d{1,3}\.){3}\d{1,3}$/;

/** @param {{ origin: string, enabled: boolean, publicUrlSet?: boolean, headers?: object, docs?: object|null }} i */
export function connectionChecks({ origin, enabled, publicUrlSet = false, headers = {}, docs = null }) {
  const out = [];
  const add = (id, status, title, detail) => out.push({ id, status, title, ...(detail ? { detail } : {}) });
  let url = null;
  try { url = new URL(origin); } catch { /* handled below */ }
  if (!url) { add('address', 'fail', 'The screen\'s address could not be read', 'Set PUBLIC_URL=https://your.address on the screen and restart it.'); return out; }

  add('switch', enabled ? 'ok' : 'fail', enabled ? 'AI connections are switched on' : 'AI connections are switched off', enabled ? '' : 'An admin turns on "Allow AI connections" first. Until then nothing below can work.');
  add('https', url.protocol === 'https:' ? 'ok' : 'fail', url.protocol === 'https:' ? 'The address uses https' : 'This page was opened over http, not https',
    url.protocol === 'https:' ? '' : 'claude.ai only connects to https addresses. Open the admin through the address you use from outside (for example https://your-school.example), or set PUBLIC_URL.');
  const host = url.hostname;
  const privateHost = PRIVATE_HOST.test(host);
  add('public', privateHost ? 'fail' : (BARE_IP.test(host) ? 'warn' : 'ok'),
    privateHost ? `${host} is only reachable inside your building` : (BARE_IP.test(host) ? `${host} is a bare number address` : `${host} looks like a public name`),
    privateHost ? 'claude.ai connects from the internet and cannot reach this. Use your public address (the Cloudflare Tunnel name).' : (BARE_IP.test(host) ? 'Use a proper name with https; a bare IP address usually has no valid certificate.' : ''));
  if (url.port && url.port !== '443') add('port', 'fail', `The address uses port ${url.port}`, 'claude.ai can only connect on the normal https port (443). Use the public address that has no :port.');
  if (publicUrlSet) add('pinned', 'info', 'PUBLIC_URL is set on this screen', 'The address claude.ai is told is the one in PUBLIC_URL. Make sure it is the address you type into Claude.');

  const cf = headers['cf-ray'] !== undefined || /cloudflare/i.test(String(headers.server || ''));
  const access = headers['cf-access-jwt-assertion'] !== undefined || headers['cf-access-authenticated-user-email'] !== undefined;
  if (access) add('access', 'fail', 'Cloudflare Access is asking people to sign in first', `AI apps cannot pass that. In Cloudflare, add an Access policy "Bypass" for the paths /mcp, /oauth and /.well-known (for Claude alone, its address range ${CLAUDE_IP_RANGE} also works), or leave Access off this address.`);
  else if (cf) add('cloudflare', 'info', 'Cloudflare is in front of this screen', `That is fine. If an AI app (Claude, Meta AI, ChatGPT...) cannot connect, Cloudflare may be challenging it: in Cloudflare > Security > WAF add one custom rule that SKIPS the security checks when the path starts with /mcp, /oauth or /.well-known (this works for every app), or turn off "Bot Fight Mode" for those paths.`);

  if (docs) {
    const r = docs.resource; const s = docs.server; const m = docs.mcp;
    const resOk = r?.status === 200 && r.body?.resource === `${origin}/mcp` && Array.isArray(r.body.authorization_servers) && r.body.authorization_servers[0] === origin;
    add('discovery-resource', resOk ? 'ok' : 'fail', resOk ? 'The connector address is described correctly' : 'The connector description is wrong or missing',
      resOk ? '' : (r?.status === 404 ? 'This screen has not been updated to the version with the AI connector, or AI connections are off.' : `The screen says its address is ${r?.body?.resource || 'unknown'}, but it should be ${origin}/mcp. Set PUBLIC_URL=${origin}`));
    const srvOk = s?.status === 200 && s.body?.issuer === origin && s.body.code_challenge_methods_supported?.includes('S256');
    add('discovery-server', srvOk ? 'ok' : 'fail', srvOk ? 'The sign-in service is described correctly' : 'The sign-in service description is wrong or missing', srvOk ? '' : 'Check PUBLIC_URL and that this screen is up to date.');
    const mcpOk = m?.status === 401 && /resource_metadata=/.test(String(m.headers?.['www-authenticate'] || ''));
    add('mcp', mcpOk ? 'ok' : 'fail', mcpOk ? '/mcp asks for a sign-in the way claude.ai expects' : '/mcp does not answer the way claude.ai expects', mcpOk ? '' : `It answered ${m?.status || 'nothing'}. It should answer 401 with a pointer to the sign-in service.`);
  }
  return out;
}

/** Plain summary: ready when nothing failed. */
export const isReady = (checks) => !checks.some((c) => c.status === 'fail');
