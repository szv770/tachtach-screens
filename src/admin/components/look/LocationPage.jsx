import React, { useState } from 'react';
import { colors, adminFonts, buttonSecondary, alpha } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import SaveBar from '../ui/SaveBar.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import { apiFetch } from '../../hooks/useAdminState.js';
import { Page, Field, Hint, SwitchRow, LinkButton, useSettingsForm, useInstant, fieldStyle, firstSet } from './kit.jsx';

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
  const tz = loc.timezone || 'America/New_York';
  const displayName = loc.displayName || '';
  const all = allTimeZones();
  const rest = all.filter((z) => !COMMON_TZ.includes(z));
  const savedZip = firstSet(settings.location?.zip, settings.zipCode) ?? '';

  const w = settings.weather || {};
  const railOn = w.enabled !== false;
  const units = (w.units || 'F') === 'C' ? 'C' : 'F';
  const [test, setTest] = useState(null);
  const runTest = async () => {
    setTest('loading');
    try { setTest(await apiFetch(`/api/weather/preview?units=${units}`)); } catch (err) { setTest({ ok: false, error: err.message || 'The request failed.' }); }
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
        <Field label="Time zone" htmlFor="tt-timezone" hint="Used for announcement start and end times and repeating days.">
          <select id="tt-timezone" style={{ ...fieldStyle, cursor: 'pointer' }} value={tz} onChange={(e) => form.setIn('location', 'timezone', e.target.value)}>
            {!all.includes(tz) && <option value={tz}>{tz}</option>}
            <optgroup label="Common">{COMMON_TZ.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</optgroup>
            <optgroup label="All">{rest.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</optgroup>
          </select>
        </Field>
      </Collapsible>

      <Collapsible id="set-weather" title="Weather in the side rail" icon="sun" summary={railOn ? `Shown, in ${units === 'F' ? 'Fahrenheit' : 'Celsius'}` : 'Hidden'}>
        <div data-testid="weather-settings">
          <SwitchRow
            on={railOn} onChange={() => apply({ weather: { enabled: !railOn } }, railOn ? 'Weather hidden' : 'Weather shown')}
            label="Show the temperature in the rail" note="A small readout under the clock: current temperature and conditions." testId="weather-rail-toggle"
          />
          <Field label="Units">
            <SegmentedControl ariaLabel="Units" value={units} onChange={(u) => apply({ weather: { units: u } }, `Now in °${u}`)} options={[{ value: 'F', label: '°F (default)' }, { value: 'C', label: '°C' }]} />
          </Field>
          <Field label="Where the weather is for">
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }} data-testid="weather-location">
              {savedZip ? <>Zip code <b style={{ color: colors.accent }}>{savedZip}</b></> : <span style={{ color: colors.danger }}>No zip code set</span>}
            </div>
            <Hint>It uses the same zip code as the zmanim (change it under Location above, then Save). Data is from Open-Meteo and refreshes every 30 minutes.</Hint>
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
            <Hint>The test uses the saved zip code.</Hint>
          </Field>
          <Hint>
            The full Weather page is a slide: turn it on or off in{' '}
            <LinkButton onClick={() => onNavigate?.('slides')}>Screen &gt; Slides</LinkButton>.
          </Hint>
        </div>
      </Collapsible>

      <SaveBar count={form.count} onRevert={form.revert} onSave={form.save} saving={form.saving} error={form.error} />
    </Page>
  );
}
