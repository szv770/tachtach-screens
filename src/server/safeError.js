/**
 * Never echo err.message to a client unless it is a known client error.
 *
 *  - clientError(msg): an Error whose message was written FOR the user (upload filters);
 *    isClientError() recognises it.
 *  - networkReason(err): a short plain-English reason for an outbound-fetch failure
 *    (RSS preview, embed probe, weather) without hostnames/IPs/paths from the raw error.
 *  - publicErrorMessage(status): the fixed text the global error handler sends.
 */
export function clientError(message) {
  const e = new Error(message);
  e.clientSafe = true;
  return e;
}
export const isClientError = (err) => !!(err && err.clientSafe === true);

/** Messages our own fetchers throw on purpose ("HTTP 404 fetching feed", "could not geocode zip 12345"). */
const OWN_MESSAGE = /^(HTTP \d{3}( fetching feed)?|could not geocode zip \d{5}|unexpected Open-Meteo response)$/;

export function networkReason(err) {
  const msg = String(err?.message || '');
  if (OWN_MESSAGE.test(msg)) return msg;
  const code = String(err?.code || err?.cause?.code || '');
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || /TIMEDOUT|TIMEOUT/.test(code)) return 'the site took too long to answer';
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'that address could not be found';
  if (/ECONNREFUSED/.test(code)) return 'the connection was refused';
  if (/ECONNRESET|EPIPE|UND_ERR/.test(code)) return 'the connection was dropped';
  if (/CERT|SSL|TLS|DEPTH_ZERO/.test(code) || /certificate/i.test(msg)) return 'the site has a security certificate problem';
  if (/redirect/i.test(msg)) return 'too many redirects';
  if (/private|not allowed|blocked/i.test(msg) && /address|host|network/i.test(msg)) return 'that address is not allowed';
  return 'a network error occurred';
}

const STATUS_TEXT = {
  400: 'Bad request.',
  401: 'Please sign in.',
  403: 'Not allowed.',
  404: 'Not found.',
  405: 'Method not allowed.',
  408: 'The request took too long.',
  413: 'That request is too large.',
  415: 'Unsupported content type.',
  429: 'Too many requests. Please slow down.',
};
/** Fixed, generic text for the global error handler; never err.message. */
export function publicErrorMessage(status) {
  return STATUS_TEXT[status] || 'An unexpected error occurred. Please try again.';
}
