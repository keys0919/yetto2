'use strict';

const STORAGE_KEY = 'yetto2';

// ── 데이터 ──────────────────────────────────────────
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { sessions: [], active: null }; }
  catch { return { sessions: [], active: null }; }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── 날짜 ─────────────────────────────────────────────
function dateStr(d) {
  const x = d ? new Date(d) : new Date();
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return dateStr();
}


function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatGap(sec) {
  if (sec < 60) return '1분 미만';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── 통계 ─────────────────────────────────────────────
function gapSec(prev, curr) {
  return Math.floor((curr.startedAt - (prev.startedAt + prev.durationSec * 1000)) / 1000);
}

function avgOf(arr) {
  return arr.length > 0 ? Math.floor(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}

function computeStats() {
  const data = load();
  const now = Date.now();
  const today = todayStr();
  const thisMonth = today.slice(0, 7);

  const all = [...data.sessions].sort((a, b) => a.startedAt - b.startedAt);
  const todaySessions = all.filter(s => s.date === today);
  const monthSessions = all.filter(s => s.date.startsWith(thisMonth) && s.date !== today);
  const weekSessions  = all.filter(s => s.startedAt >= now - 7 * 86400 * 1000 && s.date !== today);

  const todayCount = todaySessions.length;

  // 마지막 간격
  let lastGap = null;
  let isFirstRecord = all.length <= 1;
  if (all.length >= 2) {
    const g = gapSec(all[all.length - 2], all[all.length - 1]);
    if (g >= 0) lastGap = g;
  }

  // 오늘 평균 간격 (오늘 세션 간 연속 쌍)
  const todayGaps = [];
  for (let i = 1; i < todaySessions.length; i++) {
    const g = gapSec(todaySessions[i - 1], todaySessions[i]);
    if (g >= 0) todayGaps.push(g);
  }
  const todayAvgGap = avgOf(todayGaps);

  // 주간 평균 간격 (주간 세션 간 연속 쌍)
  const weekGaps = [];
  for (let i = 1; i < weekSessions.length; i++) {
    const g = gapSec(weekSessions[i - 1], weekSessions[i]);
    if (g >= 0) weekGaps.push(g);
  }
  const weekAvgGap = avgOf(weekGaps);

  // 평균 비교 — 분모는 "실제 경과 일수" (데이터가 부족하면 있는 만큼만)
  const daysElapsed = new Date().getDate() - 1; // 오늘 제외
  const weekSpan = weekSessions.length > 0
    ? Math.min(7, Math.ceil((now - weekSessions[0].startedAt) / (86400 * 1000)))
    : 7;
  const monthFirstDay = monthSessions.length > 0 ? new Date(monthSessions[0].startedAt).getDate() : daysElapsed;
  const monthSpan = Math.max(1, daysElapsed - monthFirstDay + 1);
  const weekAvgCount  = weekSessions.length > 0 ? +(weekSessions.length / weekSpan).toFixed(1) : null;
  const monthAvgCount = monthSessions.length > 0 ? +(monthSessions.length / monthSpan).toFixed(1) : null;
  const weekAvgHolding  = avgOf(weekSessions.map(s => s.durationSec));
  const monthAvgHolding = avgOf(monthSessions.map(s => s.durationSec));

  // 하위 호환
  const todayBest   = todaySessions.reduce((m, s) => Math.max(m, s.durationSec), 0);
  const allTimeBest = all.reduce((m, s) => Math.max(m, s.durationSec), 0);

  return {
    todayCount, lastGap, isFirstRecord,
    todayAvgGap, weekAvgGap,
    weekAvgCount, monthAvgCount,
    weekAvgHolding, monthAvgHolding,
    todayBest, allTimeBest,
    all,
  };
}

// ── 화면 전환 ─────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  const tabBar = document.getElementById('tab-bar');
  const isModal = name === 'timer' || name === 'result';
  tabBar.style.display = isModal ? 'none' : 'flex';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
}

// ── 타이머 ───────────────────────────────────────────
let timerInterval = null;

function getElapsed() {
  const { active } = load();
  if (!active) return 0;
  return Math.floor((Date.now() - active.startedAt) / 1000);
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  const elapsed = getElapsed();
  document.getElementById('timer-display').textContent = formatTime(elapsed);

  const stats = computeStats();
  const gapEl = document.getElementById('timer-gap');
  if (stats.todayBest > 0 && elapsed < stats.todayBest) {
    gapEl.textContent = `오늘 최고까지 ${formatTime(stats.todayBest - elapsed)}`;
  } else {
    gapEl.textContent = '';
  }
}

// ── 홈 통계 업데이트 ──────────────────────────────────
function updateHome() {
  const s = computeStats();
  document.getElementById('home-today-best').textContent = s.todayBest > 0 ? formatTime(s.todayBest) : '—';
  document.getElementById('home-all-best').textContent   = s.allTimeBest > 0 ? formatTime(s.allTimeBest) : '—';
}

// ── 기록 화면 업데이트 ────────────────────────────────
function updateStats() {
  const s = computeStats();

  const el = id => document.getElementById(id);
  const fmt = (v, fn) => v != null ? fn(v) : '—';

  el('stats-today-count').textContent   = `${s.todayCount}번`;
  el('stats-last-gap').textContent      = s.isFirstRecord ? '첫 기록' : fmt(s.lastGap, formatGap);
  el('stats-today-avg-gap').textContent = fmt(s.todayAvgGap, formatGap);
  el('stats-week-avg-gap').textContent  = fmt(s.weekAvgGap, formatGap);

  el('stats-week-avg-count').textContent  = s.weekAvgCount  != null ? `${s.weekAvgCount}번` : '—';
  el('stats-month-avg-count').textContent = s.monthAvgCount != null ? `${s.monthAvgCount}번` : '—';
  el('stats-week-avg-hold').textContent   = fmt(s.weekAvgHolding,  formatTime);
  el('stats-month-avg-hold').textContent  = fmt(s.monthAvgHolding, formatTime);

  renderDayLog();
}

// ── 일별 로그 ─────────────────────────────────────────
let logDate; // Date object (시간 제거, 날짜만)

function initDayLog() {
  logDate = startOfDay(new Date());
}

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function formatTimeOfDay(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? '오후' : '오전';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${h12}:${pad(m)}`;
}

function renderDayLog() {
  const today   = startOfDay(new Date());
  const isToday = logDate.getTime() === today.getTime();
  const dateLabel = `${logDate.getFullYear()}년 ${logDate.getMonth() + 1}월 ${logDate.getDate()}일`;

  document.getElementById('day-label').textContent = isToday ? `오늘 · ${logDate.getMonth() + 1}/${logDate.getDate()}` : dateLabel;
  document.getElementById('day-next').disabled = isToday;

  const key  = dateStr(logDate);
  const data = load();
  const allSorted = [...data.sessions].sort((a, b) => a.startedAt - b.startedAt);
  const rows = allSorted.filter(s => s.date === key);

  const list = document.getElementById('daylog-list');
  list.innerHTML = '';

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'daylog-empty';
    empty.textContent = '기록 없음';
    list.appendChild(empty);
    return;
  }

  rows.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'daylog-row';

    const idx = document.createElement('span');
    idx.className = 'daylog-index';
    idx.textContent = i + 1;

    const left = document.createElement('div');
    left.className = 'daylog-left';

    const time = document.createElement('span');
    time.className = 'daylog-time';
    time.textContent = formatTimeOfDay(s.startedAt);

    const gapEl = document.createElement('span');
    gapEl.className = 'daylog-gap';

    if (i === 0) {
      const globalIdx = allSorted.findIndex(x => x.startedAt === s.startedAt);
      if (globalIdx <= 0) {
        gapEl.textContent = '첫 기록';
      } else {
        const g = gapSec(allSorted[globalIdx - 1], s);
        gapEl.textContent = g >= 0 ? `+${formatGap(g)}` : '—';
      }
    } else {
      const g = gapSec(rows[i - 1], s);
      gapEl.textContent = g >= 0 ? `+${formatGap(g)}` : '—';
    }

    left.appendChild(time);
    left.appendChild(gapEl);

    const dur = document.createElement('span');
    dur.className = 'daylog-duration';
    dur.textContent = formatTime(s.durationSec);

    if (s.note) {
      const note = document.createElement('span');
      note.className = 'daylog-gap';
      note.textContent = s.note;
      left.appendChild(note);
    }

    row.appendChild(idx);
    row.appendChild(left);
    row.appendChild(dur);
    list.appendChild(row);
  });
}

// ── 이벤트 ───────────────────────────────────────────
document.getElementById('btn-urge').addEventListener('click', () => {
  const data = load();
  data.active = { startedAt: Date.now() };
  save(data);
  showScreen('timer');
  startTimer();
});

document.getElementById('btn-done').addEventListener('click', () => {
  stopTimer();
  const data = load();
  if (!data.active) return;

  const durationSec = Math.floor((Date.now() - data.active.startedAt) / 1000);
  data.sessions.push({
    id: String(data.active.startedAt),
    startedAt: data.active.startedAt,
    durationSec,
    date: todayStr(),
  });
  data.active = null;
  save(data);

  const stats = computeStats();
  document.getElementById('result-time').textContent = formatTime(durationSec);
  document.getElementById('result-sub').textContent  =
    durationSec >= stats.allTimeBest && durationSec > 0 ? '전체 최고' :
    stats.todayCount > 1 ? `오늘 ${stats.todayCount}번째` : '';

  showScreen('result');
});

document.getElementById('btn-retry').addEventListener('click', () => {
  const data = load();
  data.active = { startedAt: Date.now() };
  save(data);
  showScreen('timer');
  startTimer();
});

document.getElementById('btn-home').addEventListener('click', () => {
  updateHome();
  showScreen('home');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const screen = btn.dataset.screen;
    if (screen === 'stats') updateStats();
    else if (screen === 'home') updateHome();
    showScreen(screen);
  });
});

document.getElementById('day-prev').addEventListener('click', () => {
  logDate.setDate(logDate.getDate() - 1);
  renderDayLog();
});

document.getElementById('day-next').addEventListener('click', () => {
  const today = startOfDay(new Date());
  if (logDate.getTime() >= today.getTime()) return;
  logDate.setDate(logDate.getDate() + 1);
  renderDayLog();
});

// 앱 복귀 시 타이머 재동기화
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && timerInterval) updateTimerDisplay();
});

// ── 초기화 ───────────────────────────────────────────
function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  initDayLog();

  const data = load();
  if (data.active) {
    showScreen('timer');
    startTimer();
  } else {
    updateHome();
    showScreen('home');
  }
}

init();
