// Synthesised chimes (src/shared/chime.js) against a fake AudioContext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playChime, chimeDurationMs, gainFor, CHIME_IDS, CHIME_NOTES } from '../src/shared/chime.js';

function fakeCtx(state = 'running') {
  const log = { osc: [], gains: [], resumed: false, closed: false };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state, currentTime: 1, destination: {}, resume() { log.resumed = true; }, close() { log.closed = true; },
    createGain() { const g = { gain: param(), connect() {} }; log.gains.push(g); return g; },
    createOscillator() { const o = { frequency: { value: 0 }, type: '', connect() {}, start() { o.started = true; }, stop() { o.stopped = (o.stopped || 0) + 1; } }; log.osc.push(o); return o; },
  };
  return { ctx, log };
}

test('chimes: every id plays its notes, volume maps to a gain, durations are short', () => {
  assert.deepEqual([...CHIME_IDS].sort(), ['bell', 'fanfare', 'soft']);
  for (const id of CHIME_IDS) {
    const { ctx, log } = fakeCtx();
    const h = playChime(id, 50, () => ctx);
    assert.equal(log.osc.length, CHIME_NOTES[id].length); assert.ok(log.osc.every((o) => o.started));
    assert.ok(h.durationMs > 300 && h.durationMs < 2500, `${id} ${h.durationMs}`); assert.equal(h.durationMs, chimeDurationMs(id));
    assert.equal(log.gains[0].gain.value, gainFor(50));
    h.stop(); h.stop(); assert.ok(log.closed); assert.ok(log.osc.every((o) => o.stopped >= 1));
  }
  assert.ok(gainFor(10) < gainFor(50) && gainFor(50) < gainFor(100) && gainFor(100) <= 0.7); assert.equal(gainFor(1), gainFor(10)); assert.equal(gainFor(999), gainFor(100));
});

test('chimes: never throw; a suspended context is resumed; bad input plays nothing', () => {
  const s = fakeCtx('suspended'); playChime('soft', 40, () => s.ctx); assert.equal(s.log.resumed, true);
  assert.equal(playChime('gong', 40, () => fakeCtx().ctx), null);
  assert.equal(playChime('soft', 40, null), null);
  assert.equal(playChime('soft', 40, () => { throw new Error('no audio'); }), null);
  assert.equal(playChime('soft', 40, () => ({})), null);
  assert.equal(playChime('soft', 40, () => ({ createOscillator() { throw new Error('x'); }, createGain() { throw new Error('x'); } })), null);
  assert.equal(chimeDurationMs('gong'), 0);
});
