import '@fontsource-variable/inter';
import '../../styles/main.css';
import '../../styles/app.css';
import { badgeSvg } from './badges.js';
import {
  ACHIEVEMENTS,
  BY_ID,
  PENALTY_XP,
  RANKS,
  rankFor,
  SLOTS,
  TIERS,
} from './data.js';
import { burst, floatText, toast } from './effects.js';
import {
  addDays,
  completeItem,
  dayKey,
  ensurePlan,
  getNow,
  levelInfo,
  load,
  newState,
  nextReset,
  REST_SECONDS,
  reconcile,
  save,
  setMode,
  streakMultiplier,
  weekday,
  workoutXp,
} from './game.js';

let state = load();
let view = 'today';
let session = null;
let timer = 0;
let resetArmed = 0;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const now = () => getNow(state);

const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

const unit = (ex) => (ex.kind === 'time' ? 'sec' : 'reps');
const targetText = (item) =>
  `${item.sets} × ${item.value} ${unit(BY_ID[item.exId])}`;
const planFull = () => state.plan.items.every((i) => i.done);

function sync() {
  const missed = reconcile(state, now());
  ensurePlan(state, now());
  save(state);
  return missed;
}

/* ---------- Views ---------- */
function viewToday() {
  const lv = levelInfo(state.xp);
  const rank = rankFor(lv.level);
  const items = state.plan.items;
  const done = items.filter((i) => i.done).length;
  const mult = streakMultiplier(state.streak);
  const xp = workoutXp(state);

  const cards = items
    .map((item, i) => {
      const ex = BY_ID[item.exId];
      const label = item.penalty ? 'Penalty' : SLOTS[item.slot];
      const reward = item.penalty ? PENALTY_XP : xp;
      const action = item.done
        ? '<span class="check" aria-label="Completed">✓</span>'
        : `<button class="btn" type="button" data-start="${i}">Start<small>+${reward} XP</small></button>`;
      return `<article class="workout${item.done ? ' done' : ''}${item.penalty ? ' penalty' : ''}">
        <div class="w-icon" aria-hidden="true">${ex.icon}</div>
        <div class="w-body">
          <p class="eyebrow">${label}</p>
          <h3>${ex.name}</h3>
          <p class="w-target">${targetText(item)}</p>
          <p class="muted">${ex.tip}</p>
        </div>
        <div class="w-action">${action}</div>
      </article>`;
    })
    .join('');

  const pips = items
    .map((i) => `<span class="pip${i.done ? ' on' : ''}"></span>`)
    .join('');

  return `
    <section class="hero glass" style="--h:${rank.hue}">
      <div class="ring" style="--p:${lv.pct.toFixed(4)}">${badgeSvg(rank)}</div>
      <div class="hero-info">
        <p class="eyebrow">Level ${lv.level} · ${rank.tier}</p>
        <h1>${rank.name}</h1>
        <div class="xpbar" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="${lv.span}" aria-valuenow="${lv.into}"><span style="width:${(lv.pct * 100).toFixed(1)}%"></span></div>
        <p class="xpnums">${lv.into} / ${lv.span} XP</p>
      </div>
    </section>

    <section class="chips">
      <div class="stat glass"><span class="stat-icon">🔥</span><b>${state.streak}</b><small>day streak</small></div>
      <div class="stat glass"><span class="stat-icon">✖️</span><b>${mult.toFixed(2)}x</b><small>XP bonus</small></div>
      <div class="stat glass countdown"><span class="stat-icon">⏳</span><b data-countdown>--</b><small>${planFull() ? 'until new quests' : 'left today'}</small></div>
    </section>

    ${
      items.some((i) => i.penalty && !i.done)
        ? `<p class="banner" role="status">💀 You missed a day. Finish your penalty workout along with today's quests to restart your streak.</p>`
        : ''
    }

    <section class="quests">
      <div class="quests-head"><h2>Today's quests</h2><div class="pips" aria-label="${done} of ${items.length} done">${pips}</div></div>
      ${cards}
    </section>`;
}

function heatmap() {
  const today = dayKey(now());
  const start = addDays(today, -(11 * 7 + weekday(today)));
  let cells = '';
  for (let i = 0; i < 84; i++) {
    const day = addDays(start, i);
    if (day > today) {
      cells += '<span class="cell future"></span>';
      continue;
    }
    const rec = state.days[day];
    const n = rec ? Math.min(rec.done, 4) : 0;
    cells += `<span class="cell l${n}${rec?.full ? ' full' : ''}" title="${day}: ${rec ? rec.done : 0} workouts"></span>`;
  }
  return `<div class="heatmap" role="img" aria-label="Workout activity for the last 12 weeks">${cells}</div>`;
}

function viewProgress() {
  const t = state.totals;
  const tiles = [
    ['⭐', state.xp.toLocaleString(), 'total XP'],
    ['💪', t.workouts, 'workouts'],
    ['🔥', state.streak, 'current streak'],
    ['🏅', state.bestStreak, 'best streak'],
    ['🌟', t.fullDays, 'perfect days'],
    ['⚖️', t.penaltiesDone, 'penalties served'],
    ['💀', state.missedDays, 'days missed'],
    ['🎖️', Object.keys(state.achievements).length, 'achievements'],
  ]
    .map(
      ([icon, value, label]) =>
        `<div class="tile glass"><span>${icon}</span><b>${value}</b><small>${label}</small></div>`,
    )
    .join('');

  const history = state.history.length
    ? state.history
        .slice(0, 12)
        .map((h) => {
          const date = new Date(h.t).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });
          return `<li class="${h.penalty ? 'pen' : ''}"><span>${h.penalty ? '💀' : '✅'} ${h.name}</span><span class="muted">${date}</span><b>+${h.xp} XP</b></li>`;
        })
        .join('')
    : '<li class="muted">No workouts yet. Your history will show up here.</li>';

  return `
    <h2 class="view-title">Your progress</h2>
    <section class="tiles">${tiles}</section>
    <section class="glass pad">
      <h3>Last 12 weeks</h3>
      ${heatmap()}
      <p class="muted small">Brighter squares mean more workouts. A gold border means a perfect day.</p>
    </section>
    <section class="glass pad">
      <h3>Recent workouts</h3>
      <ul class="history">${history}</ul>
    </section>`;
}

function viewRanks() {
  const lv = levelInfo(state.xp).level;
  const tiers = TIERS.map(
    (t, ti) => `
      <section class="tier" style="--h:${t.hue}">
        <h3>${t.icon} ${t.name}</h3>
        <p class="muted small">Levels ${ti * 10 + 1} to ${ti * 10 + 10}</p>
        <div class="rank-grid">
          ${RANKS.slice(ti * 10, ti * 10 + 10)
            .map(
              (
                r,
              ) => `<div class="rank${r.level === lv ? ' current' : ''}${r.level > lv ? ' locked' : ''}">
                ${badgeSvg(r, { locked: r.level > lv })}
                <p>${r.name}</p>
              </div>`,
            )
            .join('')}
        </div>
      </section>`,
  ).join('');

  const ach = ACHIEVEMENTS.map((a) => {
    const got = state.achievements[a.id];
    return `<div class="ach glass${got ? ' got' : ''}"><span class="ach-icon">${got ? a.icon : '🔒'}</span><div><b>${a.name}</b><small>${a.desc}</small></div></div>`;
  }).join('');

  return `
    <h2 class="view-title">Ranks and badges</h2>
    <p class="muted">120 ranks to earn. You are level ${lv}.</p>
    <h3>Achievements</h3>
    <section class="ach-grid">${ach}</section>
    ${tiers}`;
}

function viewSettings() {
  const m = state.settings.mode;
  return `
    <h2 class="view-title">Settings</h2>
    <fieldset class="mode glass pad">
      <legend>Workout style</legend>
      <label class="mode-opt"><input type="radio" name="mode" value="body"${m === 'body' ? ' checked' : ''}><span><b>🏠 Bodyweight</b><small>No equipment. Train anywhere.</small></span></label>
      <label class="mode-opt"><input type="radio" name="mode" value="gym"${m === 'gym' ? ' checked' : ''}><span><b>🏋️ Gym</b><small>Barbells, dumbbells, cables, machines.</small></span></label>
    </fieldset>
    <section class="glass pad stack">
      <h3>Your data</h3>
      <p class="muted small">Everything is saved on this device only.</p>
      <div class="row">
        <button class="btn btn-ghost" type="button" data-action="export">Export backup</button>
        <button class="btn btn-ghost danger" type="button" data-action="reset">Reset everything</button>
      </div>
    </section>
    <details class="glass pad">
      <summary>Developer tools</summary>
      <p class="muted small">Skip ahead to the next 6 AM to test streaks and penalties.</p>
      <button class="btn btn-ghost" type="button" data-action="skip-day">Skip to next day</button>
    </details>`;
}

const VIEWS = {
  today: viewToday,
  progress: viewProgress,
  ranks: viewRanks,
  settings: viewSettings,
};

function render() {
  $('#app').innerHTML = VIEWS[view]();
  for (const tab of $$('.tab')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const lv = levelInfo(state.xp).level;
  $('#header-chips').innerHTML =
    `<span class="chip">Lv ${lv}</span><span class="chip">🔥 ${state.streak}</span>`;
  tick();
}

/* ---------- Dialogs ---------- */
function openNotice(icon, title, html) {
  $('#notice-body').innerHTML =
    `<p class="big-icon">${icon}</p><h2>${title}</h2>${html}`;
  $('#notice').showModal();
}

function showMissed(missed) {
  if (!missed.length) return;
  const n = missed.length;
  openNotice(
    '💀',
    n > 1 ? `You missed ${n} days` : 'You missed a day',
    `<p>Your streak is back to zero and a penalty workout is waiting in today's quests. Finish it with your regular workouts and start building again.</p>`,
  );
}

