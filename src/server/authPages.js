/**
 * HTML for every signed-out page: sign in, invite and sign-in-link pages, and the
 * "link isn't valid" notice. One look, one script that walks the 2-step screens.
 */

export const AUTH_CSS = `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #12100C;
      color: #EFE3C0;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      align-items: safe center;
      justify-content: center;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
    }

    /* ── Grain overlay ── */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      opacity: 0.08;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 256px 256px;
    }

    /* ── Double hairline frame ── */
    body::after {
      content: '';
      position: fixed;
      inset: 12px;
      border: 1px solid rgba(212, 168, 75, 0.2);
      box-shadow: inset 0 0 0 4px #12100C, inset 0 0 0 5px rgba(212, 168, 75, 0.12);
      pointer-events: none;
      z-index: 2;
    }

    .login-container {
      position: relative;
      z-index: 3;
      width: 100%;
      max-width: 380px;
      padding: 2rem;
      text-align: center;
    }

    .title-hebrew {
      font-family: 'Noto Serif Hebrew', serif;
      font-size: 3.5rem;
      font-weight: 700;
      color: #D4A84B;
      letter-spacing: 0.02em;
      line-height: 1.2;
      margin-bottom: 0.25rem;
    }

    /* The ת"ח ת"ח mark — a small signature under the wordmark on the sign-in
       page only (not invite/sign-in-link pages), not an explanation. */
    .title-mark {
      font-family: 'Noto Serif Hebrew', serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: rgba(212, 168, 75, 0.55);
      letter-spacing: 0.3em;
      margin-bottom: 0.6rem;
    }

    .title-english {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 1.1rem;
      font-weight: 400;
      color: rgba(239, 227, 192, 0.6);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      direction: ltr;
      margin-bottom: 2.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .password-input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(239, 227, 192, 0.06);
      border: 1px solid rgba(212, 168, 75, 0.25);
      border-radius: 6px;
      color: #EFE3C0;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      direction: ltr;
      text-align: left;
    }

    .password-input::placeholder {
      color: rgba(239, 227, 192, 0.3);
    }

    .password-input:focus {
      border-color: #D4A84B;
      box-shadow: 0 0 0 3px rgba(212, 168, 75, 0.12);
    }

    .login-btn {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #D4A84B;
      color: #12100C;
      border: none;
      border-radius: 6px;
      font-family: 'Frank Ruhl Libre', Georgia, serif;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease;
      letter-spacing: 0.04em;
    }

    .login-btn:hover {
      background: #e0b85e;
    }

    .login-btn:active {
      transform: scale(0.98);
    }

    .login-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .error-message {
      display: none;
      margin-top: 1rem;
      padding: 0.6rem 1rem;
      background: rgba(220, 60, 60, 0.12);
      border: 1px solid rgba(220, 60, 60, 0.3);
      border-radius: 6px;
      color: #e87070;
      font-size: 0.9rem;
      direction: ltr;
      text-align: center;
    }

    .error-message.visible {
      display: block;
    }

    .totp-hint {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 0.9rem;
      color: rgba(239, 227, 192, 0.7);
      margin-bottom: 1.25rem;
      line-height: 1.5;
    }

    .qr-wrap {
      background: #EFE3C0;
      padding: 1rem;
      border-radius: 8px;
      display: inline-block;
      margin-bottom: 1.25rem;
    }

    .qr-wrap img {
      display: block;
      width: 180px;
      height: 180px;
    }

    .totp-secret {
      font-family: monospace;
      font-size: 0.85rem;
      color: rgba(239, 227, 192, 0.55);
      word-break: break-all;
      margin-bottom: 1.25rem;
      direction: ltr;
    }

    .totp-input {
      letter-spacing: 0.3em;
      text-align: center;
      font-size: 1.3rem;
    }

    .hidden { display: none !important; }
    .who { font-family: 'EB Garamond', Georgia, serif; font-size: 1.15rem; color: rgba(239, 227, 192, 0.85); line-height: 1.5; margin-bottom: 1.25rem; direction: ltr; }
    .who b { color: #D4A84B; font-weight: 500; }
    .note { font-family: 'EB Garamond', Georgia, serif; font-size: 0.9rem; color: rgba(239, 227, 192, 0.55); line-height: 1.5; margin: 0 0 1.25rem; direction: ltr; }
    .link-btn { background: none; border: none; color: rgba(239, 227, 192, 0.7); font-family: 'EB Garamond', Georgia, serif; font-size: 0.95rem; text-decoration: underline; cursor: pointer; margin-top: 1rem; padding: 0.5rem; }
    .link-btn:hover { color: #D4A84B; }
    .plain-link { color: #D4A84B; }
`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** JSON that is safe inside a <script> block. */
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const HEAD = (title) => `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&family=Noto+Serif+Hebrew:wght@400;700&family=EB+Garamond:wght@400;500&display=swap" rel="stylesheet">
  <style>${AUTH_CSS}</style>
</head>
<body>
  <div class="login-container">
    <h1 class="title-hebrew">תחתך</h1>
`;

