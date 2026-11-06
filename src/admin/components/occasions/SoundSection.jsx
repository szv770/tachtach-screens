import React, { useState } from 'react';
import { Field, Hint, SwitchRow, Choices } from '../look/kit.jsx';
import { CHIMES, CHIME_LABEL, SOUND_MOMENTS, RANGES } from '../../../shared/occasions.js';
import { btn, small, CommitSlider, TriChoice, playTest } from './occKit.jsx';

const MOMENT_LABEL = { milestone: 'Milestone takeovers', final: 'The final minute', zero: 'The moment it begins', moment: 'Live moments you fire' };

/** Global sound settings: OFF by default. The chime is synthesised on the TV; 'Play test' plays the same notes here. */
export function SoundGlobal({ sound, save, canEdit }) {
  const [msg, setMsg] = useState('');
  const set = (patch, m) => save({ sound: { ...sound, ...patch } }, m);
  const test = () => setMsg(playTest(sound.chime, sound.volume) ? '' : 'This browser cannot play sound.');
  return (
    <div data-testid="occ-sound">
      <SwitchRow on={sound.on} onChange={() => set({ on: !sound.on }, sound.on ? 'Sound off' : 'Sound on')} label="Play a chime" note="Off unless you switch it on. The TV only plays sound once someone has touched it or the browser allows it." testId="occ-sound-on" />
      {sound.on && (
        <>
          <Field label="Which chime"><Choices ariaLabel="Chime" value={sound.chime} onChange={(v) => set({ chime: v }, `Chime: ${CHIME_LABEL[v]}`)} options={CHIMES.map((v) => ({ value: v, label: CHIME_LABEL[v] }))} /></Field>
          <Field label="Volume"><CommitSlider value={sound.volume} min={RANGES.volume.min} max={RANGES.volume.max} step={5} unit="%" ariaLabel="Volume" disabled={!canEdit} onCommit={(n) => set({ volume: n }, `Volume ${n}%`)} /></Field>
          <Field label="Play it at">
            {SOUND_MOMENTS.map((k) => <SwitchRow key={k} on={sound.at[k]} onChange={() => set({ at: { ...sound.at, [k]: !sound.at[k] } }, `${MOMENT_LABEL[k]}: sound ${sound.at[k] ? 'off' : 'on'}`)} label={MOMENT_LABEL[k]} />)}
          </Field>
        </>
      )}
      <button type="button" style={btn(false, { marginTop: 8 })} onClick={test} data-testid="occ-sound-test">Play test</button>
      {msg && <p style={{ ...small, color: 'var(--danger)' }}>{msg}</p>}
      <Hint>The test plays here in your browser with the same notes and volume as the TV. Each occasion can turn sound on or off for itself.</Hint>
    </div>
  );
}

/** Per occasion: follow the global switch, on or off. */
export function SoundOwn({ d, set, sound }) {
  return <TriChoice ariaLabel="Sound for this occasion" value={d.soundOn ?? null} onChange={(v) => set({ soundOn: v })} defaultOn={sound.on} />;
}
