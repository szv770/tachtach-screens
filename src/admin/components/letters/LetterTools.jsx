import React, { useMemo, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { Btn, Row, ErrorLine, labelStyle, field } from '../quick/bits.jsx';
import PagePreview from './PagePreview.jsx';
import { copyText } from '../schedule/scheduleShared.jsx';
import { notify } from '../../hooks/useAdminState.js';
import { parseLetter, parseSicha, guessKind } from '../../../shared/letterParse.js';
import { buildLetterJsonPrompt, parseLetterJson, fieldsFromParsed } from '../../../shared/letterJson.js';
import { can } from '../../../shared/permissions.js';
import useOwnedList from '../../hooks/useOwnedList.js';

const CHECK = (ok, text) => (
  <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: 'var(--r-pill)', fontSize: '12.5px', fontWeight: 700, background: ok ? colors.successBg : colors.sunken, color: ok ? colors.success : colors.muted }}>
    {ok ? '✓' : '–'} {text}
  </span>
);

/**
 * Composer helpers for the Letter and Sicha layouts:
 *  - Paste the whole letter: the system splits it (no AI) into the fields below
 *  - From an AI chat: copy a prompt with the exact JSON, paste the JSON back, validate
 *  - Page-by-page preview, and Save to library
 * `kind` = 'letter' | 'sicha'. `content` = the item's content; `onFill({ letter|sicha })` writes fields.
 */
