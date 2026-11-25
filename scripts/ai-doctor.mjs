#!/usr/bin/env node
/**
 * AI connection doctor: "will Claude be able to connect to my screen?"
 *
 *   npm run ai:doctor -- https://tachtach.example.org
 *   npm run ai:doctor -- https://tachtach.example.org --key ttk_xxxxxxxx     (also lists what the AI can do)
 *   AI_DOCTOR_KEY=ttk_xxx npm run ai:doctor -- https://tachtach.example.org
 *
 * Run it from ANY computer (it looks at your screen from the outside, like claude.ai does): reachable? HTTPS? does Cloudflare get in
 * the way? does /mcp ask for a sign-in the right way? are the sign-in documents right? does registration work? Each line says what is
 * wrong and what to do. Flags: --no-register (do not register a test app), --allow-http (for a test on your own network),
 * --redirect <address> (check that ANOTHER AI app's return address, e.g. Meta AI's, is allowed to register).
 * Exit code 0 = everything claude.ai needs is working, 1 = something to fix.
 */
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const address = args.find((a) => !a.startsWith('--') && a !== value('key') && a !== value('redirect'));
const key = value('key') || process.env.AI_DOCTOR_KEY || '';
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const CLAUDE_RANGE = '160.79.104.0/21';

if (!address) {
  console.error('Usage: npm run ai:doctor -- https://your-screen-address [--key ttk_...] [--no-register] [--allow-http] [--redirect https://app/callback]');
  process.exit(2);
}

let origin;
try {
  const u = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
  origin = `${u.protocol}//${u.host}`;
} catch { console.error(`"${address}" is not an address.`); process.exit(2); }

const mark = { ok: '✔', fail: '✖', warn: '!', info: 'i' };
let failures = 0;
const say = (status, text, detail = '') => {
  if (status === 'fail') failures++;
  console.log(`${mark[status]} ${text}`);
  if (detail) console.log(`    ${detail.replace(/\n/g, '\n    ')}`);
};

async function http(method, url, { body, form, headers = {} } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': 'tachtach-ai-doctor/1', accept: 'application/json, text/html', ...(body ? { 'content-type': 'application/json' } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
      body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.message, headers: new Headers(), text: '', json: null, ms: Date.now() - t0 };
  }
}

// Cloudflare puts a harmless "challenge-platform" script into normal pages, so words in the body only count on an error status.
const challenged = (r) => r.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(r.status) && /just a moment|attention required|cf-chl|challenge-platform/i.test(r.text.slice(0, 4000)));
const cloudflareTip = `In Cloudflare > Security > WAF add a custom rule that SKIPS the security checks when the path starts with /mcp, /oauth or /.well-known\n(this works for every AI app; Claude alone could also be allowed by its address range ${CLAUDE_RANGE}).\nOr turn off "Bot Fight Mode" / "Under Attack" for those paths. Then run this again.`;

console.log(`Checking ${origin}\n`);

