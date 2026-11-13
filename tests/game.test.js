import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RANKS } from '../src/js/app/data.js';
import {
  addDays,
  completeItem,
  dayKey,
  ensurePlan,
  levelInfo,
  newState,
  reconcile,
  streakMultiplier,
  workoutXp,
} from '../src/js/app/game.js';

// Local time helper: November 2026, day d at hour h.
const at = (d, h = 8) => new Date(2026, 10, d, h).getTime();

function doDay(state, t) {
  reconcile(state, t);
  const plan = ensurePlan(state, t);
  for (let i = 0; i < plan.items.length; i++) completeItem(state, i, t);
}

test('game day starts at 6 AM', () => {
  assert.equal(dayKey(at(12, 5)), '2026-11-11');
  assert.equal(dayKey(at(12, 6)), '2026-11-12');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('there are 120 unique ranks', () => {
  assert.equal(RANKS.length, 120);
  assert.equal(new Set(RANKS.map((r) => r.name)).size, 120);
});

test('level curve', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(120).level, 2);
  assert.equal(levelInfo(10 ** 9).level, 120);
});

test('finishing all workouts earns XP and a streak day once', () => {
  const s = newState(at(10));
  doDay(s, at(10));
  assert.equal(s.streak, 1);
  assert.ok(s.xp > 0);
  const xp = s.xp;
  assert.equal(completeItem(s, 0, at(10)), null);
  assert.equal(s.xp, xp);
});

test('streak grows and raises XP per workout', () => {
  const s = newState(at(10));
  for (const d of [10, 11, 12]) doDay(s, at(d));
  assert.equal(s.streak, 3);
  assert.ok(s.achievements.streak3);
  s.streak = 20;
  assert.ok(workoutXp(s) > 70);
  assert.equal(streakMultiplier(100), 3);
});

test('missing a day resets the streak and adds a penalty', () => {
  const s = newState(at(10));
  doDay(s, at(10));
  doDay(s, at(11));
  assert.equal(s.streak, 2);
  // Skip day 12 completely, return on day 13.
  const missed = reconcile(s, at(13));
  assert.equal(missed.length, 1);
  assert.equal(s.streak, 0);
  assert.equal(s.penalties, 1);
  const plan = ensurePlan(s, at(13));
  assert.equal(plan.items.length, 4);
  assert.ok(plan.items[3].penalty);
});

test('a day only counts when the penalty is also done', () => {
  const s = newState(at(10));
  reconcile(s, at(11));
  ensurePlan(s, at(11));
  for (let i = 0; i < 3; i++) completeItem(s, i, at(11));
  assert.equal(s.streak, 0);
  completeItem(s, 3, at(11));
  assert.equal(s.streak, 1);
  assert.equal(s.penalties, 0);
  assert.ok(s.achievements.penalty);
});

test('the first day is never penalized', () => {
  const s = newState(at(10));
  assert.deepEqual(reconcile(s, at(10)), []);
  assert.equal(s.penalties, 0);
});
