/**
 * Express 4 does not look at the promise an async middleware/route returns, so a rejection
 * (an unreadable data file, a failed fetch...) became an unhandled rejection and Node 22 killed
 * the whole server (security audit H2). This patches the router layer once so a rejected promise
 * goes to next(err), i.e. the global error handler answers 500 and the process keeps running.
 * Import this module before any router is used.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncSafe) {
  // Same logic as express/lib/router/layer.js, plus: a returned promise that rejects goes to next(err).
  const watch = (out, next) => { if (out && typeof out.then === 'function') out.then(undefined, next); };
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try { watch(fn(req, res, next), next); } catch (err) { next(err); }
  };
  Layer.prototype.handle_error = function handleError(error, req, res, next) {
    const fn = this.handle;
    if (fn.length !== 4) return next(error);
    try { watch(fn(error, req, res, next), next); } catch (err) { next(err); }
  };
  Layer.prototype.__asyncSafe = true;
}