export default function LetterTools({ kind, content, look, settings, caps, onFill, onSwitchKind }) {
  const [mode, setMode] = useState('paste');
  const [raw, setRaw] = useState('');
  const [json, setJson] = useState('');
  const [found, setFound] = useState(null);
  const [result, setResult] = useState(null); // { ok, errors, warnings }
  const [saveMsg, setSaveMsg] = useState('');
  const [shared, setShared] = useState(false);
  const library = useOwnedList('/api/saved-letters', 'letters', { enabled: false });
  const body = content?.[kind]?.body || '';

  const split = () => {
    const guessed = guessKind(raw);
    const parsed = kind === 'letter' ? parseLetter(raw) : parseSicha(raw);
    onFill(fieldsFromParsed(kind, parsed));
    setFound({ ...parsed.found, hint: guessed !== kind && (kind === 'sicha' ? parsed.found.title === false : true) ? guessed : null });
  };

  const check = () => {
    const r = parseLetterJson(json, kind);
    setResult(r);
    if (r.ok) {
      if (r.kind !== kind) onSwitchKind?.(r.kind);
      onFill(r.fields);
    }
  };

  const copyPrompt = async () => {
    const ok = await copyText(buildLetterJsonPrompt(kind));
    notify(ok ? 'Prompt copied. Paste it into Claude or ChatGPT, then paste the letter after it.' : 'Could not copy. Select the text and copy it yourself.', ok ? 'success' : 'error');
  };

  const previewItem = useMemo(() => ({ content, look: { layout: kind, style: look?.style || null, fit: 'auto' } }), [content, kind, look?.style]);

  const save = async () => {
    setSaveMsg('');
    const rec = await library.create({ kind, [kind]: content[kind], style: look?.style || null }, { shared });
    if (rec) { setSaveMsg(''); notify(`Saved to the ${shared ? 'shared ' : ''}library`); } else setSaveMsg(library.error || 'Could not save.');
  };

  return (
    <div data-testid="letter-tools" style={{ display: 'grid', gap: '10px', marginBottom: '14px', fontFamily: adminFonts.englishBody }}>
      <Collapsible id="letter-import" title={`Fill in from a whole ${kind}`} summary="Paste it and we split it for you, or use an AI chat">
        <div style={{ marginTop: '12px' }}>
          <SegmentedControl ariaLabel="How to fill in" fill options={[{ value: 'paste', label: 'Paste the whole text' }, { value: 'ai', label: 'From an AI chat' }]} value={mode} onChange={setMode} />
        </div>
        {mode === 'paste' ? (
          <div style={{ marginTop: '12px' }}>
            <label htmlFor="lt-raw" style={labelStyle}>Paste the whole {kind} here</label>
            <textarea id="lt-raw" rows={7} dir="auto" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Date, greeting, paragraphs, closing, source: paste it all as it is." style={{ ...field, resize: 'vertical' }} />
            <Row style={{ marginTop: '10px' }}>
              <Btn primary onClick={split} disabled={!raw.trim()} data-testid="lt-split">Split it into pieces</Btn>
            </Row>
            {found && (
              <div data-testid="lt-found" style={{ marginTop: '12px' }}>
                <Row>{kind === 'letter'
                  ? [CHECK(found.date, 'Date'), CHECK(found.salutation, 'Greeting'), CHECK(found.signature, 'Closing'), CHECK(found.source, 'Source')]
                  : [CHECK(found.title, 'Title'), CHECK(found.source, 'Source')]}</Row>
                <p style={{ fontSize: '13px', color: colors.dim, margin: '8px 0 0', lineHeight: 1.45 }}>
                  The pieces are filled in below. Check them, and fix anything that landed in the wrong box: nothing was thrown away.
                </p>
                {found.hint && onSwitchKind && (
                  <Btn onClick={() => { const h = found.hint; onFill(fieldsFromParsed(h, h === 'letter' ? parseLetter(raw) : parseSicha(raw))); onSwitchKind(h); }} style={{ marginTop: '8px', minHeight: '44px' }}>This looks like a {found.hint}: switch to {found.hint}</Btn>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: '12px' }}>
            <ol style={{ margin: '0 0 12px', paddingLeft: '20px', fontSize: '14px', color: colors.dim, lineHeight: 1.55 }}>
              <li>Copy the prompt.</li>
              <li>Paste it into Claude or ChatGPT, then paste the whole {kind} after it.</li>
              <li>Paste the answer (JSON) here.</li>
            </ol>
            <Btn onClick={copyPrompt} data-testid="lt-copy-prompt">Copy AI prompt</Btn>
            <label htmlFor="lt-json" style={{ ...labelStyle, marginTop: '14px' }}>The JSON it gave back</label>
            <textarea id="lt-json" rows={8} spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setResult(null); }} placeholder='{ "kind": "letter", ... }' style={{ ...field, resize: 'vertical', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '13px' }} />
            <Row style={{ marginTop: '10px' }}><Btn primary onClick={check} disabled={!json.trim()} data-testid="lt-check">Check and fill in</Btn></Row>
            {result && !result.ok && (
              <ul data-testid="lt-errors" role="alert" style={{ margin: '12px 0 0', padding: '10px 12px 10px 28px', background: colors.dangerBg, color: colors.danger, borderRadius: 'var(--r-md)', fontSize: '13.5px', lineHeight: 1.5 }}>
                {result.errors.map((e, i) => <li key={i}>{e.line ? <strong>Line {e.line}: </strong> : null}{e.message}</li>)}
              </ul>
            )}
            {result?.ok && <p data-testid="lt-ok" style={{ margin: '12px 0 0', color: colors.success, fontSize: '14px', fontWeight: 700 }}>Looks good. The pieces are filled in below.</p>}
            {result?.warnings?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: '20px', fontSize: '13px', color: colors.dim, lineHeight: 1.5 }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            )}
          </div>
        )}
      </Collapsible>

      <Collapsible id="letter-pages" title="Preview the pages" summary={body.trim() ? 'See each page as the screen will show it' : 'Fill in the text first'}>
        <div style={{ marginTop: '12px' }}>{body.trim() ? <PagePreview item={previewItem} settings={settings} /> : <p style={{ fontSize: '14px', color: colors.dim, margin: 0 }}>Nothing to preview yet.</p>}</div>
      </Collapsible>

      {can(caps, 'announcements.post') && (
        <Collapsible id="letter-save" title="Save to library" summary="Keep it to post again later">
          <div style={{ marginTop: '12px' }}>
            {can(caps, 'announcements.edit') && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', fontSize: '15px', color: colors.text }}>
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ width: 22, height: 22 }} />
                Share with everyone (otherwise only you see it)
              </label>
            )}
            <Btn onClick={save} disabled={!body.trim()} data-testid="lt-save" style={{ marginTop: '8px' }}>Save to library</Btn>
            <ErrorLine>{saveMsg}</ErrorLine>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
