import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREEN_COMMANDS, SCREEN_COMMAND_DONE, isScreenCommand } from '../src/shared/screenCommands.js';
import { canDo, effectiveCaps, PRESETS } from '../src/shared/permissions.js';
import { setScreenState, followPayload, getScreenState } from '../src/server/screenState.js';

test('the real-screen command allow-list includes previous and is validated', () => {
  assert.deepEqual(SCREEN_COMMANDS, ['pause', 'resume', 'blank', 'advance', 'previous']);
  for (const a of SCREEN_COMMANDS) { assert.ok(isScreenCommand(a)); assert.ok(SCREEN_COMMAND_DONE[a]); }
  for (const bad of ['reboot', 'PREVIOUS', '', null, undefined, 'previous/../x', {}]) assert.equal(isScreenCommand(bad), false);
  assert.equal(SCREEN_COMMAND_DONE.advance, 'TV moved to next slide');
});

test('every screen command needs screen.control: view-only is refused, full editor and admin allowed', () => {
  const viewOnly = { role: 'editor', preset: 'view' };
  const messages = { role: 'editor', preset: 'messages' };     // has screen.control
  const full = { role: 'editor' };
  assert.ok(PRESETS.view, 'view preset exists');
  for (const a of SCREEN_COMMANDS) {
    const p = `/api/screen/${a}`;
    assert.equal(canDo(viewOnly, 'POST', p), false, `view-only ${a}`);
    assert.equal(canDo(messages, 'POST', p), true, `messages ${a}`);
    assert.equal(canDo(full, 'POST', p), true, `full ${a}`);
    assert.equal(canDo('admin', 'POST', p), true, `admin ${a}`);
    assert.equal(canDo({ role: 'editor', preset: 'messages', overrides: { grant: [], deny: ['screen.control'] } }, 'POST', p), false);
  }
  assert.ok(!effectiveCaps(viewOnly).includes('screen.control'));
});

test('screen report: server stamps its own clock, caps and cleans the list, only known holds', () => {
  const before = Date.now();
  setScreenState({ slideIndex: 2, slideId: 'c', isPaused: false, durationMs: 15000.4, held: true, heldBy: 'takeover', overlay: 'countdown',
    slides: [{ id: 'a', ms: 1000 }, { id: 'b', ms: 2000 }, { id: 'c', ms: 15000 }] });
  const p = followPayload();
  assert.equal(p.slideId, 'c'); assert.equal(p.index, 2);
  assert.ok(p.startedAt >= before && p.startedAt <= Date.now());
  assert.equal(p.durationMs, 15000); assert.equal(p.held, true); assert.equal(p.heldBy, 'takeover'); assert.equal(p.overlay, 'countdown');
  assert.equal(p.slides.length, 3);
  assert.ok(p.elapsedMs >= 0 && p.elapsedMs < 2000);
  // hostile input
  setScreenState({ slideIndex: 0, slideId: 'a', durationMs: -5, held: 'yes', heldBy: 'rm -rf', overlay: 'x', slides: [{ id: 'a', ms: -1 }] });
  const q = followPayload();
  assert.equal(q.durationMs, null); assert.equal(q.held, false); assert.equal(q.heldBy, null); assert.equal(q.overlay, null); assert.deepEqual(q.slides, []);
  // a display-only report does not count as a slide report
  const at = getScreenState().reportedAt;
  setScreenState({ display: { width: 1920, height: 1080, dpr: 1, orientation: 'landscape', canvas: { width: 1600, height: 900 } } });
  assert.equal(getScreenState().reportedAt, at);
  // admin pause/resume (isPaused only) does not restamp the slide timer
  const st = followPayload().startedAt;
  setScreenState({ isPaused: true });
  assert.equal(followPayload().startedAt, st);
});
