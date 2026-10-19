import React, { useState, useEffect } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { Page, Field, Hint, SwitchRow, Choices, useInstant, fieldStyle } from './kit.jsx';

const VIS = [
  { key: 'clock', label: 'Clock', note: 'The digital clock' },
  { key: 'hebrewDate', label: 'Hebrew date', note: 'The Jewish calendar date' },
  { key: 'parsha', label: 'Parsha', note: 'This week\'s Torah portion' },
  { key: 'omer', label: 'Omer counter', note: 'The Sefiras HaOmer count (only during the 49 days)' },
  { key: 'pinnedNotes', label: 'Side notes', note: 'Announcements shown as notes in the side rail' },
];
const ITEMS = [
  { key: 'chumash', label: 'Chumash' },
  { key: 'tehillim', label: 'Tehillim' },
  { key: 'tanya', label: 'Tanya' },
  { key: 'rambam1', label: 'Rambam - 1 chapter' },
  { key: 'rambam3', label: 'Rambam - 3 chapters' },
  { key: 'sefer', label: 'Sefer HaMitzvos (daily mitzvah)' },
];
const LANGS = [{ value: 'both', label: 'Both' }, { value: 'hebrew', label: 'Hebrew only' }, { value: 'english', label: 'English only' }];
const langLabel = (v) => LANGS.find((l) => l.value === v)?.label || 'Both';

/** What appears in the side rail and the language of the study slides. Everything applies at once. */
export default function ShowsPage({ settings = {}, onSave }) {
  const apply = useInstant(settings, onSave);
  const vis = settings.visibility || {};
  const shownCount = VIS.filter((v) => vis[v.key] !== false).length;
  const itemsOn = ITEMS.filter((i) => settings.limudimItems?.[i.key] !== false);
  const limLang = settings.limudimLang || 'both';
  const hyLang = settings.hayomYomLang || 'both';

  const savedMin = Number(settings.rail?.upNextMinutes) > 0 ? Number(settings.rail.upNextMinutes) : 5;
  const [mins, setMins] = useState(String(savedMin));
  useEffect(() => { setMins(String(savedMin)); }, [savedMin]);
  const commitMins = () => {
    const n = Math.max(1, Math.min(60, Math.round(Number(mins) || savedMin)));
    setMins(String(n));
    if (n !== savedMin) apply({ rail: { upNextMinutes: n } }, `Up-next now ${n} min`);
  };

  return (
    <Page intro="What the screen shows around the slides, and the languages of the study pages. Changes apply as soon as you tap them.">
      <Collapsible id="set-visibility" title="Side rail items" icon="tile" summary={`${shownCount} of ${VIS.length} shown`}>
        {VIS.map((it) => (
          <SwitchRow
            key={it.key} on={vis[it.key] !== false} label={it.label} note={it.note} testId={`vis-${it.key}`}
            onChange={() => apply({ visibility: { [it.key]: vis[it.key] === false } }, `${it.label} ${vis[it.key] === false ? 'shown' : 'hidden'}`)}
          />
        ))}
      </Collapsible>

      <Collapsible id="look-up-next" title="Up-next card" icon="clock" summary={`Appears ${savedMin} min before an item`}>
        <Field label="Minutes before a schedule item" htmlFor="tt-upnext" hint="The card shows in the side rail only within this window, and never on the schedule page.">
          <input
            id="tt-upnext" type="number" inputMode="numeric" min="1" max="60" style={{ ...fieldStyle, maxWidth: '120px' }} value={mins}
            onChange={(e) => setMins(e.target.value)} onBlur={commitMins} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span style={{ marginLeft: '10px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>minutes (default 5)</span>
        </Field>
      </Collapsible>

      <Collapsible id="set-daily-study-slide" title="Daily study slide" icon="word" summary={`${langLabel(limLang)} - ${itemsOn.length} of ${ITEMS.length} items`}>
        <Field label="Language" hint="Both shows Hebrew and English. The others show only that language.">
          <Choices ariaLabel="Study language" value={limLang} onChange={(v) => apply({ limudimLang: v }, 'Study language changed')} options={LANGS} />
        </Field>
        <Field label="Items to show">
          {ITEMS.map((it) => (
            <SwitchRow
              key={it.key} on={settings.limudimItems?.[it.key] !== false} label={it.label} testId={`limudim-${it.key}`}
              onChange={() => apply({ limudimItems: { [it.key]: settings.limudimItems?.[it.key] === false } }, `${it.label} ${settings.limudimItems?.[it.key] === false ? 'shown' : 'hidden'}`)}
            />
          ))}
        </Field>
      </Collapsible>

      <Collapsible id="set-hayom-yom-language" title="Hayom Yom language" icon="word" summary={langLabel(hyLang)}>
        <Field label="Language" hint="Hayom Yom is the daily Chasidic teaching. Choose which language(s) the slide shows.">
          <Choices ariaLabel="Hayom Yom language" value={hyLang} onChange={(v) => apply({ hayomYomLang: v }, 'Hayom Yom language changed')} options={LANGS} />
        </Field>
        <Hint>The Daily Word and other slides are switched on and off in Screen &gt; Slides.</Hint>
      </Collapsible>
    </Page>
  );
}
