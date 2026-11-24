/**
 * The tool layer's only way to read or change anything: a loopback HTTP call to THIS server's own /api, carrying the
 * connection's key. So the whole normal chain applies to every tool: the person's access minus what an AI may never do,
 * look-only keys, the per-key limit, validation, undo, the "by AI" history line and the live update to the TVs.
 * It proves it is the tool layer with a per-process header (middleware.js internalHeaders), and forwards the real client
 * address so the per-address limiter is not shared by every key. Plain HTTP on 127.0.0.1 only (never leaves the machine).
 */
import http from 'node:http';
import { internalHeaders } from '../middleware.js';

/**
 * @param {{ port: number, key: string, clientIp?: string }} o
 * @returns {(method: string, path: string, body?: any) => Promise<{ status: number, body: any, text: string }>}
 */
export function createExecutor({ port, key, clientIp = '' }) {
  return function callApi(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? '' : JSON.stringify(body);
      const headers = { host: `127.0.0.1:${port}`, authorization: `Bearer ${key}`, ...internalHeaders() };
      if (clientIp) headers['x-forwarded-for'] = clientIp;
      if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
      const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* not JSON */ }
          resolve({ status: res.statusCode, body: json, text });
        });
      });
      req.setTimeout(30_000, () => req.destroy(new Error('The screen took too long to answer.')));
      req.on('error', reject);
      req.end(data);
    });
  };
}
