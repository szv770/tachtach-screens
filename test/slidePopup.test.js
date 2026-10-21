import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLIDE_TYPES, popupSpec, SECONDS_MAX } from '../src/admin/components/slides/slideTypes.js';
import { initialValues, splitValues } from '../src/admin/components/slides/slideForm.js';

test('every slide type resolves to a popup spec with name, on/off', () => {
  for (const t of [...SLIDE_TYPES.map((x) => x.id), 'SOMETHING_UNKNOWN']) {
    const s = popupSpec(t);
    assert.ok(s.name && s.onOff, t);
    assert.ok(Array.isArray(s.sections), t);
  }
});

test('every type with a richer page exposes moreSettings; none still uses editGo', () => {
  for (const t of SLIDE_TYPES) {
    assert.equal('editGo' in t, false, t.id);
    if (t.moreSettings) {
      assert.ok(t.moreSettings.section && t.moreSettings.label, t.id);
      assert.deepEqual(popupSpec(t.id).moreSettings, t.moreSettings);
    }
  }
  for (const id of ['GOOGLE_PHOTOS_SLIDE', 'WEB_PAGE', 'RSS_SLIDE', 'SCHEDULE', 'DAILY_WORD']) assert.ok(popupSpec(id).moreSettings, id);
});

test('seconds: shown for all but PDF/messages, with a meaning note', () => {
  for (const t of SLIDE_TYPES) {
    const s = popupSpec(t.id);
    assert.equal(s.seconds, t.id !== 'PDF_SLIDE' && t.id !== 'ANNOUNCEMENT', t.id);
    assert.ok(s.secondsNote.length > 10);
  }
});

test('saving name, seconds and on/off produces the slide patch; limits enforced', () => {
  const slide = { id: 'a', type: 'SCHEDULE', duration: 20 };
  const v = { ...initialValues(slide), label: ' Seder ', duration: '45', enabled: false };
  const { slidePatch } = splitValues(v, ['label', 'duration', 'enabled'], slide);
  assert.deepEqual(slidePatch, { label: 'Seder', duration: 45, enabled: false });
  assert.throws(() => splitValues({ duration: String(SECONDS_MAX + 1) }, ['duration'], slide));
  assert.throws(() => splitValues({ duration: '0' }, ['duration'], slide));
  assert.equal(splitValues({ duration: '0' }, ['duration'], { type: 'VIDEO_SLIDE' }).slidePatch.duration, 0);
});
