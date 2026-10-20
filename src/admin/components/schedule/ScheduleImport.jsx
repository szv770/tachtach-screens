/**
 * "Paste / Import" tab: paste text from Claude (or upload .txt/.md/.json) →
 * Preview (server dry run: one card per date) → Apply (all-or-nothing).
 * Also the Claude helpers: "Copy Claude prompt" (rules + dates + zmanim),
 * "Copy format guide for a Claude Project" (rules only) and "Copy as text".
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, alpha } from '../../styles/admin-tokens.js';
import { ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';
import { formatScheduleText, formatWeeklyText, formatTime12 } from '../../../shared/schedulePaste.js';
import { PROMPT_TYPES, buildPromptOfType, buildFormatGuide, keyTimesForDate } from '../../../shared/scheduleClaudePrompt.js';
import {
  toISODate, shabbosPairISO, weekdayOfISO, addDaysISO, formatDateShort, formatDateLong, getEffectiveSchedule,
} from '../../../shared/scheduleResolution.js';
import { IssueList } from './DayEditor.jsx';
import { scheduleApi, smallButton, chipButton, sectionLabel, monoStyle, CategoryDot } from './scheduleShared.jsx';

const MAX_UPLOAD = 256 * 1024;

/** The dates a prompt/export is about: a Fri+Shabbos pair, or the picked date (with its Shabbos partner). */
function targetDates(target, today, selectedDate) {
  if (target === 'this') return shabbosPairISO(today, 0);
  if (target === 'next') return shabbosPairISO(today, 1);
  const w = weekdayOfISO(selectedDate);
  if (w === 5) return [selectedDate, addDaysISO(selectedDate, 1)];
  if (w === 6) return [addDaysISO(selectedDate, -1), selectedDate];
  return [selectedDate];
}

