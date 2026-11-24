/**
 * The three pages of the "Sign in with" connector: the consent page, the "continue" bounce, and a plain error page.
 * Same look as the sign-in pages (authPages.js). The consent page talks to POST /oauth/authorize with a script
 * (so the browser's own form-redirect rules never get in the way of going back to the app).
 */
import { HEAD, esc, inlineJson } from '../authPages.js';

const BLOCK = 'font-family:Georgia,serif;direction:ltr;text-align:left;line-height:1.55;font-size:16px';
const BTN = (extra = '') => `style="display:block;width:100%;min-height:48px;margin-top:10px;padding:12px 16px;border-radius:8px;border:1px solid #D4A84B;cursor:pointer;font-size:16px;font-family:inherit;${extra}"`;

export function consentPage({ siteName, personName, clientName, canConnect, fields, csrf }) {
  const what = `<p style="${BLOCK}"><strong>${esc(clientName)}</strong> wants to connect to <strong>${esc(siteName || 'this screen')}</strong>, acting as <strong>${esc(personName)}</strong>.</p>`;
  if (!canConnect) {
    return `${HEAD('TachTach-Screens — Connect an AI')}
    <p class="title-english">Connect an AI</p>
    ${what}
    <p style="${BLOCK};margin-top:12px">Your account is not allowed to connect an AI. Ask an admin to give you that access, then try again.</p>
    <a class="plain-link" href="/admin">Back to the admin</a>
  </div>
</body>
</html>`;
  }
  return `${HEAD('TachTach-Screens — Connect an AI')}
    <p class="title-english">Connect an AI</p>
    ${what}
    <ul style="${BLOCK};margin:12px 0 0 18px">
      <li>It can only do what <strong>you</strong> can do, never more.</li>
      <li>It never sees student names (Bochurim, Chazan), people, security or software updates.</li>
      <li>Your AI app asks you to tap <strong>Allow</strong> before it changes anything, and every change is marked “by AI” with an Undo.</li>
      <li>You can cut it off any time in Connect an AI.</li>
    </ul>
    <button type="button" id="allowChange" ${BTN('background:#D4A84B;color:#12100C;font-weight:700')}>Allow: look and change things</button>
    <button type="button" id="allowRead" ${BTN('background:transparent;color:#EFE3C0')}>Allow: look only</button>
    <button type="button" id="deny" ${BTN('background:transparent;color:#EFE3C0;border-color:rgba(239,227,192,.35)')}>Cancel</button>
    <div class="error-message" id="errorMsg"></div>
  </div>
  <script>
    var FIELDS = ${inlineJson(fields)};
    FIELDS.csrf = ${inlineJson(csrf)};
    function showError(m) { var e = document.getElementById('errorMsg'); e.textContent = m; e.classList.add('visible'); }
    function send(decision) {
      ['allowChange', 'allowRead', 'deny'].forEach(function (id) { document.getElementById(id).disabled = true; });
      var body = Object.assign({ decision: decision }, FIELDS);
      fetch('/oauth/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.redirect) { window.location.replace(d.redirect); return; }
          showError((d && d.error) || 'Something went wrong. Close this page and start again from your AI app.');
        })
        .catch(function () { showError('Network error. Please try again.'); });
    }
    document.getElementById('allowChange').addEventListener('click', function () { send('change'); });
    document.getElementById('allowRead').addEventListener('click', function () { send('read'); });
    document.getElementById('deny').addEventListener('click', function () { send('deny'); });
  </script>
</body>
</html>`;
}

/** A browser arriving from another site does not send the sign-in cookie; one hop from our own page does. */
export function continuePage({ continueUrl }) {
  return `${HEAD('TachTach-Screens — Connect an AI')}
    <p class="title-english">Connect an AI</p>
    <p style="${BLOCK}">One moment…</p>
    <a class="plain-link" id="go" href="${esc(continueUrl)}">Continue</a>
  </div>
  <script>
    window.location.replace(document.getElementById('go').getAttribute('href'));
  </script>
</body>
</html>`;
}

export function oauthErrorPage({ message }) {
  return `${HEAD('TachTach-Screens — Connect an AI')}
    <p class="title-english">Connect an AI</p>
    <p style="${BLOCK}">${esc(message)}</p>
  </div>
</body>
</html>`;
}
