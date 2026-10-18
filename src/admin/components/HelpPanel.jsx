/**
 * Admin → Help: a get-started checklist, what the screen shows, the four ways to
 * post, and plain answers to common questions. Content: src/admin/help/helpContent.js.
 * Checklist ticks are remembered per browser (they are only a memory aid).
 */
import React, { useState } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { ToggleSwitch } from './ui.jsx';
import { SCREEN_PARTS, GLOSSARY, START_STEPS, TOPICS } from '../help/helpContent.js';

const DONE_KEY = 'tachtach-help-done';
const card = { background: colors.panel, border: `1px solid ${colors.muted}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' };
const h3 = { fontFamily: adminFonts.englishBody, fontSize: '18px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' };
const body = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.55, margin: 0 };

function loadDone() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch { return {}; }
}

export default function HelpPanel({ onNavigate, onTour }) {
  const [done, setDone] = useState(loadDone);
  const [open, setOpen] = useState(null);
  const toggle = (id) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem(DONE_KEY, JSON.stringify(next)); } catch { /* private mode: fine */ }
  };
  const finished = START_STEPS.filter((s) => done[s.id]).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 6px' }}>Help</h2>
          <p style={{ ...body, maxWidth: '620px' }}>New here? Take the one-minute tour, then work down the checklist. Everything you change appears on the TV within a second or two, and you can always undo it.</p>
        </div>
        <button style={{ ...buttonPrimary, minHeight: '44px' }} onClick={onTour}>Take the 1-minute tour</button>
      </div>

      <div style={card}>
        <h3 style={h3}>Get started <span style={{ ...body, fontSize: '13px' }}>· {finished} of {START_STEPS.length} done</span></h3>
        {START_STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 0', borderTop: i ? `1px solid ${colors.muted}` : 'none' }}>
            <div style={{ paddingTop: '2px' }}><ToggleSwitch on={!!done[s.id]} onChange={() => toggle(s.id)} label={`Mark "${s.title}" as done`} /></div>
            <div style={{ flex: 1, minWidth: 0, opacity: done[s.id] ? 0.6 : 1 }}>
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text }}>{i + 1}. {s.title}</div>
              <p style={body}>{s.text}</p>
            </div>
            <button style={{ ...buttonSecondary, minHeight: '36px', whiteSpace: 'nowrap' }} onClick={() => onNavigate(s.go)}>{s.goLabel || 'Open'}</button>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={h3}>What is on the TV</h3>
        {SCREEN_PARTS.map((p) => (
          <p key={p.name} style={{ ...body, margin: '0 0 8px' }}><b style={{ color: colors.text, fontWeight: 600 }}>{p.name}.</b> {p.text}</p>
        ))}
      </div>

      <div style={card}>
        <h3 style={h3}>Four ways to post a message</h3>
        {GLOSSARY.map((g) => (
          <p key={g.term} style={{ ...body, margin: '0 0 8px' }}><b style={{ color: colors.text, fontWeight: 600 }}>{g.term}.</b> {g.text}</p>
        ))}
        <button style={{ ...buttonSecondary, minHeight: '36px', marginTop: '6px' }} onClick={() => onNavigate('announcements')}>Open Announcements</button>
      </div>

      <div style={card}>
        <h3 style={h3}>Common questions</h3>
        {TOPICS.map((t, i) => {
          const isOpen = open === t.id;
          return (
            <div key={t.id} style={{ borderTop: i ? `1px solid ${colors.muted}` : 'none' }}>
              <button onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 0', minHeight: '44px', display: 'flex', justifyContent: 'space-between', gap: '10px', fontFamily: adminFonts.englishBody, fontSize: '15px', color: isOpen ? colors.gold : colors.text }}>
                <span>{t.title}</span><span aria-hidden>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 0 12px' }}>
                  <ol style={{ ...body, margin: '0 0 10px', paddingLeft: '20px' }}>{t.body.map((line, k) => <li key={k} style={{ marginBottom: '4px' }}>{line}</li>)}</ol>
                  <button style={{ ...buttonSecondary, minHeight: '34px' }} onClick={() => onNavigate(t.go)}>Take me there</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
