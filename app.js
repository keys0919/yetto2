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
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}


function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── 통계 ─────────────────────────────────────────────
function computeStats() {
  const data = load();
  const today = todayStr();
  const thisMonth = today.slice(0, 7);

  const todaySessions = data.sessions.filter(s => s.date === today);
  const monthSessions = data.sessions.filter(s => s.date.startsWith(thisMonth));

  const todayCount   = todaySessions.length;
  const monthCount   = monthSessions.length;
  const todayBest    = todaySessions.reduce((m, s) => Math.max(m, s.durationSec), 0);
  const allTimeBest  = data.sessions.reduce((m, s) => Math.max(m, s.durationSec), 0);

  const dailyHistory = {};
  for (const s of data.sessions) {
    if (!dailyHistory[s.date]) dailyHistory[s.date] = { count: 0, best: 0 };
    dailyHistory[s.date].count++;
    dailyHistory[s.date].best = Math.max(dailyHistory[s.date].best, s.durationSec);
  }

  return { todayCount, monthCount, todayBest, allTimeBest, dailyHistory };
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
  document.getElementById('stats-today-count').textContent = s.todayCount + '번';
  document.getElementById('stats-month-count').textContent = s.monthCount + '번';
  document.getElementById('stats-today-best').textContent  = s.todayBest > 0 ? formatTime(s.todayBest) : '—';
  document.getElementById('stats-all-best').textContent    = s.allTimeBest > 0 ? formatTime(s.allTimeBest) : '—';
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
  const dateStr = `${logDate.getFullYear()}년 ${logDate.getMonth() + 1}월 ${logDate.getDate()}일`;

  document.getElementById('day-label').textContent = isToday ? `오늘 · ${logDate.getMonth() + 1}/${logDate.getDate()}` : dateStr;
  document.getElementById('day-next').disabled = isToday;

  const key  = logDate.toISOString().slice(0, 10);
  const data = load();
  const rows = data.sessions
    .filter(s => s.date === key)
    .sort((a, b) => a.startedAt - b.startedAt);

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

    const time = document.createElement('span');
    time.className = 'daylog-time';
    time.textContent = formatTimeOfDay(s.startedAt);

    const dur = document.createElement('span');
    dur.className = 'daylog-duration';
    dur.textContent = formatTime(s.durationSec);

    row.appendChild(idx);
    row.appendChild(time);
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