export default function ScheduleImport({
  schedule, scheduleDates, selectedDate, settings, onApplied, onEditDate, notify, copy, isMobile, mode = 'dates', onWeeklyApplied, groups = [],
}) {
  const weekly = mode === 'weekly';
  const today = toISODate(new Date());
  const categories = schedule?.categories || [];
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // server preview result
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(null);
  const [target, setTarget] = useState('this');
  const [menuOpen, setMenuOpen] = useState(false);
  const [zinfo, setZinfo] = useState({ loading: true, zmanim: {}, parsha: '' });
  const fileRef = useRef(null);

  const dates = useMemo(() => targetDates(target, today, selectedDate), [target, today, selectedDate]);
  const datesKey = dates.join(',');

  // Prefetch zmanim so "Copy Claude prompt" can copy synchronously inside the
  // tap (iOS only allows clipboard writes during the user gesture).
  useEffect(() => {
    let alive = true;
    setZinfo((z) => ({ ...z, loading: true }));
    scheduleApi.zmanim(dates)
      .then((r) => { if (alive) setZinfo({ loading: false, zmanim: r.zmanim || {}, parsha: r.parsha || '', location: r.location || '' }); })
      .catch(() => { if (alive) setZinfo({ loading: false, zmanim: {}, parsha: '' }); });
    return () => { alive = false; };
  }, [datesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const zip = settings?.location?.zip || zinfo.location || '';
  const promptCtx = () => ({
    dates, zmanimByDate: zinfo.zmanim, parsha: zinfo.parsha, categories, groups, location: zip ? `zip code ${zip}` : '',
    currentText: (schedule?.entries || []).length ? formatWeeklyText(schedule.entries, { categories, groups, header: false }) : '',
  });
  const guide = buildFormatGuide({ categories, groups });

  const runPreview = async (value = text) => {
    if (!value.trim()) { setPreview(null); return; }
    setBusy(true);
    try {
      const r = await (weekly ? scheduleApi.weeklyPreview(value) : scheduleApi.preview(value));
      setPreview(r);
      setStale(false);
      setApplied(null);
    } catch (err) {
      notify(`Preview failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview?.canApply || stale) return;
    setBusy(true);
    try {
      if (weekly) {
        const r = await scheduleApi.weeklyApply(text);
        onWeeklyApplied?.(r);
        setApplied(r);
        setPreview(null);
        notify(`Weekly schedule replaced: ${r.count} item${r.count === 1 ? '' : 's'}${r.backupName ? `\nOld one saved as "${r.backupName}"` : ''}`, 'success', null, 7000);
        return;
      }
      const r = await scheduleApi.apply(text);
      onApplied(r.scheduleDates, r.createdCategories?.length > 0);
      setApplied(r);
      setPreview(null);
      const parts = r.applied.map((a) => `${formatDateShort(a.date)}${a.cleared ? ' (back to weekly)' : ` (${a.count})`}`);
      notify(`Applied: ${parts.join(', ')}${r.createdCategories?.length ? `\nNew categories: ${r.createdCategories.map((c) => c.name).join(', ')}` : ''}`, 'success', null, 7000);
    } catch (err) {
      notify(`Nothing was saved: ${err.message}`, 'error');
      runPreview();
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (/\.(xlsx|xls|csv|numbers|docx?)$/i.test(file.name)) {
      notify('That file type isn\'t supported yet. Use a .txt, .md or .json file (or paste the text).', 'error', null, 7000);
      return;
    }
    if (file.size > MAX_UPLOAD) { notify('File is too big (max 256 KB).', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setText(value);
      runPreview(value);
    };
    reader.onerror = () => notify('Couldn\'t read that file.', 'error');
    reader.readAsText(file);
  };

  const copyWeeklyAsText = () => copy(formatWeeklyText(schedule?.entries || [], { categories, groups }), 'Weekly schedule copied as text');

  const copyAsText = () => {
    const days = dates.map((d) => {
      const eff = getEffectiveSchedule(schedule, scheduleDates, d);
      return { date: d, label: eff.label, entries: eff.entries };
    });
    copy(formatScheduleText(days, { categories, groups }), `${dates.map((d) => formatDateShort(d)).join(' + ')} copied as text`);
  };

  const allCats = [...categories, ...(preview?.newCategories || []).map((c) => ({ ...c, color: colors.muted, isNew: true }))];
  const globalErrors = (preview?.errors || []).filter((e) => !e.date || !preview.days.some((d) => d.date === e.date));
  const globalWarnings = (preview?.warnings || []).filter((w) => !w.date || !preview.days.some((d) => d.date === w.date));
  const zLine = dates.map((d) => {
    const t = keyTimesForDate(d, zinfo.zmanim?.[d]);
    const w = weekdayOfISO(d);
    const bits = w === 5 ? [t.candleLighting && `candles ${t.candleLighting}`, t.shkia && `shkia ${t.shkia}`]
      : w === 6 ? [t.shkia && `shkia ${t.shkia}`, t.shabbosEnds && `ends ${t.shabbosEnds}`]
        : [t.shkia && `shkia ${t.shkia}`];
    const have = bits.filter(Boolean);
    return `${formatDateShort(d)}: ${have.length ? have.join(', ') : 'zmanim not available (placeholder in prompt)'}`;
  });

  return (
    <div>
      {/* Claude helpers */}
      <div className="tt-card" style={card(isMobile)}>
        <div style={{ ...sectionLabel, marginBottom: '6px' }}>1 · Ask Claude</div>
        <p style={para}>
          {weekly
            ? 'Pick "A weekly schedule", paste the prompt into Claude chat, describe the regular week (or what to change), then paste Claude\'s answer below. Schedules are one of the things Claude can prepare for the screen; this menu will grow.'
            : 'Pick a prompt type, paste it into Claude chat, add what\'s happening ("Shacharis 9:30, kiddush after, guest speaker at shalosh seudos"), then paste Claude\'s answer below.'}
        </p>
        {!weekly && (
          <>
            <div role="radiogroup" aria-label="Which dates" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0' }}>
              {[
                ['this', `This Shabbos (${formatDateShort(shabbosPairISO(today, 0)[0]).split(', ')[1]})`],
                ['next', `Next Shabbos (${formatDateShort(shabbosPairISO(today, 1)[0]).split(', ')[1]})`],
                ['selected', `Picked date (${formatDateShort(selectedDate)})`],
              ].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={target === v} style={chipButton(target === v)} onClick={() => setTarget(v)}>{l}</button>
              ))}
            </div>
            <div data-testid="zmanim-summary" style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '10px', lineHeight: 1.6 }}>
              {zinfo.loading ? 'Looking up zmanim…' : zLine.map((l) => <div key={l}>{l}</div>)}
              {!zinfo.loading && zinfo.parsha && <div>Parshas {zinfo.parsha}</div>}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: weekly ? '10px' : 0, alignItems: 'flex-start' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid="prompt-menu-button"
              style={{ ...buttonPrimary, fontFamily: adminFonts.englishBody, minHeight: '42px' }}
              onClick={() => setMenuOpen((o) => !o)}
            >
              Copy Claude prompt for… ▾
            </button>
            {menuOpen && (
              <div role="menu" data-testid="prompt-menu" style={{
                position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, minWidth: '240px', maxWidth: 'calc(100vw - 32px)',
                background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '8px', boxShadow: '0 10px 28px rgba(0,0,0,.5)', overflow: 'hidden',
              }}>
                {PROMPT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); copy(buildPromptOfType(t.id, promptCtx()), `Claude prompt copied: ${t.label.toLowerCase()}`); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${colors.border}`,
                      color: colors.text, fontFamily: adminFonts.englishBody, fontSize: '14px', padding: '10px 14px', minHeight: '44px', cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" style={smallButton} onClick={() => copy(guide, 'Format guide copied')}>
            Copy format guide for a Claude Project
          </button>
          {weekly ? (
            <button type="button" style={smallButton} onClick={copyWeeklyAsText} disabled={!(schedule?.entries || []).length}>
              Copy current weekly schedule as text
            </button>
          ) : (
            <button type="button" style={smallButton} onClick={copyAsText}>
              Copy {dates.length > 1 ? 'these dates' : 'this date'} as text
            </button>
          )}
        </div>
      </div>

      {/* Paste + preview */}
      <div className="tt-card" style={{ ...card(isMobile), marginTop: '12px' }}>
        <div style={{ ...sectionLabel, marginBottom: '6px' }}>2 · Paste Claude's answer (or upload a file)</div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setStale(!!preview); setApplied(null); }}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData('text');
            if (pasted && !text.trim()) { e.preventDefault(); setText(pasted); runPreview(pasted); }
          }}
          aria-label="Schedule text"
          placeholder={weekly
            ? '# TachTach schedule v1\n@ every Sun-Thu\n7:00 AM | Shacharis | שחרית | Davening\n9:00 AM - 12:30 PM | | סדר | Seder\n@ Fri\n7:30 AM | Shacharis | שחרית | Davening'
            : '# TachTach schedule v1\n@ 2026-10-16 Fri  Erev Shabbos\n7:05 AM | Shacharis | שחרית | Davening\n6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle'}
          spellCheck={false}
          rows={isMobile ? 10 : 14}
          style={{ ...inputStyle, ...monoStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
          <button type="button" style={{ ...buttonPrimary, fontFamily: adminFonts.englishBody, minHeight: '42px' }} disabled={busy || !text.trim()} onClick={() => runPreview()}>
            {busy && !preview ? 'Checking…' : 'Check & preview'}
          </button>
          <button type="button" style={smallButton} onClick={() => fileRef.current?.click()}>Upload file…</button>
          <input ref={fileRef} type="file" accept=".txt,.md,.json,.text,text/plain,text/markdown,application/json" onChange={onFile} style={{ display: 'none' }} data-testid="schedule-file" />
          {text && <button type="button" style={smallButton} onClick={() => { setText(''); setPreview(null); setApplied(null); }}>Clear</button>}
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>.txt, .md or .json</span>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ marginTop: '12px' }} data-testid="paste-preview">
          {stale && (
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.copper, marginBottom: '8px' }}>
              The text changed — tap Check & preview again before applying.
            </div>
          )}
          <IssueList issues={{ errors: globalErrors, warnings: globalWarnings }} />
          {weekly && preview.weekly && (
            <div data-testid="weekly-replace-note" style={{
              fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.copper, marginBottom: '10px', lineHeight: 1.5,
              border: `1px solid ${alpha(colors.copper, 40)}`, borderRadius: '8px', padding: '8px 12px',
            }}>
              <b>Replaces {preview.replaces} weekly item{preview.replaces === 1 ? '' : 's'}</b> with {preview.weekly.entries.length} new.
              {preview.replaces > 0 ? ' The current weekly schedule is saved first as a template named "Auto-backup <date>". ' : ' '}
              Dates with their own schedule are not affected.
            </div>
          )}
          {weekly && preview.weekly && weeklyGroups(preview.weekly).map((g) => (
            <PreviewCard
              key={g.key}
              day={{ title: g.title, sub: g.sub, entries: g.entries, weeklyBadge: `${g.entries.length} item${g.entries.length === 1 ? '' : 's'}` }}
              categories={allCats}
              errors={[]}
              warnings={[]}
              isMobile={isMobile}
            />
          ))}
          {preview.days.map((d) => (
            <PreviewCard
              key={d.date}
              day={d}
              categories={allCats}
              errors={preview.errors.filter((e) => e.date === d.date)}
              warnings={preview.warnings.filter((w) => w.date === d.date)}
              isMobile={isMobile}
            />
          ))}
          <div style={{
            position: 'sticky', bottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom))' : '12px', marginTop: '12px', zIndex: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            background: colors.bg, border: `1px solid ${preview.errors.length ? colors.danger : colors.goldBd}`,
            borderRadius: '10px', padding: '10px 12px', boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          }}>
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: preview.errors.length ? colors.danger : colors.text }}>
              {preview.errors.length
                ? `${preview.errors.length} error${preview.errors.length > 1 ? 's' : ''} — fix ${preview.errors.length > 1 ? 'them' : 'it'} to apply`
                : weekly
                  ? `${preview.weekly?.entries.length || 0} weekly items ready · replaces ${preview.replaces}`
                  : `${preview.days.length} date${preview.days.length > 1 ? 's' : ''} ready`}
            </span>
            <button
              type="button"
              data-testid="apply-paste"
              disabled={!preview.canApply || stale || busy}
              onClick={apply}
              style={{ ...buttonPrimary, fontFamily: adminFonts.englishBody, minHeight: '42px', opacity: !preview.canApply || stale ? 0.45 : 1, cursor: !preview.canApply || stale ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {applied && weekly && (
        <div className="tt-card" style={{ ...card(isMobile), marginTop: '12px', borderColor: colors.goldBd }} data-testid="paste-applied">
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.success }}>
            Saved: the weekly schedule now has {applied.count} item{applied.count === 1 ? '' : 's'}. The screen updates right away.
          </div>
          {applied.backupName && (
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '6px' }}>
              The previous one is saved as the template "{applied.backupName}" (Schedule Templates, below).
            </div>
          )}
        </div>
      )}
      {applied && !weekly && (
        <div className="tt-card" style={{ ...card(isMobile), marginTop: '12px', borderColor: colors.goldBd }} data-testid="paste-applied">
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.success, marginBottom: '8px' }}>Saved. The screen updates right away.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {applied.applied.map((a) => (
              <div key={a.date} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
                <span style={{ flex: '1 1 160px' }}>{formatDateShort(a.date)} — {a.cleared ? 'back to weekly' : `${a.count} item${a.count === 1 ? '' : 's'}`}</span>
                <button type="button" style={smallButton} onClick={() => onEditDate(a.date)}>Edit day</button>
                <a href={`/screen?previewDate=${a.date}`} target="_blank" rel="noreferrer" style={{ ...smallButton, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Preview ↗</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One preview group per distinct set of days, in the order they appear. */
function weeklyGroups(weekly) {
  const map = new Map();
  for (const e of weekly.entries) {
    const key = (e.days || []).join(',');
    if (!map.has(key)) map.set(key, { key, entries: [], codes: e.days || [] });
    map.get(key).entries.push(e);
  }
  const order = weekly.rules.map((r) => r.codes.join(','));
  const groups = [...map.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return groups.map((g) => ({
    ...g,
    title: g.codes.length === 7 ? 'Every day' : g.codes.length === 1 ? `Every ${g.codes[0]}` : 'Days',
    sub: g.codes.length === 7 ? '' : g.codes.join(', '),
  }));
}

function PreviewCard({ day, categories, errors, warnings, isMobile }) {
  const badge = day.weeklyBadge
    ? { text: day.weeklyBadge, color: colors.gold }
    : day.clear
    ? { text: 'Back to weekly', color: colors.dim }
    : day.existingCount != null
      ? { text: `Replaces ${day.existingCount} item${day.existingCount === 1 ? '' : 's'}`, color: colors.copper }
      : { text: `New (was weekly: ${day.weeklyCount})`, color: colors.gold };
  const lineErrors = new Set(errors.map((e) => e.line));
  return (
    <div data-testid="preview-card" className="tt-card" style={{ ...card(isMobile), marginBottom: '10px', borderColor: errors.length ? alpha(colors.danger, 53) : colors.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 600, color: colors.text }}>{day.title || formatDateLong(day.date)}</div>
          {day.sub && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>{day.sub}</div>}
          {day.label && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, unicodeBidi: 'plaintext' }}>{day.label}</div>}
        </div>
        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', padding: '3px 9px', borderRadius: '999px', color: badge.color, border: `1px solid ${badge.color}66` }}>
          {badge.text}
        </span>
      </div>
      {!day.clear && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column' }}>
          {day.entries.length === 0 && <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.muted }}>No items — an empty day.</div>}
          {day.entries.map((e, i) => {
            const cat = categories.find((c) => c.id === e.category);
            return (
              <div key={`${e.line}-${i}`} style={{
                display: 'grid', gridTemplateColumns: isMobile ? '78px 1fr' : '150px 1fr 1fr auto', gap: isMobile ? '2px 8px' : '8px',
                alignItems: 'center', padding: '6px 0', borderTop: i ? `1px solid ${colors.border}` : 'none',
                opacity: e.enabled ? 1 : 0.5, fontFamily: adminFonts.englishBody, fontSize: '14px',
              }}>
                <span style={{ color: colors.gold, whiteSpace: 'pre-line' }}>{formatTime12(e.time)}{e.endTime ? `${isMobile ? '\n' : ' – '}${formatTime12(e.endTime)}` : ''}</span>
                <span style={{ color: colors.text, minWidth: 0 }}>
                  {e.name}
                  {isMobile && e.nameHe && <span dir="rtl" style={{ display: 'block', color: colors.dim, fontFamily: adminFonts.hebrewPrimary, textAlign: e.name ? 'left' : 'right' }}>{e.nameHe}</span>}
                </span>
                {!isMobile && <span dir="rtl" style={{ color: colors.dim, fontFamily: adminFonts.hebrewPrimary, textAlign: 'right' }}>{e.nameHe}</span>}
                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', gridColumn: isMobile ? '2' : 'auto', fontSize: '12px', color: colors.dim }}>
                  {cat && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '999px', border: `1px solid ${cat.isNew ? colors.gold : `${cat.color}88`}` }}>
                      <CategoryDot color={cat.color} size={7} />{cat.name}{cat.isNew && <b style={{ color: colors.gold }}> new</b>}
                    </span>
                  )}
                  {e.alertBefore > 0 && (
                    <span title={e.alertFromDefault ? `Reminder applied from the ${cat?.name || 'category'} default` : 'Countdown alert'}>
                      ⏱ {e.alertBefore}m{e.countdownDisplay === 'takeover' ? ' full screen' : ''}{e.alertFromDefault ? ' (default)' : ''}
                    </span>
                  )}
                  {e.icon && <ScheduleIcon iconKey={e.icon} size={14} color={colors.dim} />}
                  {!e.enabled && <span>hidden</span>}
                  {lineErrors.has(e.line) && <span style={{ color: colors.danger }}>line {e.line}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <IssueList issues={{ errors, warnings }} />
    </div>
  );
}

const card = (isMobile) => ({
  background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: isMobile ? '14px 12px' : '16px 18px',
});
const para = { fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.dim, lineHeight: 1.5 };
