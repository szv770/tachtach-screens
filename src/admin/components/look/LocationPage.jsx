import React, { useState, useEffect } from 'react';
import { colors, adminFonts, buttonSecondary, alpha } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { apiFetch } from '../../hooks/useAdminState.js';
import { candleAdvice, candleMinutesOf, candleSentence, CANDLE_USUAL, CANDLE_MIN, CANDLE_MAX, DEFAULT_CANDLE_MINUTES } from '../../../shared/candleLighting.js';
import { Page, Field, Choices, Hint, SwitchRow, LinkButton, useSettingsForm, useInstant, fieldStyle, firstSet } from './kit.jsx';

const COMMON_TZ = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Toronto', 'America/Montreal', 'Asia/Jerusalem',
  'Europe/London', 'Europe/Paris', 'Australia/Melbourne', 'America/Argentina/Buenos_Aires',
];
function allTimeZones() {
  try { if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ }
  return COMMON_TZ;
}

/** Zip / Chabad id / time zone / "Show location as" (form + Save bar), then the weather options (instant). */
export default function LocationPage({ settings = {}, onSave, onNavigate }) {
  const form = useSettingsForm(settings, ['location'], onSave, 'Location');
  const apply = useInstant(settings, onSave);
  const loc = form.values.location || {};
  // Older builds wrote stray top-level zipCode/chabadLocationId; show them if the nested keys are empty.
  const zip = firstSet(loc.zip, settings.zipCode) ?? '';
  const locationId = firstSet(loc.locationId, settings.chabadLocationId) ?? '';
  const tzSet = !!loc.timezone;
  const tz = loc.timezone || 'America/New_York';
  const displayName = loc.displayName || '';
  const all = allTimeZones();
  const rest = all.filter((z) => !COMMON_TZ.includes(z));
  const savedZip = firstSet(settings.location?.zip, settings.zipCode) ?? '';

  const w = settings.weather || {};
  const railOn = w.enabled !== false;
  const railReadoutOn = w.showInRail !== false;
  const weatherZip = w.zip || '';
  const units = (w.units || 'F') === 'C' ? 'C' : 'F';
  const [test, setTest] = useState(null);
  const runTest = async () => {
    setTest('loading');
    try { setTest(await apiFetch(`/api/weather/preview?units=${units}`)); } catch (err) { setTest({ ok: false, error: err.message || 'The request failed.' }); }
  };

  // ── Candle lighting (audit E-01) ──
  const savedLoc = settings.location || {};
  const savedCandle = candleMinutesOf(savedLoc.candleMinutes);
  const candleRaw = loc.candleMinutes === null || loc.candleMinutes === undefined ? '' : String(loc.candleMinutes);
  const [candleText, setCandleText] = useState(candleRaw);
  const [ack, setAck] = useState(false);
  const [guard, setGuard] = useState('');
  useEffect(() => { if (form.count === 0) { setCandleText(candleRaw); setAck(false); setGuard(''); } }, [form.count, candleRaw]);
  const advice = candleAdvice(candleText, tz);
  const typed = candleMinutesOf(candleText);
  const effective = typed ?? savedCandle ?? DEFAULT_CANDLE_MINUTES;
  const changedCandle = typed !== null && typed !== savedCandle && !(typed === DEFAULT_CANDLE_MINUTES && savedCandle === null);
  const setCandle = (text) => {
    setCandleText(text); setAck(false); setGuard('');
    const n = candleMinutesOf(text);
    if (text === '') form.setIn('location', 'candleMinutes', null);
    else if (n !== null) form.setIn('location', 'candleMinutes', n);
  };
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (advice.level === 'error') { setPreview(null); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try { const r = await apiFetch(`/api/candle-preview${typed !== null ? `?minutes=${typed}` : ''}`); if (live) setPreview(r); } catch { if (live) setPreview({ ok: false, error: 'Could not work out an example time right now.' }); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [typed, advice.level, savedLoc.lat, savedLoc.lon, savedLoc.zip, tz]);
  const isLocal = settings.dataSource === 'local';
  const needsAck = advice.level === 'check' && changedCandle;
  const guardedSave = () => {
    if (advice.level === 'error') { setGuard(`Candle-lighting minutes: ${advice.text}`); return; }
    if (needsAck && !ack) { setGuard('Please tick the box under "Candle lighting" to confirm the number, then save.'); return; }
    setGuard('');
    form.save();
  };

  // ── Coordinates and height (calculated times only) ──
  const numText = (v) => (v === null || v === undefined ? '' : String(v));
  const [geo, setGeo] = useState({ lat: numText(loc.lat), lon: numText(loc.lon), elevation: numText(loc.elevation) });
  useEffect(() => { if (form.count === 0) setGeo({ lat: numText(savedLoc.lat), lon: numText(savedLoc.lon), elevation: numText(savedLoc.elevation) }); }, [form.count, savedLoc.lat, savedLoc.lon, savedLoc.elevation]);
  const GEO = { lat: [-90, 90, 'Latitude'], lon: [-180, 180, 'Longitude'], elevation: [-450, 5000, 'Elevation'] };
  const geoBad = (k) => {
    const t = geo[k].trim();
    if (t === '') return '';
    const n = Number(t);
    const [lo, hi, name] = GEO[k];
    return Number.isFinite(n) && n >= lo && n <= hi ? '' : `${name} must be a number from ${lo} to ${hi}.`;
  };
  const setGeoField = (k, text) => {
    setGeo((g) => ({ ...g, [k]: text }));
    const t = text.trim();
    if (t === '') form.setIn('location', k, null);
    else { const n = Number(t); const [lo, hi] = GEO[k]; if (Number.isFinite(n) && n >= lo && n <= hi) form.setIn('location', k, n); }
  };
  const anyGeoBad = ['lat', 'lon', 'elevation'].some(geoBad) || ((geo.lat.trim() === '') !== (geo.lon.trim() === ''));
  const saveAll = () => {
    if (anyGeoBad) { setGuard('Fix the coordinates under "Calculated times": give both latitude and longitude, or leave both empty.'); return; }
    guardedSave();
  };

  return (
    <Page intro="Where the screen is. Zmanim, the parsha, candle lighting and the weather all follow this.">
      <Collapsible
        id="settings-location" title="Location" icon="screen" edited={form.count > 0}
        summary={`${zip ? `Zip ${zip}` : 'No zip code'} - ${tz.replace(/_/g, ' ')}${displayName ? ` - shown as "${displayName}"` : ''}`}
      >
        <Field label="Zip code" htmlFor="tt-zip" hint="Used to calculate the daily zmanim (prayer times) and the weather.">
          <input id="tt-zip" style={fieldStyle} inputMode="text" autoComplete="postal-code" value={zip} onChange={(e) => form.setIn('location', 'zip', e.target.value)} />
        </Field>
        <Field label="Show location as" htmlFor="tt-display-name" hint="The place name printed on the Zmanim and Weather pages. Leave blank to use the name found automatically from the zip code.">
          <input id="tt-display-name" style={fieldStyle} maxLength={60} placeholder="Automatic" value={displayName} onChange={(e) => form.setIn('location', 'displayName', e.target.value)} />
        </Field>
        <Field label="Chabad location ID" htmlFor="tt-chabad-id" hint="Find your city's ID on chabad.org. It is used for Shabbos candle-lighting times.">
          <input id="tt-chabad-id" style={fieldStyle} value={locationId} onChange={(e) => form.setIn('location', 'locationId', e.target.value)} />
        </Field>
        <Field label="Time zone" htmlFor="tt-timezone" hint={tzSet ? 'Used for candle-lighting and zmanim times, announcement start and end times, and repeating days.' : 'Not chosen yet: until you choose one, times are worked out for New York. Pick your own, then Save.'}>
          <select id="tt-timezone" style={{ ...fieldStyle, cursor: 'pointer', ...(tzSet ? {} : { borderColor: colors.danger }) }} value={tzSet ? tz : ''} onChange={(e) => form.setIn('location', 'timezone', e.target.value)}>
            {!tzSet && <option value="" disabled>Choose your time zone...</option>}
            {tzSet && !all.includes(tz) && <option value={tz}>{tz}</option>}
            <optgroup label="Common">{COMMON_TZ.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</optgroup>
            <optgroup label="All">{rest.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</optgroup>
          </select>
        </Field>
      </Collapsible>

      <Collapsible
        id="settings-candles" title="Candle lighting" icon="screen" edited={form.count > 0 && (changedCandle || candleText !== candleRaw)}
        summary={`${candleSentence(savedCandle)}${savedCandle === null ? ' (standard)' : ''}`}
      >
        <div data-testid="candle-settings">
          <Field label="Minutes before sunset" htmlFor="tt-candle-min" hint={`How early Shabbos and Yom Tov candles are lit. Standard: ${DEFAULT_CANDLE_MINUTES} minutes. Leave empty to keep the standard. A wrong number means a wrong candle time on the screen: use the number your rav gives you.`}>
            <Choices ariaLabel="Usual candle-lighting minutes" value={typed} onChange={(n) => setCandle(String(n))} options={CANDLE_USUAL.map(([value, label]) => ({ value, label }))} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
              <input
                id="tt-candle-min" data-testid="candle-minutes" style={{ ...fieldStyle, width: '110px', ...(advice.level === 'error' ? { borderColor: colors.danger } : {}) }}
                inputMode="numeric" placeholder={String(DEFAULT_CANDLE_MINUTES)} value={candleText} onChange={(e) => setCandle(e.target.value.replace(/\D/g, '').slice(0, 2))}
                aria-describedby="tt-candle-advice"
              />
              <span style={{ fontSize: '14px', color: colors.dim }}>minutes (allowed: {CANDLE_MIN} to {CANDLE_MAX})</span>
              <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 14px' }} onClick={() => setCandle('')} disabled={candleText === ''} data-testid="candle-reset">Use the standard ({DEFAULT_CANDLE_MINUTES})</button>
            </div>
          </Field>
          <div id="tt-candle-advice" data-testid="candle-advice" role={advice.level === 'ok' || advice.level === 'empty' ? 'status' : 'alert'} style={{
            marginTop: '10px', fontSize: '14px', lineHeight: 1.5, padding: '10px 12px', borderRadius: '8px',
            border: `1px solid ${advice.level === 'error' ? alpha(colors.danger, 53) : advice.level === 'check' ? colors.goldBd : colors.border}`,
            color: advice.level === 'error' ? colors.danger : colors.text,
          }}>{advice.text}</div>
          {needsAck && (
            <label style={{ display: 'flex', gap: '10px', alignItems: 'center', minHeight: '44px', marginTop: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" data-testid="candle-ack" checked={ack} onChange={(e) => { setAck(e.target.checked); setGuard(''); }} style={{ width: '22px', height: '22px' }} />
              I have checked this number with my rav.
            </label>
          )}
          <div data-testid="candle-effective" style={{ marginTop: '12px', fontSize: '15px', lineHeight: 1.5 }}>
            {preview?.ok ? (
              <>Next candle lighting: <b>{preview.label}</b>. Sunset {preview.sunset}, candles at <b style={{ color: colors.accent }}>{preview.candle}</b> ({effective} minutes before).</>
            ) : preview ? <span style={{ color: colors.dim }}>{preview.error}</span> : <span style={{ color: colors.dim }}>Working out an example time...</span>}
          </div>
          <Hint>
            {isLocal
              ? 'The screen calculates its own times (Data source: Local), so this number decides the candle time shown.'
              : 'Right now the screen takes its times from Chabad.org, which uses its own minutes for your city, so this number is not used until you switch the data source to Local (Health > Offline data). The example above shows the calculated time.'}
          </Hint>
        </div>
      </Collapsible>

      <Collapsible
        id="settings-calculated" title="Calculated times (advanced)" icon="screen" edited={form.count > 0 && anyGeoBad}
        summary={savedLoc.lat != null && savedLoc.lon != null ? `Own coordinates ${savedLoc.lat}, ${savedLoc.lon}` : 'Coordinates found from the zip code'}
      >
        <div data-testid="calc-settings">
          <Hint style={{ marginTop: 0 }}>{isLocal ? 'Used for the sunrise and sunset maths when the screen calculates its own times.' : 'Only used when the data source is Local. Most schools never need to change these.'}</Hint>
          <Field label="Latitude" htmlFor="tt-lat" hint="Leave latitude and longitude empty to use the place found from the zip code (recommended).">
            <input id="tt-lat" style={fieldStyle} inputMode="decimal" placeholder="Automatic" value={geo.lat} onChange={(e) => setGeoField('lat', e.target.value)} />
            {geoBad('lat') && <Hint style={{ color: colors.danger }}>{geoBad('lat')}</Hint>}
          </Field>
          <Field label="Longitude" htmlFor="tt-lon">
            <input id="tt-lon" style={fieldStyle} inputMode="decimal" placeholder="Automatic" value={geo.lon} onChange={(e) => setGeoField('lon', e.target.value)} />
            {geoBad('lon') && <Hint style={{ color: colors.danger }}>{geoBad('lon')}</Hint>}
          </Field>
          <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 14px', marginTop: '10px' }} data-testid="calc-use-zip"
            onClick={() => { setGeo((g) => ({ ...g, lat: '', lon: '' })); form.set('location', { ...(form.values.location || {}), lat: null, lon: null }); }} disabled={geo.lat === '' && geo.lon === ''}>Use the zip code's location</button>
          <Field label="Height above sea level (metres)" htmlFor="tt-elev" hint="Default 0. Only for a place well above or below sea level, where sunrise and sunset come earlier or later.">
            <input id="tt-elev" style={fieldStyle} inputMode="decimal" placeholder="0" value={geo.elevation} onChange={(e) => setGeoField('elevation', e.target.value)} />
            {geoBad('elevation') && <Hint style={{ color: colors.danger }}>{geoBad('elevation')}</Hint>}
          </Field>
        </div>
      </Collapsible>

      <Collapsible id="set-weather" title="Weather in the side rail" icon="sun" summary={railOn ? `Shown, in ${units === 'F' ? 'Fahrenheit' : 'Celsius'}` : 'Hidden'}>
        <div data-testid="weather-settings">
          <SwitchRow
            on={railOn} onChange={() => apply({ weather: { enabled: !railOn } }, railOn ? 'Weather hidden' : 'Weather shown')}
            label="Show the temperature in the rail" note="A small readout under the clock: current temperature and conditions." testId="weather-rail-toggle"
          />
          <SwitchRow
            on={railReadoutOn} onChange={() => apply({ weather: { showInRail: !railReadoutOn } }, railReadoutOn ? 'Weather readout hidden from the rail' : 'Weather readout shown in the rail')}
            label="Also show it in the side rail" note="Turn this off to keep the Weather page but remove the small readout from the side rail." testId="weather-showinrail-toggle"
          />
          <Field label="Units">
            <SegmentedControl ariaLabel="Units" value={units} onChange={(u) => apply({ weather: { units: u } }, `Now in °${u}`)} options={[{ value: 'F', label: '°F (default)' }, { value: 'C', label: '°C' }]} />
          </Field>
          <Field label="Where the weather is for">
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }} data-testid="weather-location">
              {weatherZip || savedZip ? <>Zip code <b style={{ color: colors.accent }}>{weatherZip || savedZip}</b></> : <span style={{ color: colors.danger }}>No zip code set</span>}
            </div>
            <Hint>{weatherZip ? 'This is a different place from the zmanim (set just below).' : 'It uses the same zip code as the zmanim (change it under Location above, then Save).'} Data is from Open-Meteo and refreshes every 30 minutes.</Hint>
          </Field>
          <Field label="Use a different place for the weather" htmlFor="tt-weather-zip" hint="Optional. A 5-digit zip code, for when the weather should be for somewhere other than the school. Empty = the school's zip code.">
            <WeatherZip saved={weatherZip} onApply={(z) => apply({ weather: { zip: z || null } }, z ? `Weather now for ${z}` : 'Weather follows the school zip code')} />
          </Field>
          <Field label="Check it works">
            <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 18px' }} onClick={runTest} disabled={test === 'loading'} data-testid="weather-test">
              {test === 'loading' ? 'Checking...' : 'Test weather now'}
            </button>
            {test && test !== 'loading' && (
              <div data-testid="weather-test-result" role="status" style={{
                marginTop: '10px', fontFamily: adminFonts.englishBody, fontSize: '14px', lineHeight: 1.5, padding: '10px 12px', borderRadius: '8px',
                border: `1px solid ${test.ok ? colors.goldBd : alpha(colors.danger, 53)}`, color: test.ok ? colors.text : colors.danger,
              }}>
                {test.ok ? (
                  <>
                    <div style={{ fontSize: '18px', color: colors.accent }}>{test.temp}°{test.units} · {test.condition}</div>
                    <div style={{ color: colors.dim }}>{test.hi != null && test.lo != null ? `High ${test.hi}° / Low ${test.lo}°` : ''}{test.feels != null ? ` · feels like ${test.feels}°` : ''}</div>
                    <div style={{ color: colors.dim, fontSize: '12px' }}>{test.place ? `${test.place} · ` : ''}zip {test.zip} (saved)</div>
                  </>
                ) : test.error}
              </div>
            )}
            <Hint>The test uses the saved weather zip code.</Hint>
          </Field>
          <Hint>
            The full Weather page is a slide: turn it on or off in{' '}
            <LinkButton onClick={() => onNavigate?.('slides')}>Screen &gt; Slides</LinkButton>.
          </Hint>
        </div>
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={saveAll} saving={form.saving} error={guard || form.error} />
    </Page>
  );
}

/** The weather zip: its own small save (a 5-digit zip or empty), applied at once with Undo. */
function WeatherZip({ saved, onApply }) {
  const [text, setText] = useState(saved);
  useEffect(() => { setText(saved); }, [saved]);
  const bad = text !== '' && !/^\d{5}$/.test(text);
  const dirty = text !== saved;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <input id="tt-weather-zip" data-testid="weather-zip" style={{ ...fieldStyle, width: '140px', ...(bad ? { borderColor: colors.danger } : {}) }} inputMode="numeric" maxLength={5} placeholder="Same as school"
        value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 5))} />
      <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 16px' }} disabled={!dirty || bad} onClick={() => onApply(text)} data-testid="weather-zip-save">Use this zip</button>
      {bad && <span style={{ fontSize: '13px', color: colors.danger }}>Needs 5 digits.</span>}
    </div>
  );
}