function showLevelUp(rank) {
  const el = $('#levelup');
  el.style.setProperty('--h', rank.hue);
  el.innerHTML = `<div class="lu-card glass">
    <p class="eyebrow">Level up</p>
    <div class="lu-badge">${badgeSvg(rank)}</div>
    <h2 id="lu-title">${rank.name}</h2>
    <p class="muted">Level ${rank.level} · ${rank.tier} tier</p>
    <button class="btn btn-lg" type="button" data-action="close-levelup">Keep going</button>
  </div>`;
  el.hidden = false;
  $('[data-action="close-levelup"]', el).focus();
  burst(innerWidth / 2, innerHeight / 2.5, 260);
}

/* ---------- Guided workout session ---------- */
function startSession(index) {
  const item = state.plan.items[index];
  if (!item || item.done) return;
  session = { index, set: 1, phase: 'ready', left: 0 };
  $('#session').showModal();
  renderSession();
}

function renderSession() {
  const item = state.plan.items[session.index];
  const ex = BY_ID[item.exId];
  const isTime = ex.kind === 'time';
  let body = '';

  if (session.phase === 'ready') {
    body = `<p class="big">${item.value}<small> ${unit(ex)}</small></p>
      <p class="muted">${ex.tip}</p>
      <button class="btn btn-lg" type="button" data-action="primary">${isTime ? 'Start timer' : 'Set done'}</button>`;
  } else if (session.phase === 'timer') {
    body = `<p class="big"><span data-left>${session.left}</span><small> sec</small></p>
      <p class="muted">Stay strong. You have got this.</p>
      <button class="btn btn-ghost" type="button" data-action="primary">Done early</button>`;
  } else {
    body = `<p class="eyebrow">Rest</p>
      <p class="big"><span data-left>${session.left}</span><small> sec</small></p>
      <button class="btn btn-ghost" type="button" data-action="skip-rest">Skip rest</button>`;
  }

  $('#session-body').innerHTML = `
    <button class="x" type="button" data-close aria-label="Close">✕</button>
    <p class="big-icon" aria-hidden="true">${ex.icon}</p>
    <h2>${ex.name}</h2>
    <p class="eyebrow">Set ${session.set} of ${item.sets}</p>
    ${body}
    <button class="link" type="button" data-action="finish-now">I already finished this one</button>`;
}

