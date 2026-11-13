import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { Field, Chip, Segmented, TextInput, TextArea } from '../announcements/AnnouncementComposer.jsx';
import StylePicker from '../announcements/StylePicker.jsx';
import LetterheadControls from './LetterheadControls.jsx';
import PagePreview from './PagePreview.jsx';
import { NEW_LETTER_LOOK, MAX_LETTER_BODY, letterEntryItem } from '../../../shared/letterhead.js';
import useIsMobile from '../../hooks/useIsMobile.js';

const isHeb = (v) => /[֐-׿]/.test(String(v || ''));

/**
 * One letter, edited anywhere (Daily Story entries, the saved-letters library). The same fields and the same
 * Letterhead controls as the composer, plus a page-by-page preview drawn by the real kiosk stage.
 *   value    { title, letter: {date, dateHe, salutation, body, signature, source, sourceHe, to, mailed, postmark, headEn, headHe, grace}, paper, style }
 *   onChange (next value)
 */
export default function LetterEditor({ value, onChange, settings = {}, showTitle = true }) {
  const isMobile = useIsMobile();
  const v = value || {};
  const letter = v.letter || {};
  const paper = v.paper || { ...NEW_LETTER_LOOK };
  const set = (path, val) => {
    const next = { ...v, letter: { ...letter }, paper: { ...paper } };
    const [a, b] = path.split('.');
    if (b === undefined) next[a] = val; else next[a] = { ...(next[a] || {}), [b]: val };
    onChange(next);
  };
  // LetterheadControls speaks in composer paths (content.letter.X / look.letter): translate them
  const setComposerPath = (path, val) => {
    if (path === 'look.letter') set('paper', val);
    else if (path.startsWith('content.letter.')) set(`letter.${path.slice('content.letter.'.length)}`, val);
  };
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 12px' };
  const ui = { Field, Chip, Segmented, TextInput, TextArea };
  const previewItem = letterEntryItem({ id: 'editor', letter, paper, style: v.style });

  return (
    <div data-testid="letter-editor" style={{ fontFamily: adminFonts.englishBody }}>
      {showTitle && (
        <Field title="Name in the list (optional)">
          <TextInput value={v.title || ''} onChange={(x) => set('title', x)} ariaLabel="Letter name" placeholder="Letter to the 5th grade, Cheshvan 5738" />
        </Field>
      )}
      <LetterheadControls look={paper} c={letter} set={setComposerPath} ui={ui} isMobile={isMobile} />
      <div style={grid}>
        <Field title="Date (English, optional)"><TextInput value={letter.date || ''} onChange={(x) => set('letter.date', x)} ariaLabel="Letter date" placeholder="In the Beginning of Cheshvan, 5738. Brooklyn, N.Y." /></Field>
        <Field title="Date (Hebrew, optional)"><TextInput rtl value={letter.dateHe || ''} onChange={(x) => set('letter.dateHe', x)} ariaLabel="Letter date in Hebrew" /></Field>
        <Field title="Greeting"><TextInput rtl={isHeb(letter.salutation)} value={letter.salutation || ''} onChange={(x) => set('letter.salutation', x)} ariaLabel="Greeting" placeholder="Greeting and Blessing:" /></Field>
        <Field title="Closing (optional)"><TextInput rtl={isHeb(letter.signature)} value={letter.signature || ''} onChange={(x) => set('letter.signature', x)} ariaLabel="Closing" placeholder="With esteem" /></Field>
      </div>
      <Field title="Letter text (a blank line starts a new paragraph)">
        <TextArea value={letter.body || ''} onChange={(x) => set('letter.body', x)} rows={9} rtl={isHeb(letter.body)} ariaLabel="Letter text" />
        <span style={{ display: 'block', textAlign: 'right', fontSize: '12px', marginTop: '2px', color: String(letter.body || '').length > MAX_LETTER_BODY ? colors.danger : colors.dim }}>
          {String(letter.body || '').length.toLocaleString()} / {MAX_LETTER_BODY.toLocaleString()} characters{String(letter.body || '').length > MAX_LETTER_BODY ? ': too long, split it into two letters' : ''}
        </span>
      </Field>
      <div style={grid}>
        <Field title="Source (English, optional)"><TextInput value={letter.source || ''} onChange={(x) => set('letter.source', x)} ariaLabel="Letter source" placeholder="Igros Kodesh vol. 12" /></Field>
        <Field title="Source (Hebrew, optional)"><TextInput rtl value={letter.sourceHe || ''} onChange={(x) => set('letter.sourceHe', x)} ariaLabel="Letter source in Hebrew" /></Field>
      </div>
      <div style={{ margin: '4px 0 12px' }}>
        <span style={{ display: 'block', fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>Background colours (the style's artwork is not drawn behind a letterhead sheet)</span>
        <StylePicker value={v.style || ''} onChange={(s) => set('style', s || null)} item={previewItem} layout="letter" settings={settings} />
      </div>
      <PagePreview item={previewItem} settings={settings} />
    </div>
  );
}
