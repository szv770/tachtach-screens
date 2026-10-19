import React, { useState } from 'react';
import { colors, adminFonts, buttonSecondary } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { Page, Hint, LinkButton, getCsrfToken } from './kit.jsx';

/** Trusted devices: forget the 30-day "remember this device" for YOUR sign-ins. */
export default function SecurityPage({ onNavigate }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const forget = async () => {
    if (!window.confirm('Forget your trusted devices? Every device you have signed in on, including this one, will ask for your password and 2-step code on its next sign-in. Other people\'s logins are not affected.')) return;
    setRunning(true); setResult(null);
    try {
      const res = await fetch('/api/security/forget-devices', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setResult({ error: b.error || `Failed (${res.status})` }); }
      else { setResult({ success: true }); notify('Trusted devices forgotten'); }
    } catch { setResult({ error: 'Connection error' }); } finally { setRunning(false); }
  };
  return (
    <Page intro="Sign-in safety for your own login.">
      <Collapsible id="set-security" title="Trusted devices" icon="user" summary="Devices that skip the 2-step code for 30 days">
        <Hint style={{ marginTop: '12px' }}>
          This is for your own sign-ins only; other people on the Team are not affected (they can do the same under My account).
          Devices where you entered your 2-step code are remembered for 30 days and skip straight to the password.
          If one of yours is lost or stolen, forget them all: every device you use, including this one, will need your password and code again next time.
        </Hint>
        <button type="button" onClick={forget} disabled={running} style={{ ...buttonSecondary, minHeight: '44px', marginTop: '14px', padding: '0 20px', opacity: running ? 0.6 : 1, cursor: running ? 'wait' : 'pointer' }}>
          {running ? 'Forgetting...' : 'Forget my trusted devices'}
        </button>
        {result?.success && <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.success, marginTop: '10px' }}>Done. Each of your devices will ask for your password and 2-step code on its next sign-in.</p>}
        {result?.error && <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.danger, marginTop: '10px' }}>{result.error}</p>}
      </Collapsible>
      <Hint>Your password, 2-step code and phone alerts are under <LinkButton onClick={() => onNavigate?.('account')}>My account</LinkButton>.</Hint>
    </Page>
  );
}