const TOTP_FORMS = `
    <form id="totpSetupForm" class="hidden" autocomplete="off">
      <p class="totp-hint">Scan this QR code with Google Authenticator, Authy, or any authenticator app, then enter the 6-digit code it shows to finish.</p>
      <div class="qr-wrap"><img id="qrImage" alt="QR code for your authenticator app"></div>
      <p class="totp-secret">Can't scan? Enter manually: <span id="totpSecretText"></span></p>
      <div class="form-group">
        <input type="text" id="totpSetupCode" class="password-input totp-input" placeholder="000000" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required>
      </div>
      <button type="submit" class="login-btn" id="totpSetupBtn">Turn on 2-step &amp; sign in</button>
    </form>

    <form id="totpForm" class="hidden" autocomplete="off">
      <p class="totp-hint">Enter the 6-digit code from your authenticator app.</p>
      <div class="form-group">
        <input type="text" id="totpCode" class="password-input totp-input" placeholder="000000" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required>
      </div>
      <button type="submit" class="login-btn" id="totpBtn">Verify</button>
    </form>

    <div class="error-message" id="errorMsg"></div>
  </div>
`;

/** Shared client code: error box, step switching, the two 2-step forms. No backslashes on purpose (template literal). */
const CLIENT_COMMON = `
    var NEXT_URL = (function () {
      var n = new URLSearchParams(window.location.search).get('next') || '';
      return /^[/]admin([/][a-z0-9-]+)?$/.test(n) ? n : '/admin';
    })();
    var $ = function (id) { return document.getElementById(id); };
    function getCookie(name) {
      var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return m ? decodeURIComponent(m[2]) : null;
    }
    function showError(msg) { var e = $('errorMsg'); e.textContent = msg; e.classList.add('visible'); }
    function hideError() { $('errorMsg').classList.remove('visible'); }
    function jsonHeaders() {
      var h = { 'Content-Type': 'application/json' };
      var c = getCookie('_csrf');
      if (c) h['X-CSRF-Token'] = c;
      return h;
    }
    function post(url, body) {
      return fetch(url, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body || {}) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); });
    }
    function showStep(step) {
      ['first', 'totpSetupForm', 'totpForm'].forEach(function (id) {
        var el = id === 'first' ? document.querySelector('[data-first]') : $(id);
        if (el) el.classList.toggle('hidden', (id === 'first' ? 'first' : id === 'totpSetupForm' ? 'setup' : 'totp') !== step);
      });
    }
    // Every first step ends here with the server's answer.
    function handle(r) {
      if (!r.ok) { showError(r.data.error || 'Something went wrong.'); return false; }
      var d = r.data;
      if (d.status === 'authenticated') { window.location.href = NEXT_URL; }
      else if (d.status === 'totp_setup_required') { $('qrImage').src = d.qrDataUrl; $('totpSecretText').textContent = d.secret; showStep('setup'); $('totpSetupCode').focus(); }
      else if (d.status === 'totp_required') { showStep('totp'); $('totpCode').focus(); }
      else { showError('Unexpected response from server.'); return false; }
      return true;
    }
    function codeForm(formId, inputId, btnId, url, label) {
      $(formId).addEventListener('submit', function (e) {
        e.preventDefault(); hideError();
        var code = $(inputId).value.trim();
        if (!/^[0-9]{6}$/.test(code)) { showError('Enter the 6-digit code from your authenticator app.'); return; }
        var btn = $(btnId); btn.disabled = true; btn.textContent = 'Verifying\\u2026';
        post(url, { code: code }).then(function (r) {
          if (r.ok && r.data.success) window.location.href = NEXT_URL; else showError(r.data.error || 'Invalid code.');
        }).catch(function () { showError('Network error. Please try again.'); })
          .then(function () { btn.disabled = false; btn.textContent = label; });
      });
    }
    codeForm('totpSetupForm', 'totpSetupCode', 'totpSetupBtn', '/login/totp-setup', 'Turn on 2-step & sign in');
    codeForm('totpForm', 'totpCode', 'totpBtn', '/login/totp', 'Verify');
`;

/** Wrap a first-step button: disables while the request runs, restores after unless we are leaving. */
const CLIENT_BUSY = `
    function busy(btn, text, run, label) {
      btn.disabled = true; btn.textContent = text; hideError();
      run().then(function (ok) { if (!ok) { btn.disabled = false; btn.textContent = label; } })
        .catch(function () { showError('Network error. Please try again.'); btn.disabled = false; btn.textContent = label; });
    }
`;

