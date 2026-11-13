// Game rules and storage. Pure logic: no DOM, so it can be unit tested in Node.
import {
  ACHIEVEMENTS,
  BODY,
  BY_ID,
  GYM,
  PENALTY,
  PENALTY_XP,
  rankFor,
} from './data.js';

const KEY = 'levelup-fit-v1';
export const DAY_START_HOUR = 6; // a "game day" runs 6:00 AM to 6:00 AM
export const MAX_LEVEL = 120;
export const REST_SECONDS = 30;
export const PERFECT_BONUS = 40;
const MAX_PENALTIES = 3;

/* ---------- Dates (game day starts at 6 AM) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const dayKey = (ms) => fmt(new Date(ms - DAY_START_HOUR * 3600000));

export const addDays = (key, n) => {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

export const weekday = (key) => parse(key).getDay();

export function nextReset(ms) {
  const d = new Date(ms);
  const r = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    DAY_START_HOUR,
  );
  if (r.getTime() <= ms) r.setDate(r.getDate() + 1);
  return r.getTime();
}

export const getNow = (state) => Date.now() + (state.devOffset || 0);

/* ---------- Levels and XP ---------- */
const need = (level) => 120 + 30 * (level - 1);

export function levelInfo(xp) {
  let level = 1;
  let floor = 0;
  while (level < MAX_LEVEL && xp >= floor + need(level)) {
    floor += need(level);
    level += 1;
  }
  if (level >= MAX_LEVEL)
    return { level, into: xp - floor, span: xp - floor || 1, pct: 1 };
  const into = xp - floor;
  return { level, into, span: need(level), pct: into / need(level) };
}

// 1.0x with no streak, +5% per streak day, capped at 3.0x at 40 days.
export const streakMultiplier = (streak) => 1 + Math.min(streak, 40) * 0.05;

export const workoutXp = (state) =>
  Math.round(
    (40 + levelInfo(state.xp).level * 0.6) * streakMultiplier(state.streak),
  );

/* ---------- Difficulty ---------- */
export const targetFor = (ex, level) =>
  Math.min(ex.max, ex.base + Math.floor((level - 1) / 3) * ex.step);

export const setsFor = (level) => Math.min(5, 3 + Math.floor((level - 1) / 40));

/* ---------- State ---------- */
export function newState(now = Date.now()) {
  return {
    version: 1,
    createdAt: now,
    devOffset: 0,
    settings: { mode: 'body' },
    xp: 0,
    streak: 0,
    bestStreak: 0,
    // The first day never counts as missed.
    reconciledThrough: addDays(dayKey(now), -1),
    penalties: 0,
    plan: null,
    days: {},
    history: [],
    totals: { workouts: 0, gym: 0, fullDays: 0, penaltiesDone: 0 },
    missedDays: 0,
    achievements: {},
  };
}

export function load() {
  const fresh = newState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        ...fresh,
        ...saved,
        settings: { ...fresh.settings, ...saved.settings },
        totals: { ...fresh.totals, ...saved.totals },
      };
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
  return fresh;
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the game still runs for this visit */
  }
}

/* ---------- Daily plan ---------- */
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = {
  body: [0, 1, 2].map((s) => BODY.filter((e) => e.slot === s)),
  gym: [0, 1, 2].map((s) => GYM.filter((e) => e.slot === s)),
};

function makePlan(day, mode, level) {
  const rand = seeded(`${day}:${mode}`);
  const sets = setsFor(level);
  const items = POOLS[mode].map((pool, slot) => {
    const ex = pool[Math.floor(rand() * pool.length)];
    return {
      slot,
      exId: ex.id,
      sets,
      value: targetFor(ex, level),
      done: false,
    };
  });
  return { day, mode, items };
}

function penaltyItem(mode, level) {
  const ex = PENALTY[mode];
  return {
    slot: 3,
    exId: ex.id,
    sets: 3,
    value: targetFor(ex, level),
    done: false,
    penalty: true,
  };
}

export function ensurePlan(state, now) {
  const day = dayKey(now);
  const level = levelInfo(state.xp).level;
  if (!state.plan || state.plan.day !== day) {
    state.plan = makePlan(day, state.settings.mode, level);
  }
  if (state.penalties > 0 && !state.plan.items.some((i) => i.penalty)) {
    state.plan.items.push(penaltyItem(state.settings.mode, level));
  }
  return state.plan;
}

// Changing mode swaps today's plan only if nothing is done yet.
export function setMode(state, mode, now) {
  state.settings.mode = mode;
  const started = state.plan?.items.some((i) => i.done);
  if (!started) state.plan = null;
  ensurePlan(state, now);
  return !started;
}

/* ---------- Missed days and penalties ---------- */
// Any closed day that was not fully completed resets the streak and
// adds a penalty workout (up to 3 owed at once).
export function reconcile(state, now) {
  const lastClosed = addDays(dayKey(now), -1);
  const missed = [];
  let d = addDays(state.reconciledThrough, 1);
  let guard = 0;
  while (d <= lastClosed && guard++ < 400) {
    if (!state.days[d]?.full) {
      state.streak = 0;
      state.missedDays += 1;
      state.penalties = Math.min(MAX_PENALTIES, state.penalties + 1);
      missed.push(d);
    }
    d = addDays(d, 1);
  }
  if (state.reconciledThrough < lastClosed)
    state.reconciledThrough = lastClosed;
  return missed;
}

/* ---------- Completing a workout ---------- */
export function completeItem(state, index, now) {
  const plan = ensurePlan(state, now);
  const item = plan.items[index];
  if (!item || item.done) return null;

  const levelBefore = levelInfo(state.xp).level;
  const ex = BY_ID[item.exId];
  const multiplier = streakMultiplier(state.streak);

  let gain = item.penalty
    ? PENALTY_XP
    : Math.round((40 + levelBefore * 0.6) * multiplier);
  let bonus = 0;
  item.done = true;

  const rec = state.days[plan.day] ?? { done: 0, full: false, xp: 0 };
  state.days[plan.day] = rec;
  rec.done += 1;

  if (item.penalty) {
    state.penalties = Math.max(0, state.penalties - 1);
    state.totals.penaltiesDone += 1;
  } else {
    state.totals.workouts += 1;
    if (plan.mode === 'gym') state.totals.gym += 1;
  }

  const full = plan.items.every((i) => i.done);
  if (full && !rec.full) {
    rec.full = true;
    bonus = Math.round(PERFECT_BONUS * multiplier);
    gain += bonus;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.totals.fullDays += 1;
  }

  state.xp += gain;
  rec.xp += gain;
  state.history.unshift({
    t: now,
    day: plan.day,
    name: ex.name,
    penalty: !!item.penalty,
    xp: gain,
    mode: plan.mode,
  });
  state.history.length = Math.min(state.history.length, 300);

  const levelAfter = levelInfo(state.xp).level;
  const newAch = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.test(state, levelAfter)) {
      state.achievements[a.id] = now;
      newAch.push(a);
    }
  }

  return {
    gain,
    bonus,
    full: full && bonus > 0,
    leveledUp: levelAfter > levelBefore,
    level: levelAfter,
    rank: rankFor(levelAfter),
    newAch,
  };
}
