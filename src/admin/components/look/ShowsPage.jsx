import React, { useState, useEffect } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Collapsible from '../ui/Collapsible.jsx';
import { SIDE_NOTES_DEFAULT_MAX, SIDE_NOTES_DEFAULT_SECONDS, SIDE_NOTES_MIN_SECONDS, SIDE_NOTES_MAX_SECONDS, sideNotesLimits } from '../../../shared/railNotes.js';
import { POST_STYLES, POST_STYLE_LABEL, DEFAULT_POST_STYLE, postStyle } from '../../../shared/postDefaults.js';
import { Page, Field, Hint, SwitchRow, Choices, useInstant, fieldStyle } from './kit.jsx';

const VIS = [
  { key: 'clock', label: 'Clock', note: 'The digital clock' },
  { key: 'hebrewDate', label: 'Hebrew date', note: 'The Jewish calendar date' },
  { key: 'parsha', label: 'Parsha', note: 'This week\'s Torah portion' },
  { key: 'omer', label: 'Omer counter', note: 'The Sefiras HaOmer count (only during the 49 days)' },
  { key: 'pinnedNotes', label: 'Side notes', note: 'Announcements shown as notes in the side rail' },
  { key: 'upNext', label: 'Up-next card', note: 'The card that appears just before a schedule item starts (its timing is set below)' },
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

  const notesLim = sideNotesLimits(settings);
  const [secs, setSecs] = useState(String(notesLim.seconds));
  useEffect(() => { setSecs(String(notesLim.seconds)); }, [notesLim.seconds]);
  const commitSecs = () => {
    const n = Math.max(SIDE_NOTES_MIN_SECONDS, Math.min(SIDE_NOTES_MAX_SECONDS, Math.round(Number(secs) || notesLim.seconds)));
    setSecs(String(n));
    if (n !== notesLim.seconds) apply({ rail: { sideNotesSeconds: n } }, `Side notes now change every ${n} s`);
  };
  const upNextOn = vis.upNext !== false;
  const postMode = postStyle(settings);

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

      <Collapsible id="look-side-notes" title="Side notes" icon="tile" summary={vis.pinnedNotes === false ? 'Hidden' : `${notesLim.max} at once, change every ${notesLim.seconds} s`}>
        <Field label="Notes shown at once" hint={`How many side notes the rail shows together (default ${SIDE_NOTES_DEFAULT_MAX}). More than this take turns. The rail has room for two.`}>
          <Choices ariaLabel="Side notes shown at once" value={notesLim.max} onChange={(n) => apply({ rail: { sideNotesMax: n } }, `Showing ${n} side note${n === 1 ? '' : 's'} at once`)} options={[{ value: 1, label: '1' }, { value: 2, label: '2 (default)' }]} />
        </Field>
        <Field label="Seconds before the next note" htmlFor="tt-notes-secs" hint="Only matters when there are more notes than fit at once.">
          <input
            id="tt-notes-secs" type="number" inputMode="numeric" min={SIDE_NOTES_MIN_SECONDS} max={SIDE_NOTES_MAX_SECONDS} style={{ ...fieldStyle, maxWidth: '120px' }} value={secs}
            onChange={(e) => setSecs(e.target.value)} onBlur={commitSecs} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span style={{ marginLeft: '10px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>seconds ({SIDE_NOTES_MIN_SECONDS} to {SIDE_NOTES_MAX_SECONDS}, default {SIDE_NOTES_DEFAULT_SECONDS})</span>
        </Field>
        <Hint>Which announcements are side notes, and their order, is set under Announcements.</Hint>
      </Collapsible>

      <Collapsible id="look-up-next" title="Up-next card" icon="clock" summary={upNextOn ? `Appears ${savedMin} min before an item${settings.rail?.upNextCountdown ? ', live countdown' : ''}` : 'Hidden'}>
        <Field label="Minutes before a schedule item" htmlFor="tt-upnext" hint="The card shows in the side rail only within this window, and never on the schedule page.">
          <input
            id="tt-upnext" type="number" inputMode="numeric" min="1" max="60" style={{ ...fieldStyle, maxWidth: '120px' }} value={mins}
            onChange={(e) => setMins(e.target.value)} onBlur={commitMins} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span style={{ marginLeft: '10px', fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>minutes (default 5)</span>
        </Field>
        <SwitchRow
          on={!!settings.rail?.upNextCountdown} label="Live countdown on the card" testId="upnext-countdown"
          note="Shows the time left, switching to minutes and seconds ticking down in the last 3 minutes."
          onChange={() => apply({ rail: { upNextCountdown: !settings.rail?.upNextCountdown } }, `Up-next countdown ${settings.rail?.upNextCountdown ? 'off' : 'on'}`)}
        />
      </Collapsible>

      <Collapsible id="set-post-button" title="Post button" icon="bolt" summary={POST_STYLE_LABEL[postMode]}>
        <Field label="Post button style" hint={`The + button (and New on a computer). "${POST_STYLE_LABEL.sheet}" opens one sheet: type, see how it will look, post. "${POST_STYLE_LABEL.classic}" is the older menu of Quick message, Announcement, Banner and Takeover. Default: ${POST_STYLE_LABEL[DEFAULT_POST_STYLE]}. You can switch back any time.`}>
          <Choices ariaLabel="Post button style" value={postMode} onChange={(v) => apply({ post: { style: v } }, `Post button: ${POST_STYLE_LABEL[v]}`)} options={POST_STYLES.map((v) => ({ value: v, label: POST_STYLE_LABEL[v] }))} />
        </Field>
        <Hint>This applies to everyone on this screen. Everything the old cards could do is still there under More options.</Hint>
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