export function loginPage({ askUsername = false } = {}) {
  return `${HEAD('TachTach-Screens — Sign in')}
    <p class="title-mark">ת״ח ת״ח</p>
    <p class="title-english">Admin Access</p>

    <form id="passwordForm" data-first autocomplete="on">
      ${askUsername ? `<div class="form-group"><input type="text" id="username" class="password-input" placeholder="Username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></div>` : ''}
      <div class="form-group">
        <input type="password" id="password" class="password-input" placeholder="Password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="login-btn" id="passwordBtn">Sign In</button>
    </form>
${TOTP_FORMS}
  <script>${CLIENT_COMMON}${CLIENT_BUSY}
    var ASK_USERNAME = ${askUsername ? 'true' : 'false'};
    $('passwordForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var password = $('password').value;
      var username = ASK_USERNAME ? $('username').value.trim() : '';
      if (!password || (ASK_USERNAME && !username)) { showError(ASK_USERNAME ? 'Enter your username and password.' : 'Please enter a password.'); return; }
      busy($('passwordBtn'), 'Signing in\\u2026', function () {
        return post('/login', { username: username, password: password }).then(handle);
      }, 'Sign In');
    });
    (ASK_USERNAME ? $('username') : $('password')).focus();
  </script>
</body>
</html>`;
}

export function invitePage({ token, name, username, role }) {
  const isAdmin = role === 'admin';
  return `${HEAD('TachTach-Screens — Welcome')}
    <p class="title-english">Welcome</p>

    <form id="inviteForm" data-first autocomplete="off">
      <p class="who">Hi <b>${esc(name)}</b> — you've been invited as ${isAdmin ? 'an <b>Admin</b>' : 'an <b>Editor</b>'}.<br>Your username is <b>${esc(username)}</b>.</p>
      <div class="form-group"><input type="password" id="pw1" class="password-input" placeholder="Choose a password" autocomplete="new-password" required></div>
      <div class="form-group"><input type="password" id="pw2" class="password-input" placeholder="Type it again" autocomplete="new-password" required></div>
      <p class="note">At least 12 characters, with an uppercase letter, a lowercase letter and a number.${isAdmin ? ' Next you’ll set up a 6-digit code from an authenticator app.' : ''}</p>
      <button type="submit" class="login-btn" id="inviteBtn">Create my login</button>
      ${isAdmin ? '' : '<button type="button" class="link-btn" id="noPassword">Skip the password — I’ll use sign-in links</button>'}
    </form>
${TOTP_FORMS}
  <script>${CLIENT_COMMON}${CLIENT_BUSY}
    var INVITE = ${inlineJson({ token })};
    function accept(body, btn, text, label) {
      busy(btn, text, function () { return post('/invite/' + encodeURIComponent(INVITE.token), body).then(handle); }, label);
    }
    $('inviteForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = $('pw1').value, b = $('pw2').value;
      if (a !== b) { showError('The two passwords don’t match.'); return; }
      accept({ password: a }, $('inviteBtn'), 'Creating\\u2026', 'Create my login');
    });
    var np = $('noPassword');
    if (np) np.addEventListener('click', function () {
      if (!window.confirm('Without a password you will sign in with a link from your admin each time. Continue?')) return;
      accept({ passwordless: true }, $('inviteBtn'), 'Creating\\u2026', 'Create my login');
    });
    $('pw1').focus();
  </script>
</body>
</html>`;
}

export function signinPage({ token, name }) {
  return `${HEAD('TachTach-Screens — Sign in')}
    <p class="title-english">Sign-in link</p>

    <form id="linkForm" data-first autocomplete="off">
      <p class="who">Sign in as <b>${esc(name)}</b>?</p>
      <button type="submit" class="login-btn" id="linkBtn">Sign in</button>
    </form>
${TOTP_FORMS}
  <script>${CLIENT_COMMON}${CLIENT_BUSY}
    var LINK = ${inlineJson({ token })};
    $('linkForm').addEventListener('submit', function (e) {
      e.preventDefault();
      busy($('linkBtn'), 'Signing in\\u2026', function () {
        return post('/signin/' + encodeURIComponent(LINK.token), {}).then(handle);
      }, 'Sign in');
    });
  </script>
</body>
</html>`;
}

export function noticePage({ title, message }) {
  return `${HEAD('TachTach-Screens')}
    <p class="title-english">${esc(title)}</p>
    <p class="who">${esc(message)}</p>
    <a class="plain-link" href="/login">Go to sign in</a>
  </div>
</body>
</html>`;
}
