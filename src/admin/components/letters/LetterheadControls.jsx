import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { HEAD_PRESETS, sanitizeLetterLook } from '../../../shared/letterhead.js';

/**
 * Letter layout > "Page": the plain text page, or the typed Letterhead sheet (src/shared/letterhead.js).
 * Everything here is per letter: which sender's letterhead, typewriter or clean serif, the greeting line,
 * the signature, who it was sent to, and the optional mailing address + postmark at the bottom.
 * `ui` carries the composer's own small controls so the look stays identical.
 */
const HEAD_LABELS = { rebbe: 'The Rebbe', rayatz: 'Frierdiker Rebbe', custom: 'My own', none: 'None' };
const note = { fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.muted, margin: '4px 0 0' };

export default function LetterheadControls({ look, c, set, ui, isMobile }) {
  const { Field, Chip, Segmented, TextInput, TextArea } = ui;
  const lk = sanitizeLetterLook(look);
  const letter = c || {};
  const on = lk.paper === 'letterhead';
  const setLk = (k, v) => set('look.letter', { ...lk, [k]: v });
  const preset = HEAD_PRESETS[lk.head] || HEAD_PRESETS.none;
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 12px' };

  return (
    <div style={{ margin: '4px 0 14px', padding: '12px', border: `1px solid ${colors.border}`, borderRadius: '10px' }}>
      <Field title="Page">
        <Segmented
          ariaLabel="Letter page style"
          options={[{ value: 'letterhead', label: 'Letterhead (typed sheet)' }, { value: 'plain', label: 'Plain page' }]}
          value={lk.paper}
          onChange={(v) => setLk('paper', v)}
        />
        <p style={note}>
          {on
            ? 'A sheet of paper: letterhead on top, who it was sent to, then the letter typed out line by line with a signature. A long letter shows its next lines on a new page (never scrolls).'
            : 'The simple text page.'}
        </p>
      </Field>
      {on && (
        <>
          <Field title="Letterhead">
            <Segmented ariaLabel="Letterhead" options={Object.keys(HEAD_LABELS).map((v) => ({ value: v, label: HEAD_LABELS[v] }))} value={lk.head} onChange={(v) => setLk('head', v)} />
            {lk.head === 'rayatz' && <p style={note}>The Frierdiker Rebbe&rsquo;s letterhead as typed here is a best guess. Pick &ldquo;My own&rdquo; to type the exact lines of your letter.</p>}
          </Field>
          {lk.head === 'custom' && (
            <div style={grid}>
              <Field title="Letterhead, English (first line is the name)">
                <TextArea value={letter.headEn || ''} onChange={(v) => set('content.letter.headEn', v)} rows={4} ariaLabel="Letterhead English" placeholder={'RABBI NAME\nLubavitch\n770 Eastern Parkway\nBrooklyn, N.Y.'} />
              </Field>
              <Field title="Letterhead, Hebrew (optional)">
                <TextArea rtl value={letter.headHe || ''} onChange={(v) => set('content.letter.headHe', v)} rows={4} ariaLabel="Letterhead Hebrew" />
              </Field>
            </div>
          )}
          <Field title="Letter text">
            <Segmented ariaLabel="Letter text face" options={[{ value: 'typed', label: 'Typewriter' }, { value: 'serif', label: 'Clean serif' }]} value={lk.body} onChange={(v) => setLk('body', v)} />
            <p style={note}>Hebrew letters always use the Torah-text serif.</p>
          </Field>
          <Field title="Sent to (one line each, optional)">
            <TextArea value={letter.to || ''} onChange={(v) => set('content.letter.to', v)} rows={3} rtl={/[֐-׿]/.test(letter.to || '')} ariaLabel="Sent to" placeholder={'To the Students of\nThe Landau Yeshiva\nMiami Beach, Fla.'} />
          </Field>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            <Chip active={lk.grace} onClick={() => setLk('grace', !lk.grace)}>{lk.grace ? '✓ ' : ''}&ldquo;By the Grace of G-d&rdquo; line</Chip>
            {preset.signature && <Chip active={lk.signature} onClick={() => setLk('signature', !lk.signature)}>{lk.signature ? '✓ ' : ''}Signature</Chip>}
            <Chip active={lk.mailed} onClick={() => setLk('mailed', !lk.mailed)}>{lk.mailed ? '✓ ' : ''}Mailing address</Chip>
            <Chip active={lk.stamp} onClick={() => setLk('stamp', !lk.stamp)}>{lk.stamp ? '✓ ' : ''}Postmark</Chip>
          </div>
          <div style={grid}>
            {lk.grace && (
              <Field title="Top line (leave empty for the usual)">
                <TextInput rtl={/[֐-׿]/.test(letter.grace || '')} value={letter.grace || ''} onChange={(v) => set('content.letter.grace', v)} ariaLabel="Top line" placeholder="By the Grace of G-d" />
              </Field>
            )}
            {lk.mailed && (
              <Field title="Mailing address (bottom of the letter)">
                <TextArea value={letter.mailed || ''} onChange={(v) => set('content.letter.mailed', v)} rows={4} ariaLabel="Mailing address" placeholder={'Fifth Grade Students\nLandau Yeshiva\n1140 Alton Road\nMiami Beach, Fla. 33139'} />
              </Field>
            )}
            {lk.stamp && (
              <Field title="Postmark (place, then date, on two lines)">
                <TextArea value={letter.postmark || ''} onChange={(v) => set('content.letter.postmark', v)} rows={2} ariaLabel="Postmark" placeholder={`${preset.city || 'BROOKLYN, N.Y.'}\n1 NOV 1977`} />
              </Field>
            )}
          </div>
        </>
      )}
    </div>
  );
}
