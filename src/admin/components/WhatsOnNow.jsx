import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../styles/admin-tokens.js';
import { selectActive, primaryText } from '../../shared/announcements.js';
import { whenLabel, historyText } from '../../shared/postDefaults.js';
import { whatIsOnNow, postEffectLine } from '../../shared/whatsOnNow.js';

const line = { fontFamily: adminFonts.englishBody, fontSize: '13.5px', color: colors.dim, lineHeight: 1.45, margin: '4px 0' };

/**
 * Read-only "what's on the TV right now" (spec 01 section 3.2 C), built from the posts the admin already has, plus a
 * one-line "if you post this" effect for the draft. Text of a post is cut to 40 characters (it can name a student).
 */
export default function WhatsOnNow({ announcements = [], freeze = null, slides = [], settings = {}, display = 'slide', draft = null, now = new Date() }) {
  const tz = settings?.location?.timezone;
  const [open, setOpen] = useState(false);
  const sel = useMemo(() => selectActive(announcements, now, { tz }), [announcements, now, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = useMemo(() => whatIsOnNow({ active: sel, freeze, slides }), [sel, freeze, slides]);
  const until = (i) => (i.when?.expiresAt ? ` until ${whenLabel(Date.parse(i.when.expiresAt), { tz, now })}` : '');
  const effect = postEffectLine({ display, info, draftEndsAt: draft?.when?.expiresAt || null, tz, now, whenLabel });
  return (
    <div data-testid="whats-on-now" style={{ marginTop: '16px', border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', background: colors.sunken }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{
        width: '100%', minHeight: '48px', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', cursor: 'pointer',
        background: 'transparent', border: 'none', color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 700, textAlign: 'left',
      }}>
        <span>On the screen now <span style={{ color: colors.dim, fontWeight: 500 }}>· {info.summary}</span></span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      <div style={{ padding: '0 14px 12px' }}>
        {draft && <p style={{ ...line, color: colors.text }} data-testid="post-effect">{effect}</p>}
        {open && (
          <div data-testid="whats-on-body">
            {info.frozen && <p style={{ ...line, color: colors.danger }}>The screen is frozen{freeze?.active?.until ? ` until ${whenLabel(Date.parse(freeze.active.until), { tz, now })}` : ''}. Posts wait behind it.</p>}
            {sel.takeover ? <p style={{ ...line, color: colors.accent }}>Takeover: {historyText(primaryText(sel.takeover)) || 'a message'}{until(sel.takeover)}. Everything else is paused.</p> : <p style={line}>Nothing is taking over.</p>}
            {sel.banners.map((b) => <p key={b.id} style={line}>Banner: {historyText(primaryText(b)) || 'a message'}{until(b)}</p>)}
            {sel.notes.map((b) => <p key={b.id} style={line}>Side note: {historyText(primaryText(b)) || 'a message'}{until(b)}</p>)}
            {sel.slides.map((b) => <p key={b.id} style={line}>Slide: {historyText(primaryText(b)) || 'a message'}{until(b)}</p>)}
            <p style={line}>{info.rotating ? `${info.rotating} slide${info.rotating === 1 ? '' : 's'} in the rotation (some may hide at certain times).` : 'The rotation list is not loaded.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
