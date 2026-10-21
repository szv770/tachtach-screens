import React, { useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { ZMANIM_DISPLAY } from '../../../shared/constants.js';
import { normalizeWebUrl } from '../../../shared/embedCheck.js';
import { apiFetch } from '../../hooks/useAdminState.js';
import Collapsible from '../ui/Collapsible.jsx';
import { Field, Choices, SwitchRow, Hint, LinkButton, fieldStyle } from '../look/kit.jsx';
import {
  typeInfo, popupSpec, SECONDS_PRESETS, LANGS, LIMUDIM_ITEMS, IMAGE_FIT, IMAGE_EDGE, PHOTO_LAYOUTS, PHOTO_ORDER, RSS_MODES, RSS_STYLES, WEB_RELOAD, WEB_ZOOM,
} from './slideTypes.js';

const check = (on, label, onChange, testId) => (
  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }} data-testid={testId}>
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: colors.gold, width: '20px', height: '20px', flexShrink: 0 }} />
    <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
  </label>
);

/** The "Check this address" box for web pages: does the site allow being shown in a slide? */
function AddressCheck({ url }) {
  const [probe, setProbe] = useState(null); // { loading } | { framable, reason } | { error }
  const run = async () => {
    const u = normalizeWebUrl(url);
    if (!u) { setProbe({ error: 'Enter a full web address, like https://charidy.com/miami+' }); return; }
    setProbe({ loading: true });
    try { setProbe(await apiFetch(`/api/embed-probe?url=${encodeURIComponent(u)}`)); } catch (err) { setProbe({ error: err.message }); }
  };
  const bad = probe && (probe.error || probe.framable === false);
  return (
    <div style={{ marginTop: '10px' }}>
      <button type="button" onClick={run} data-testid="web-check" style={{ minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-sm)', border: `1.5px solid ${colors.border}`, background: colors.card, color: colors.text, fontWeight: 700, fontFamily: adminFonts.englishBody, cursor: 'pointer' }}>
        Check this address
      </button>
      {probe && (
        <div role="status" data-testid="web-check-result" style={{
          marginTop: '8px', padding: '8px 10px', borderRadius: 'var(--r-sm)', fontFamily: adminFonts.englishBody, fontSize: '13px', lineHeight: 1.5,
          background: bad ? colors.dangerBg : colors.sunken, color: bad ? colors.danger : colors.dim, border: `1px solid ${bad ? colors.danger : colors.line}`,
        }}>
          {probe.loading && 'Checking the site…'}
          {probe.error}
          {!probe.loading && !probe.error && (<>{probe.framable === true && '✓ '}{probe.framable === false && '✗ This site will not show in a slide. '}{probe.framable === null && '? '}{probe.reason}</>)}
        </div>
      )}
    </div>
  );
}

/** What each slide type asks for. `form` = useDirtyForm; `go` = go to another admin page. Basics (label, seconds) are separate. */
export function TypeFields({ slide, form, go, settings }) {
  const sections = typeInfo(slide.type)?.edit || [];
  const v = form.values;
  const set = form.set;
  const out = [];

  if (sections.includes('zmanim')) {
    out.push(
      <Field key="zmanim" label="Which zmanim to show" hint="Untick any you do not want on the screen.">
        <div data-testid="f-zmanim">
          {ZMANIM_DISPLAY.map((z) => check(v.zmanimVisible.includes(z.k), `${z.en}  ·  ${z.he}`, (on) => {
            set('zmanimVisible', ZMANIM_DISPLAY.map((x) => x.k).filter((k) => (k === z.k ? on : v.zmanimVisible.includes(k))));
          }, `zman-${z.k}`))}
        </div>
      </Field>,
    );
  }
  if (sections.includes('limudim')) {
    out.push(
      <Field key="limLang" label="Language">
        <Choices ariaLabel="Study language" value={v.limudimLang} onChange={(x) => set('limudimLang', x)} options={LANGS} />
      </Field>,
      <Field key="limItems" label="Which studies to show">
        {LIMUDIM_ITEMS.map((i) => check(v.limudimItems[i.key] !== false, i.label, (on) => set('limudimItems', { ...v.limudimItems, [i.key]: on }), `lim-${i.key}`))}
      </Field>,
    );
  }
  if (sections.includes('hayomYom')) {
    out.push(
      <Field key="hy" label="Language" hint="Hayom Yom is the daily Chasidic teaching.">
        <Choices ariaLabel="Hayom Yom language" value={v.hayomYomLang} onChange={(x) => set('hayomYomLang', x)} options={LANGS} />
      </Field>,
    );
  }
  if (sections.includes('weather')) {
    out.push(
      <Field key="wu" label="Temperature units">
        <Choices ariaLabel="Units" value={v.weatherUnits} onChange={(x) => set('weatherUnits', x)} options={[{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }]} />
      </Field>,
      <div key="wr" style={{ marginTop: '12px' }}>
        <SwitchRow on={v.weatherRail} onChange={() => set('weatherRail', !v.weatherRail)} label="Also show the temperature in the side rail" note="A small readout under the clock." testId="f-weather-rail" />
      </div>,
      <Hint key="wh">The place comes from Location &amp; weather. <LinkButton onClick={() => go?.('location')}>Open Location &amp; weather</LinkButton></Hint>,
    );
  }
  if (sections.includes('image')) {
    out.push(
      <Field key="fit" label="How the image fits the screen">
        <select aria-label="Display mode" value={v.displayMode} onChange={(e) => set('displayMode', e.target.value)} style={fieldStyle}>
          {IMAGE_FIT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>,
    );
    if (v.displayMode === 'fit') {
      out.push(
        <Field key="edge" label="Around the image">
          <select aria-label="Around the image" value={v.edgeTreatment} onChange={(e) => set('edgeTreatment', e.target.value)} style={fieldStyle}>
            {IMAGE_EDGE.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>,
      );
    }
  }
  if (sections.includes('photos')) {
    out.push(
      <Field key="pl" label="Layout">
        <select aria-label="Photo layout" value={v.displayMode} onChange={(e) => set('displayMode', e.target.value)} style={fieldStyle}>
          {PHOTO_LAYOUTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>,
      <Field key="pi" label="Seconds per photo">
        <input aria-label="Seconds per photo" inputMode="numeric" value={v.photoInterval} onChange={(e) => /^\d*$/.test(e.target.value) && set('photoInterval', e.target.value)} style={{ ...fieldStyle, maxWidth: '120px' }} />
      </Field>,
      <Hint key="ph">Sync, photo limit and which album live in Media. <LinkButton onClick={() => go?.('images', { tab: 'photos' })}>Open Photo albums</LinkButton></Hint>,
    );
  }
  if (sections.includes('pdf')) {
    const n = Array.isArray(slide.pdfPages) ? slide.pdfPages.length : 1;
    out.push(
      <Field key="ps" label="Seconds on each page" hint={`${n} page${n === 1 ? '' : 's'}. The whole PDF plays once each time the slide comes up.`}>
        <input aria-label="Seconds on each page" inputMode="numeric" value={v.pageSeconds} onChange={(e) => /^\d*$/.test(e.target.value) && set('pageSeconds', e.target.value)} style={{ ...fieldStyle, maxWidth: '120px' }} data-testid="f-pageseconds" />
      </Field>,
      <Field key="pfit" label="How each page fits the screen">
        <select aria-label="Display mode" value={v.displayMode} onChange={(e) => set('displayMode', e.target.value)} style={fieldStyle}>
          {IMAGE_FIT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>,
    );
    if (v.displayMode === 'fit') {
      out.push(
        <Field key="pedge" label="Around a page that does not fill the screen">
          <select aria-label="Around the page" value={v.edgeTreatment} onChange={(e) => set('edgeTreatment', e.target.value)} style={fieldStyle}>
            {IMAGE_EDGE.filter((m) => m.value !== 'blur').map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>,
      );
    }
  }
  if (sections.includes('rss')) {
    out.push(
      <Field key="rm" label="Which item">
        <Choices ariaLabel="Feed item" value={v.rssDisplayMode} onChange={(x) => set('rssDisplayMode', x)} options={RSS_MODES} />
      </Field>,
      <Field key="rs" label="Look">
        <select aria-label="Feed look" value={v.style} onChange={(e) => set('style', e.target.value)} style={fieldStyle}>
          {RSS_STYLES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>,
      <Hint key="rh">The feed address and refresh live in Media. <LinkButton onClick={() => go?.('images', { tab: 'feeds' })}>Open News feeds</LinkButton></Hint>,
    );
  }
  if (sections.includes('web') || sections.includes('embed')) {
    const web = sections.includes('web');
    out.push(
      <Field key="url" label={web ? 'Web address' : 'Live Screen address'}
        hint={web ? 'The page loads fresh every time this slide comes up. For a Charidy campaign add a + to the end (charidy.com/miami+) for the version made for big screens.' : 'The public URL of your Mivtzah "Live Screen" page. Changes happen in that app; nothing to update here.'}>
        <input aria-label="Web address" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={v.embedUrl} onChange={(e) => set('embedUrl', e.target.value)}
          placeholder={web ? 'https://charidy.com/miami+' : 'https://your-mivtzah-app.vercel.app/live'} style={{ ...fieldStyle, direction: 'ltr' }} data-testid="f-url" />
        {web && <AddressCheck url={v.embedUrl} />}
      </Field>,
    );
  }
  return <>{out}</>;
}

/** The closed-by-default "Advanced" box: fullscreen, web reload and size, photo extras. */
export function AdvancedFields({ slide, form }) {
  const sections = typeInfo(slide.type)?.edit || [];
  const v = form.values;
  const set = form.set;
  const items = [];
  if (popupSpec(slide.type).fullscreen) {
    items.push(<SwitchRow key="fs" on={!!v.fullscreen} onChange={() => set('fullscreen', !v.fullscreen)} label="Fullscreen" note="Hides the side rail and clock and shows this edge to edge." testId="f-fullscreen" />);
  }
  if (sections.includes('web')) {
    items.push(
      <Field key="wr" label="Reload while showing">
        <select aria-label="Reload while showing" value={v.webRefreshSec} onChange={(e) => set('webRefreshSec', Number(e.target.value))} style={fieldStyle}>
          {WEB_RELOAD.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>,
      <Field key="wz" label="Page size">
        <select aria-label="Page size" value={v.webZoom} onChange={(e) => set('webZoom', Number(e.target.value))} style={fieldStyle}>
          {WEB_ZOOM.map((z) => <option key={z} value={z}>{z}%</option>)}
        </select>
      </Field>,
    );
  }
  if (sections.includes('photos')) {
    items.push(
      <Field key="po" label="Order">
        <select aria-label="Photo order" value={v.photoOrder} onChange={(e) => set('photoOrder', e.target.value)} style={fieldStyle}>
          {PHOTO_ORDER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>,
      <Field key="pf" label="How each photo fits">
        <select aria-label="Photo fit" value={v.imageDisplayMode} onChange={(e) => set('imageDisplayMode', e.target.value)} style={fieldStyle}>
          {IMAGE_FIT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>,
      <SwitchRow key="kb" on={!!v.kenBurns} onChange={() => set('kenBurns', !v.kenBurns)} label="Slow zoom (Ken Burns)" testId="f-kenburns" />,
    );
  }
  if (!items.length) return null;
  return (
    <div style={{ marginTop: '16px' }}>
      <Collapsible id="slide-advanced" title="Advanced" summary="Less common options" style={{ boxShadow: 'none' }}>
        {items}
      </Collapsible>
    </div>
  );
}

const presetBtn = (on) => ({
  minHeight: '44px', minWidth: '48px', padding: '0 12px', borderRadius: 'var(--r-sm)', fontFamily: adminFonts.englishBody, fontSize: '15px', fontWeight: 700, cursor: 'pointer',
  border: `1.5px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : colors.card, color: on ? '#fff' : colors.text,
});
const stepBtn = { ...presetBtn(false), width: '44px', padding: 0, fontSize: '20px' };

/** Name, seconds and On/Off: every slide has these (messages have their own editor). */
export function BasicFields({ slide, form }) {
  const info = typeInfo(slide.type);
  const spec = popupSpec(slide.type);
  const v = form.values;
  const secs = Number(v.duration);
  const bump = (d) => form.set('duration', String(Math.min(spec.secondsMax, Math.max(spec.secondsMin, (Number.isFinite(secs) ? secs : 0) + d))));
  return (
    <>
      <Field label="Name on the slide list" htmlFor="slide-label" hint="Leave blank to use the standard name.">
        <input id="slide-label" value={v.label} placeholder={info?.label || 'Name'} onChange={(e) => form.set('label', e.target.value)} style={fieldStyle} maxLength={80} data-testid="f-label" />
      </Field>
      {spec.seconds && (
        <Field label="Seconds on screen" htmlFor="slide-seconds" hint={spec.secondsNote}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" aria-label="Fewer seconds" onClick={() => bump(-5)} style={stepBtn} data-testid="f-duration-minus">{'\u2212'}</button>
            <input id="slide-seconds" inputMode="numeric" value={v.duration} onChange={(e) => /^\d*$/.test(e.target.value) && form.set('duration', e.target.value)} style={{ ...fieldStyle, maxWidth: '84px', textAlign: 'center' }} data-testid="f-duration" />
            <button type="button" aria-label="More seconds" onClick={() => bump(5)} style={stepBtn} data-testid="f-duration-plus">+</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }} role="group" aria-label="Common lengths">
            {SECONDS_PRESETS.map((n) => <button key={n} type="button" onClick={() => form.set('duration', String(n))} style={presetBtn(secs === n)} aria-pressed={secs === n}>{n}</button>)}
          </div>
        </Field>
      )}
      <div style={{ marginTop: '12px' }}>
        <SwitchRow on={!!v.enabled} onChange={() => form.set('enabled', !v.enabled)} label="Show this slide on the screen" note="Off keeps it in the list but skips it." testId="f-enabled" />
      </div>
    </>
  );
}

/** The 'More settings…' button for types that have a richer page. */
export function MoreSettings({ slide, go }) {
  const m = popupSpec(slide.type).moreSettings;
  if (!m) return null;
  return (
    <div style={{ marginTop: '16px' }}>
      <button type="button" onClick={() => go?.(m.section, m.tab ? { tab: m.tab } : undefined)} data-testid="slide-more"
        style={{ minHeight: '48px', padding: '0 18px', borderRadius: 'var(--r-sm)', border: `1.5px solid ${colors.accent}`, background: colors.card, color: colors.accent, fontWeight: 800, fontFamily: adminFonts.englishBody, fontSize: '15px', cursor: 'pointer' }}>
        More settings{'\u2026'} <span style={{ fontWeight: 600 }}>({m.label})</span>
      </button>
    </div>
  );
}
