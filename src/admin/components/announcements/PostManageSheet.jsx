import React, { useMemo, useRef, useState } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';
import useDirtyForm from '../ui/useDirtyForm.js';
import { isAnyDirty } from '../ui/dirty.js';
import { ToggleSwitch } from '../ui.jsx';
import { can } from '../../../shared/permissions.js';
import { primaryText, recurrenceLabel } from '../../../shared/announcements.js';
import { postStatus, kindOf, rotationEntries, placeOf, placePost, whereLabel } from '../../../shared/postList.js';
import { slideTitle } from '../slides/slideTypes.js';
import AnnouncementPreview from './AnnouncementPreview.jsx';
import { PostStatusChip, KindBadge } from './PostBits.jsx';
import { DAY_CHIPS, isoToLocalInput, localInputToIso } from './helpers.js';
import { initialValues, buildPatch, hasAdvancedRepeat, endChoices, FormError, SECONDS_MIN, SECONDS_MAX } from './postForm.js';

const label = { display: 'block', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700, color: colors.dim, margin: '14px 0 6px' };
const hint = { fontFamily: adminFonts.englishBody, fontSize: '12.5px', color: colors.muted, margin: '4px 0 0', lineHeight: 1.45 };
const chip = (on) => ({
  minHeight: '44px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600,
  border: `1.5px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : colors.card, color: on ? colors.accent : colors.text,
});
const btn = (kind = 'plain') => ({
  minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 700,
  border: kind === 'primary' ? 'none' : `1.5px solid ${kind === 'danger' ? colors.danger : colors.line}`,
  background: kind === 'primary' ? colors.accent : colors.card, color: kind === 'primary' ? '#fff' : kind === 'danger' ? colors.danger : colors.text,
});
const box = { border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', padding: '4px 14px 14px', marginTop: '12px', background: colors.card };

function Body({ item, settings, slides, announcements, caps, onClose, onUpdate, onUpdateSlides, onOpenComposer, onDuplicate, onReactivate, onDelete }) {
  const tz = settings?.location?.timezone || undefined;
  const now = new Date();
  const kind = kindOf(item);
  const canEdit = can(caps, 'announcements.edit');
  const canDelete = can(caps, 'announcements.delete');
  const canPlace = kind === 'slide' && can(caps, 'slides.edit');
  const itemRef = useRef(item);
  itemRef.current = item;
  const [preview, setPreview] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [startAt, setStartAt] = useState(!!item.when?.startsAt);
  const [endAt, setEndAt] = useState(false);

  const form = useDirtyForm(initialValues(item), {
    label: 'this post',
    onSave: async (values, changed) => {
      let built;
      try { built = buildPatch(values, changed, itemRef.current); } catch (e) { if (e instanceof FormError) throw e; throw new FormError('Could not save that.'); }
      let ok = true;
      if (built.patch) ok = !!(await onUpdate(itemRef.current.id, built.patch, 'Saved'));
      if (ok && built.place) {
        const rows = placePost(slides, announcements, itemRef.current.id, built.place);
        if (rows) ok = (await onUpdateSlides(rows)) !== false;
      }
      if (ok) onClose(true);
      return ok;
    },
  });
  const v = form.values;
  const st = postStatus(item, now, { tz });
  const entries = useMemo(() => (kind === 'slide' ? rotationEntries(slides, announcements) : []), [kind, slides, announcements]);
  const annById = useMemo(() => new Map(announcements.map((a) => [a.id, a])), [announcements]);
  const where = kind === 'slide' ? placeOf(slides, announcements, item.id) : null;
  const entryTitle = (e) => (e.row ? slideTitle(e.row, { announcementsById: annById }) : String(primaryText(e.item) || 'Message').split('\n')[0]);
  const advancedRepeat = hasAdvancedRepeat(item);
  const ro = !canEdit;

  return (
    <div data-testid="post-manage" style={{ fontFamily: adminFonts.englishBody }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        <PostStatusChip status={st} />
        <KindBadge item={item} />
      </div>
      {st.detail && <p style={hint}>{st.detail}</p>}
      {item.createdBy && <p style={hint}>Posted by {item.createdBy}{item.updatedBy && item.updatedBy !== item.createdBy ? ` · edited by ${item.updatedBy}` : ''}</p>}
      {ro && <p role="note" style={{ ...hint, color: colors.warn }}>You can look, but changing posts needs “Edit existing announcements”. Ask an admin.</p>}

      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text }}>{v.enabled ? 'On' : 'Off (paused)'}</div>
          <div style={{ fontSize: '12.5px', color: colors.dim }}>{v.enabled ? 'Shows whenever its time comes.' : 'Kept here, not on the screen. Turn it on any time.'}</div>
        </div>
        {!ro && <ToggleSwitch on={!!v.enabled} label={`This post is ${v.enabled ? 'on, tap to turn it off' : 'off, tap to turn it on'}`} onChange={() => form.set('enabled', !v.enabled)} />}
      </div>

      {(kind === 'slide' || kind === 'hold') && (
        <div style={box}>
          {kind === 'slide' && (
            <>
              <span style={label}>Seconds on screen each time</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <input type="text" inputMode="numeric" aria-label="Seconds on screen" disabled={ro} value={v.duration}
                  onChange={(e) => form.set('duration', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  style={{ ...inputStyle, width: '76px', minHeight: '44px', textAlign: 'center' }} />
                {[8, 12, 20, 30].map((n) => (
                  <button key={n} type="button" disabled={ro} aria-pressed={String(n) === v.duration} onClick={() => form.set('duration', String(n))} style={chip(String(n) === v.duration)}>{n} s</button>
                ))}
              </div>
              <p style={hint}>From {SECONDS_MIN} to {SECONDS_MAX}. Long letters and sichos ask for more time by themselves.</p>
            </>
          )}
          <span style={label}>Small tag on the slide (optional)</span>
          <input type="text" aria-label="Small tag on the slide" disabled={ro} value={v.label} maxLength={60} placeholder="הודעה" dir="auto"
            onChange={(e) => form.set('label', e.target.value)} style={{ ...inputStyle, width: '100%', minHeight: '44px', boxSizing: 'border-box' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', marginTop: '8px', fontSize: '14px', color: colors.text, cursor: ro ? 'default' : 'pointer' }}>
            <input type="checkbox" disabled={ro} checked={!!v.fullscreen} onChange={(e) => form.set('fullscreen', e.target.checked)} style={{ width: 22, height: 22 }} />
            Full screen (hide the side column while it shows)
          </label>
        </div>
      )}

      <div style={box}>
        <span style={label}>Starts</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button type="button" disabled={ro} aria-pressed={!startAt} onClick={() => { setStartAt(false); form.set('startsAt', null); }} style={chip(!startAt)}>Now</button>
          <button type="button" disabled={ro} aria-pressed={startAt} onClick={() => { setStartAt(true); if (!v.startsAt) form.set('startsAt', new Date(Date.now() + 3600000).toISOString()); }} style={chip(startAt)}>At a date and time…</button>
        </div>
        {startAt && (
          <input type="datetime-local" aria-label="Start date and time" disabled={ro} value={isoToLocalInput(v.startsAt)} onChange={(e) => form.set('startsAt', localInputToIso(e.target.value))}
            style={{ ...inputStyle, minHeight: '44px', marginTop: '8px', maxWidth: '100%', boxSizing: 'border-box' }} />
        )}
        <span style={label}>Ends</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {endChoices(now).map((c) => {
            const on = c.key === 'never' ? !v.expiresAt && !endAt : false;
            return <button key={c.key} type="button" disabled={ro} aria-pressed={on} onClick={() => { setEndAt(false); form.set('expiresAt', c.iso); }} style={chip(on)}>{c.label}</button>;
          })}
          <button type="button" disabled={ro} aria-pressed={!!v.expiresAt} onClick={() => { setEndAt(true); if (!v.expiresAt) { const d = new Date(); d.setHours(23, 59, 0, 0); form.set('expiresAt', d.toISOString()); } }} style={chip(!!v.expiresAt)}>At a date and time…</button>
        </div>
        {(!!v.expiresAt || endAt) && (
          <input type="datetime-local" aria-label="End date and time" disabled={ro} value={isoToLocalInput(v.expiresAt)} onChange={(e) => form.set('expiresAt', localInputToIso(e.target.value))}
            style={{ ...inputStyle, minHeight: '44px', marginTop: '8px', maxWidth: '100%', boxSizing: 'border-box' }} />
        )}
        <span style={label}>Only on these days <span style={{ fontWeight: 400 }}>(none = every day)</span></span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {DAY_CHIPS.map((d) => {
            const on = (v.days || []).includes(d);
            return <button key={d} type="button" disabled={ro} aria-pressed={on} onClick={() => form.set('days', on ? v.days.filter((x) => x !== d) : [...(v.days || []), d])} style={{ ...chip(on), padding: '0 12px' }}>{d}</button>;
          })}
        </div>
        <span style={label}>Only at this time of day <span style={{ fontWeight: 400 }}>(empty = all day)</span></span>
        {advancedRepeat ? (
          <p style={{ ...hint, color: colors.text }}>{recurrenceLabel(item.when?.recurrence)}. This post has a detailed repeat rule: change it in All options.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <input type="time" aria-label="From time" disabled={ro} value={v.winStart} onChange={(e) => form.set('winStart', e.target.value)} style={{ ...inputStyle, minHeight: '44px', width: '130px' }} />
            <span style={{ color: colors.dim }}>to</span>
            <input type="time" aria-label="To time" disabled={ro} value={v.winEnd} onChange={(e) => form.set('winEnd', e.target.value)} style={{ ...inputStyle, minHeight: '44px', width: '130px' }} />
            {(v.winStart || v.winEnd) && !ro && <button type="button" onClick={() => { form.set('winStart', ''); form.set('winEnd', ''); }} style={btn()}>All day</button>}
          </div>
        )}
      </div>

      {kind === 'slide' && (
        <div style={box} data-testid="post-place">
          <span style={label}>Place in the slideshow</span>
          <p style={{ ...hint, color: colors.text, marginTop: 0 }}>{where ? `Plays as number ${where.index + 1} of ${where.total} in the Slides list.` : 'Not in the Slides list yet.'}</p>
          {canPlace ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {[['keep', 'Keep its place'], ['first', 'Show first'], ['last', 'Show last'], ['after', 'After a slide…']].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={v.place === k} onClick={() => form.set('place', k)} style={chip(v.place === k)}>{l}</button>
                ))}
              </div>
              {v.place === 'after' && (
                <select aria-label="Show it after this slide" value={v.placeAfter} onChange={(e) => form.set('placeAfter', e.target.value)}
                  style={{ ...inputStyle, minHeight: '44px', marginTop: '8px', width: '100%', boxSizing: 'border-box' }}>
                  <option value="">Pick a slide…</option>
                  {entries.filter((e) => e.item?.id !== item.id).map((e) => <option key={e.key} value={e.key}>{entryTitle(e)}</option>)}
                </select>
              )}
            </>
          ) : <p style={hint}>Changing the order needs “Change the slides”.</p>}
        </div>
      )}

      <div style={{ ...box, padding: '10px 14px' }} data-testid="post-where" data-audience-hook="audience">
        <div style={{ fontSize: '13px', fontWeight: 700, color: colors.dim }}>Which screens?</div>
        <div style={{ fontSize: '14px', color: colors.text }}>{whereLabel(item)}</div>
        <p style={hint}>Choosing screens comes with multi-screen support.</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
        <button type="button" onClick={() => setPreview((p) => !p)} aria-expanded={preview} style={btn()} data-testid="post-see-it">{preview ? 'Hide preview' : 'See it'}</button>
        {canEdit && <button type="button" onClick={() => { if (!isAnyDirty() || window.confirm('Discard your changes here and open all options?')) { onClose(true); onOpenComposer(item); } }} style={btn()} data-testid="post-all-options">All options (text, look)…</button>}
        {canEdit && st.key === 'draft' && <button type="button" onClick={async () => { if (await onUpdate(item.id, { status: 'published' }, 'Posted')) onClose(true); }} style={btn('primary')}>Post it now</button>}
        {canEdit && st.key === 'ended' && <button type="button" onClick={async () => { if (await onReactivate(item.id, {})) onClose(true); }} style={btn('primary')}>Show again</button>}
        {can(caps, 'announcements.post') && <button type="button" onClick={async () => { const copy = await onDuplicate(item.id); if (copy) { onClose(true); onOpenComposer(copy); } }} style={btn()}>Duplicate</button>}
        {canDelete && (confirmDel
          ? <button type="button" onClick={() => { onClose(true); onDelete(item.id); }} style={btn('danger')} data-testid="post-delete-confirm">Yes, delete (Undo after)</button>
          : <button type="button" onClick={() => setConfirmDel(true)} style={btn('danger')} data-testid="post-delete">Delete</button>)}
      </div>
      {preview && <div style={{ marginTop: '12px' }}><AnnouncementPreview item={{ ...item, status: 'published' }} settings={settings} /></div>}

      {form.error && <div role="alert" style={{ marginTop: '12px', color: colors.danger, fontSize: '14px' }}>{form.error}</div>}
      {!ro && (
        <div style={{ position: 'sticky', bottom: 0, marginTop: '16px', padding: '12px 0 4px', background: colors.card, borderTop: `1px solid ${colors.line}`, display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onClose(false)} style={btn()} data-testid="post-cancel">Cancel</button>
          <button type="button" onClick={form.save} disabled={form.saving || !form.dirty} data-testid="post-save" style={{ ...btn('primary'), opacity: form.saving || !form.dirty ? 0.5 : 1 }}>{form.saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </div>
  );
}

/**
 * One post's popup, the same pattern as a slide's pencil popup (SlideEditSheet): on/off, when, seconds, tag,
 * full screen, place in the slideshow, which screens (hook), see it, all options, duplicate, show again,
 * post a draft, delete with Undo. Opened from the Announcements list, the Slides page, Home, search and
 * the 'Open it' button on every post toast (postOpen.js).
 */
export default function PostManageSheet({ item, onClose, ...rest }) {
  const close = (saved) => {
    if (!saved && isAnyDirty() && !window.confirm('Discard your changes to this post?')) return;
    onClose();
  };
  const title = item ? (String(primaryText(item) || '').split('\n')[0].slice(0, 80) || 'Post') : '';
  return (
    <Sheet open={!!item} onClose={() => close(false)} title={title} label="Post" zIndex={1200}>
      {item && <Body key={item.id} item={item} {...rest} onClose={close} />}
    </Sheet>
  );
}