function runTimer(seconds, onDone) {
  clearInterval(timer);
  session.left = seconds;
  timer = setInterval(() => {
    session.left -= 1;
    const el = $('[data-left]');
    if (el) el.textContent = session.left;
    if (session.left <= 0) {
      clearInterval(timer);
      onDone();
    }
  }, 1000);
}

function setDone() {
  const item = state.plan.items[session.index];
  if (session.set >= item.sets) {
    finishSession();
    return;
  }
  session.set += 1;
  session.phase = 'rest';
  renderSession();
  runTimer(REST_SECONDS, () => {
    session.phase = 'ready';
    renderSession();
  });
}

function onPrimary() {
  const item = state.plan.items[session.index];
  if (session.phase === 'ready' && BY_ID[item.exId].kind === 'time') {
    session.phase = 'timer';
    renderSession();
    runTimer(item.value, setDone);
    return;
  }
  clearInterval(timer);
  setDone();
}

function finishSession() {
  clearInterval(timer);
  const index = session.index;
  $('#session').close();
  const result = completeItem(state, index, now());
  if (result) celebrate(result);
}

function celebrate(r) {
  save(state);
  render();
  floatText(`+${r.gain} XP`);
  burst(innerWidth / 2, innerHeight / 2, r.full ? 220 : 90);
  if (r.full)
    toast(
      `Perfect day! +${r.bonus} bonus XP. Streak ${state.streak} 🔥`,
      'good',
    );
  for (const a of r.newAch) toast(`${a.icon} Achievement: ${a.name}`, 'good');
  if (r.leveledUp) showLevelUp(r.rank);
}