// 1. reachable + https
if (!origin.startsWith('https://')) say(flag('allow-http') ? 'warn' : 'fail', 'The address is http, not https', flag('allow-http') ? 'Allowed for this test. claude.ai itself only connects to https.' : 'claude.ai only connects to https addresses. Use your public address (the Cloudflare Tunnel name).');
const host = new URL(origin).hostname;
if (/^(localhost|.*\.local|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) say(flag('allow-http') ? 'warn' : 'fail', `${host} is only reachable inside your building`, 'claude.ai connects from the internet. Use the public address.');
if (new URL(origin).port && new URL(origin).port !== '443' && origin.startsWith('https://')) say('fail', `The address uses port ${new URL(origin).port}`, 'claude.ai can only connect on the normal https port (443).');

const home = await http('GET', `${origin}/`);
if (home.status === 0) { say('fail', 'The screen did not answer at all', `${home.error}. Is it switched on, is the Cloudflare Tunnel running, is the address spelled right?`); finish(); }
if (challenged(home)) say('fail', 'Cloudflare is showing a "checking your browser" page to programs', cloudflareTip);
else say('ok', `The screen answers (${home.status})${home.headers.get('server') ? `, served by ${home.headers.get('server')}` : ''}`);
if (home.headers.get('cf-access-authenticated-user-email') || /cloudflareaccess\.com/i.test(home.headers.get('location') || '') || [302, 401, 403].includes(home.status) && /access/i.test(home.text.slice(0, 2000))) {
  say('fail', 'Cloudflare Access (a sign-in wall) seems to be in front of the screen', `claude.ai cannot pass it. In Cloudflare add an Access policy with action "Bypass" for ${CLAUDE_RANGE}, or leave Access off this address.`);
}

// 2. /mcp asks for a sign-in the way claude.ai expects
const mcp = await http('POST', `${origin}/mcp`, { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
let metadataUrl = '';
if (challenged(mcp)) say('fail', '/mcp is being challenged by Cloudflare', cloudflareTip);
else if (mcp.status === 404) say('fail', '/mcp does not exist here', 'Either AI connections are switched off (Look & Settings > Connect an AI > turn on "Allow AI connections"), or this screen has not been updated to the version with the AI connector yet (Health > Software update, or run deploy/update.sh).');
else if (mcp.status === 401) {
  const www = mcp.headers.get('www-authenticate') || '';
  const m = /resource_metadata="([^"]+)"/.exec(www);
  if (m) { metadataUrl = m[1]; say('ok', '/mcp asks to sign in, and says where to find the sign-in description'); }
  else say('fail', '/mcp answers 401 but without the "resource_metadata" pointer claude.ai needs', `It sent: ${www || '(no WWW-Authenticate header)'}\nA proxy may be removing the header.`);
} else say('fail', `/mcp answered ${mcp.status || 'nothing'}, expected 401`, mcp.text.slice(0, 200));
if (mcp.ms > 8000) say('fail', `/mcp took ${mcp.ms} ms to answer`, 'claude.ai gives up after 10 seconds.');

// 3. documents
let asMeta = null;
if (metadataUrl) {
  const prm = await http('GET', metadataUrl);
  if (prm.status !== 200 || !prm.json) say('fail', `The connector description at ${metadataUrl} is missing (${prm.status})`, 'Check PUBLIC_URL on the screen: it must be exactly the address you use here.');
  else {
    const okResource = prm.json.resource === `${origin}/mcp`;
    say(okResource ? 'ok' : 'fail', okResource ? 'The connector description matches your address' : `The connector description says its address is ${prm.json.resource}`, okResource ? '' : `It must be ${origin}/mcp. Set PUBLIC_URL=${origin} on the screen and restart it.`);
    const issuer = (prm.json.authorization_servers || [])[0];
    if (!issuer) say('fail', 'The connector description names no sign-in service');
    else {
      const meta = await http('GET', `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`);
      asMeta = meta.json;
      if (meta.status !== 200 || !asMeta) say('fail', `The sign-in service description is missing at ${issuer} (${meta.status})`);
      else {
        const problems = [];
        if (asMeta.issuer !== issuer) problems.push(`issuer is ${asMeta.issuer}`);
        if (!asMeta.code_challenge_methods_supported?.includes('S256')) problems.push('S256 is not offered');
        if (!asMeta.response_types_supported?.includes('code')) problems.push('the code flow is not offered');
        if (!asMeta.registration_endpoint) problems.push('no registration endpoint');
        for (const k of ['authorization_endpoint', 'token_endpoint']) if (!asMeta[k] || (origin.startsWith('https://') && !String(asMeta[k]).startsWith('https://'))) problems.push(`${k} is ${asMeta[k] || 'missing'}`);
        say(problems.length ? 'fail' : 'ok', problems.length ? `The sign-in service description has problems: ${problems.join('; ')}` : 'The sign-in service description is right (code + PKCE S256)');
      }
    }
  }
}

// 4. registration, sign-in page, token endpoint
if (asMeta?.registration_endpoint && !flag('no-register')) {
  const reg = await http('POST', asMeta.registration_endpoint, { body: { client_name: 'AI doctor test', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none' } });
  if (reg.status !== 201 || !reg.json?.client_id) say('fail', `Registration did not work (${reg.status})`, reg.text.slice(0, 200));
  else {
    say('ok', `A test app could register itself (${reg.ms} ms)`);
    const evil = await http('POST', asMeta.registration_endpoint, { body: { client_name: 'x', redirect_uris: ['https://evil.example/cb'] } });
    say(evil.status === 400 ? 'ok' : 'fail', evil.status === 400 ? 'A stranger\'s return address is refused (good)' : `A stranger's return address was NOT refused (${evil.status})`);
    const other = value('redirect');
    if (other) {
      const o = await http('POST', asMeta.registration_endpoint, { body: { client_name: 'AI doctor test (other app)', redirect_uris: [other], token_endpoint_auth_method: 'none' } });
      say(o.status === 201 ? 'ok' : 'fail', o.status === 201 ? `That app's return address is allowed (${other})` : `That app's return address is NOT allowed yet (${other})`,
        o.status === 201 ? '' : 'Open Connect an AI > Other AI apps: it is listed under "turned away" (press Allow), or paste the address under "Allow another app".');
    }
    // browsers (and apps that run behind one) need CORS on the machine endpoints
    const pre = await http('OPTIONS', `${origin}/mcp`, { headers: { origin: 'https://agent.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    say(pre.status === 204 && pre.headers.get('access-control-allow-origin') ? 'ok' : 'warn', pre.status === 204 ? 'Browser-based AI apps are allowed to talk to /mcp (CORS)' : `A browser check on /mcp answered ${pre.status}`, pre.status === 204 ? '' : 'Most apps do not need this, but browser-based ones do. Update TachTach if this is old.');
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const qs = new URLSearchParams({ response_type: 'code', client_id: reg.json.client_id, redirect_uri: CLAUDE_CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', state: 'doctor', resource: `${origin}/mcp` });
    const auth = await http('GET', `${asMeta.authorization_endpoint}?${qs}`);
    say(auth.status === 200 && /text\/html/.test(auth.headers.get('content-type') || '') ? 'ok' : 'fail', auth.status === 200 ? 'The sign-in page opens' : `The sign-in page answered ${auth.status}`, auth.status === 200 ? '' : auth.text.slice(0, 200));
    const tok = await http('POST', asMeta.token_endpoint, { form: { grant_type: 'refresh_token', refresh_token: 'ttr_doctor', client_id: reg.json.client_id } });
    say(tok.status === 400 && tok.json?.error === 'invalid_grant' ? 'ok' : 'fail', tok.status === 400 && tok.json?.error === 'invalid_grant' ? 'The token service answers the way claude.ai expects' : `The token service answered ${tok.status} ${tok.json?.error || ''}`, tok.status === 415 ? 'It cannot read form bodies.' : '');
    if (Math.max(reg.ms, auth.ms, tok.ms) > 8000) say('fail', 'One of the sign-in steps was very slow', 'claude.ai gives up after 10 seconds per step.');
  }
}

// 5. with a key: talk to it like an AI app would
if (key) {
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const client = new Client({ name: 'ai-doctor', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
    const tools = (await client.listTools()).tools;
    say('ok', `Connected with the key: ${tools.length} tools offered`);
    const caps = JSON.parse((await client.callTool({ name: 'get_capabilities', arguments: {} })).content[0].text);
    say('ok', `The key is ${caps.youAre.mode}`, caps.areas.filter((a) => a.status === 'available').map((a) => `${a.name}${a.canChange ? '' : ' (look only)'}`).join(', '));
    const ov = JSON.parse((await client.callTool({ name: 'get_overview', arguments: {} })).content[0].text);
    say(ov.tv?.online ? 'ok' : 'warn', `The screen's clock says ${ov.now}${ov.tv?.online ? '; the TV is online' : '; the TV is not connected right now'}`);
    await client.close();
  } catch (e) {
    say('fail', 'The key did not work', `${e.message}\nMake a new key in Connect an AI > Other apps, and check that "Allow AI connections" is on.`);
  }
} else {
  console.log('\n(Add --key ttk_... to also check what an AI with a key can do.)');
}

finish();

function finish() {
  console.log('');
  if (failures === 0) {
    console.log('Everything claude.ai needs is working.');
    console.log('Next: in Claude open Customize > Connectors > Add custom connector, paste this address and press Connect:');
    console.log(`    ${origin}/mcp`);
    process.exit(0);
  }
  console.log(`${failures} thing${failures === 1 ? '' : 's'} to fix (see the lines marked ${mark.fail} above), then run this again.`);
  process.exit(1);
}
