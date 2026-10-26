import React, { useState } from 'react';
import { colors, adminFonts, buttonSecondary } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import { notify } from '../../hooks/useAdminState.js';
import useSystemInfo from '../../hooks/useSystemInfo.js';
import { oneLine } from '../../../shared/systemInfoUi.js';
import { Page, Field, Hint, useSettingsForm, fieldStyle, getCsrfToken } from './kit.jsx';

/** The screen's name (sidebar + Home) and the storage clean-up. */
export default function ThisScreenPage({ settings = {}, onSave, me }) {
  const sys = useSystemInfo(!!me && me.role === 'admin');
  const form = useSettingsForm(settings, ['siteName'], onSave, 'This screen');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const name = form.values.siteName || '';

  const cleanup = async () => {
    setRunning(true); setResult(null);
    try {
      const res = await fetch('/api/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setResult({ error: b.error || `Failed (${res.status})` }); }
      else {
        const data = await res.json();
        setResult(data);
        notify(data.deletedFiles?.length ? `Removed ${data.deletedFiles.length} file(s)` : 'Nothing to clean up');
      }
    } catch { setResult({ error: 'Connection error' }); } finally { setRunning(false); }
  };
  const freedMB = result?.freedBytes ? (result.freedBytes / (1024 * 1024)).toFixed(2) : null;

  return (
    <Page intro={sys ? `This server: ${oneLine(sys)}` : 'About this screen setup.'}>
      <Collapsible id="look-site-name" title="Screen name" icon="screen" edited={form.count > 0} summary={name ? name : 'Not set - shows "My screen"'}>
        <Field label="Name" htmlFor="tt-site-name" hint="Name this screen or server, for example Library TV or Back-room PC. Shown at the top of the sidebar and on Home; it is not shown on the TV.">
          <input id="tt-site-name" style={fieldStyle} maxLength={60} placeholder="Library TV" value={name} onChange={(e) => form.set('siteName', e.target.value)} />
        </Field>
      </Collapsible>

      <Collapsible id="set-storage" title="Storage" icon="list" summary="Clean up old uploads and caches">
        <Hint style={{ marginTop: '12px' }}>Removes orphaned uploads, stale Google Photos caches, old backups and temp files. It also runs by itself once a day. Files less than 24 hours old are kept.</Hint>
        <button type="button" onClick={cleanup} disabled={running} style={{ ...buttonSecondary, minHeight: '44px', marginTop: '14px', padding: '0 20px', opacity: running ? 0.6 : 1, cursor: running ? 'wait' : 'pointer' }}>
          {running ? 'Cleaning...' : 'Clean up storage'}
        </button>
        {result && !result.error && (
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.success, marginTop: '10px' }}>
            {result.deletedFiles?.length ? `Removed ${result.deletedFiles.length} file(s), freed ${freedMB} MB.` : 'No orphaned files found.'}
          </p>
        )}
        {result?.error && <p style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.danger, marginTop: '10px' }}>{result.error}</p>}
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}