/* ---------- Events ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `levelup-fit-${dayKey(now())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const ACTIONS = {
  primary: onPrimary,
  'skip-rest': () => {
    clearInterval(timer);
    session.phase = 'ready';
    renderSession();
  },
  'finish-now': finishSession,
  'close-levelup': () => {
    $('#levelup').hidden = true;
  },
  export: exportData,
  'skip-day': () => {
    state.devOffset += nextReset(now()) - now() + 1000;
    const missed = sync();
    render();
    toast('Skipped to the next day');
    showMissed(missed);
  },
  reset: (btn) => {
    if (Date.now() - resetArmed > 4000) {
      resetArmed = Date.now();
      btn.textContent = 'Tap again to confirm';
      return;
    }
    state = newState();
    sync();
    view = 'today';
    render();
    toast('Fresh start. Good luck!');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest(
    '[data-start],[data-view],[data-action],[data-close]',
  );
  if (!el) return;
  if (el.dataset.start !== undefined) startSession(Number(el.dataset.start));
  else if (el.dataset.view) {
    view = el.dataset.view;
    render();
    scrollTo({ top: 0 });
  } else if (el.dataset.action) ACTIONS[el.dataset.action]?.(el);
  else if (el.hasAttribute('data-close')) el.closest('dialog')?.close();
});

document.addEventListener('change', (e) => {
  if (e.target.name !== 'mode') return;
  const swappedToday = setMode(state, e.target.value, now());
  save(state);
  toast(swappedToday ? "Today's quests updated" : 'New style starts tomorrow');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#levelup').hidden = true;
});

$('#session').addEventListener('close', () => {
  clearInterval(timer);
  session = null;
});

/* ---------- Clock ---------- */
function tick() {
  const n = now();
  if (state.plan && dayKey(n) !== state.plan.day) {
    const missed = sync();
    render();
    showMissed(missed);
    return;
  }
  const left = nextReset(n) - n;
  for (const el of $$('[data-countdown]')) el.textContent = fmtTime(left);
  $('.countdown')?.classList.toggle(
    'urgent',
    left < 3 * 3600000 && !planFull(),
  );
}

setInterval(tick, 1000);

/* ---------- Start ---------- */
const missedAtStart = sync();
render();
showMissed(missedAtStart);
