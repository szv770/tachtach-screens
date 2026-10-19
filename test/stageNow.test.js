import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStageNow } from '../src/shared/stageNow.js';

const cats = [{ id: 'learning', stages: { inSession: true } }, { id: 'meals' }];
const seder = { id: 's', name: 'Seder', nameHe: 'סדר', time: '09:00', endTime: '09:45', category: 'learning', alertBefore: 5 };
const lunch = { id: 'l', name: 'Lunch', time: '12:00', endTime: '12:30', category: 'meals' };
const at = (h, m = 0, s = 0) => h * 60 + m + s / 60;

test('before the start nothing shows (the countdown is the server alert)', () => {
  const r = computeStageNow({ today: [seder], categories: cats, nowMins: at(8, 58) });
  assert.equal(r.started, null);
  assert.equal(r.session, null);
});

test('just started: default 3 minutes when the block has an alert, then off', () => {
  assert.equal(computeStageNow({ today: [seder], categories: cats, nowMins: at(9, 0) }).started.minsIn, 0);
  assert.ok(computeStageNow({ today: [seder], categories: cats, nowMins: at(9, 2, 59) }).started);
  assert.equal(computeStageNow({ today: [seder], categories: cats, nowMins: at(9, 3) }).started, null);
});

test('a block with no alert and no override has no just-started stage', () => {
  const r = computeStageNow({ today: [lunch], categories: cats, nowMins: at(12, 1) });
  assert.equal(r.started, null);
});

test('entry stages override the category; justStarted 0 turns it off; custom minutes work', () => {
  const off = { ...seder, stages: { justStarted: 0 } };
  assert.equal(computeStageNow({ today: [off], categories: cats, nowMins: at(9, 1) }).started, null);
  const ten = { ...lunch, stages: { justStarted: 10 } };
  assert.ok(computeStageNow({ today: [ten], categories: cats, nowMins: at(12, 9) }).started);
});

test('in session from the start to the end, label ends', () => {
  const r = computeStageNow({ today: [seder], categories: cats, nowMins: at(9, 20) });
  assert.equal(r.session.name, 'Seder');
  assert.equal(r.session.endMins, 9 * 60 + 45);
  assert.equal(r.session.endKind, 'ends');
  assert.equal(computeStageNow({ today: [seder], categories: cats, nowMins: at(9, 45) }).session, null);
});

test('in session only for blocks that turned it on', () => {
  const l = { ...lunch, stages: { inSession: true } };
  assert.ok(computeStageNow({ today: [l], categories: cats, nowMins: at(12, 10) }).session);
  assert.equal(computeStageNow({ today: [lunch], categories: cats, nowMins: at(12, 10) }).session, null);
});

test('no end time: runs until the next block, else no badge', () => {
  const a = { id: 'a', name: 'A', time: '10:00', endTime: '', category: 'learning' };
  const b = { id: 'b', name: 'B', time: '10:40', endTime: '', category: 'meals' };
  const r = computeStageNow({ today: [b, a], categories: cats, nowMins: at(10, 20) });
  assert.equal(r.session.endMins, 10 * 60 + 40);
  assert.equal(r.session.endKind, 'until');
  assert.equal(computeStageNow({ today: [a], categories: cats, nowMins: at(10, 20) }).session, null);
});

test('across midnight: a 23:30-00:30 block is still in session at 00:10 from yesterday', () => {
  const late = { id: 'n', name: 'Night Seder', time: '23:30', endTime: '00:30', category: 'learning', alertBefore: 5 };
  const near = computeStageNow({ today: [], yesterday: [late], categories: cats, nowMins: at(0, 10) });
  assert.equal(near.session.name, 'Night Seder');
  assert.equal(near.session.endMins, 30);
  assert.equal(near.session.startMins, 23 * 60 + 30);
  assert.equal(computeStageNow({ today: [], yesterday: [late], categories: cats, nowMins: at(0, 31) }).session, null);
  // and at 23:45 itself, from today's list
  assert.ok(computeStageNow({ today: [late], categories: cats, nowMins: at(23, 45) }).session);
});

test('the latest-starting block wins when two overlap; disabled and bad times are ignored', () => {
  const a = { id: 'a', name: 'A', time: '09:00', endTime: '10:00', category: 'learning' };
  const b = { id: 'b', name: 'B', time: '09:30', endTime: '09:50', category: 'learning' };
  const off = { id: 'c', name: 'C', time: '09:40', endTime: '09:50', category: 'learning', enabled: false };
  const bad = { id: 'd', name: 'D', time: 'soon', category: 'learning' };
  assert.equal(computeStageNow({ today: [a, b, off, bad], categories: cats, nowMins: at(9, 35) }).session.id, 'b');
  assert.deepEqual(computeStageNow({ nowMins: NaN }), { started: null, session: null });
});
