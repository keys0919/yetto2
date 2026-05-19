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

  // 오늘 평균 간격
  const todayGaps = [];
  for (let i = 1; i < todaySessions.length; i++) {
    const g = gapSec(todaySessions[i - 1], todaySessions[i]);
    if (g >= 0) todayGaps.push(g);
  }
  const todayAvgGap = avgOf(todayGaps);

  // 주간 평균 간격
  const weekGaps = [];
  for (let i = 1; i < weekSessions.length; i++) {
    const g = gapSec(weekSessions[i - 1], weekSessions[i]);
    if (g >= 0) weekGaps.push(g);
  }
  const weekAvgGap = avgOf(weekGaps);

  // 평균 비교
  const daysElapsed = new Date().getDate() - 1;
  const todayMs = startOfDay(new Date()).getTime();
  const weekSpan = weekSessions.length > 0
    ? Math.min(7, Math.max(1, Math.round((todayMs - startOfDay(new Date(weekSessions[0].startedAt)).getTime()) / (86400 * 1000))))
    : 7;
  const monthFirstDay = monthSessions.length > 0 ? new Date(monthSessions[0].startedAt).getDate() : daysElapsed;
  const monthSpan = Math.max(1, daysElapsed - monthFirstDay + 1);
  const weekAvgCount  = weekSessions.length > 0 ? +(weekSessions.length / weekSpan).toFixed(1) : null;
  const monthAvgCount = monthSessions.length > 0 ? +(monthSessions.length / monthSpan).toFixed(1) : null;
  const weekAvgHolding  = avgOf(weekSessions.map(s => s.durationSec));
  const monthAvgHolding = avgOf(monthSessions.map(s => s.durationSec));

  const todayBest   = todaySessions.reduce((m, s) => Math.max(m, s.durationSec), 0);
  const allTimeBest = all.reduce((m, s) => Math.max(m, s.durationSec), 0);

  // 마지막 흡연 후 경과
  let elapsedSinceLastSmoke = null;
  if (all.length > 0) {
    const last = all[all.length - 1];
    const endTs = last.startedAt + last.durationSec * 1000;
    elapsedSinceLastSmoke = Math.max(0, Math.floor((now - endTs) / 1000));
  }

  return {
    todayCount, lastGap, isFirstRecord,
    todayAvgGap, weekAvgGap,
    weekAvgCount, monthAvgCount,
    weekAvgHolding, monthAvgHolding,
    todayBest, allTimeBest,
    elapsedSinceLastSmoke,
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

  if (name === 'home') {
    startHomeUpdate();
  } else {
    stopHomeUpdate();
  }
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

// ── 홈 라이브 업데이트 ────────────────────────────────
let homeInterval = null;

function startHomeUpdate() {
  stopHomeUpdate();
  updateHome();
  homeInterval = setInterval(updateHome, 30 * 1000);
}

function stopHomeUpdate() {
  if (homeInterval) { clearInterval(homeInterval); homeInterval = null; }
}

// ── 홈 통계 업데이트 ──────────────────────────────────
function updateHome() {
  const s = computeStats();

  document.getElementById('home-today-count').textContent   = `${s.todayCount}번`;
  document.getElementById('home-last-gap').textContent      = s.isFirstRecord ? '첫 기록' : (s.lastGap != null ? formatGap(s.lastGap) : '—');
  document.getElementById('home-today-avg-gap').textContent = s.todayAvgGap != null ? formatGap(s.todayAvgGap) : '—';

  const elapsedEl = document.getElementById('home-elapsed');
  const compareEl = document.getElementById('home-elapsed-compare');

  if (s.elapsedSinceLastSmoke != null) {
    elapsedEl.textContent = formatGap(s.elapsedSinceLastSmoke);
    if (s.todayAvgGap != null) {
      const diff = s.elapsedSinceLastSmoke - s.todayAvgGap;
      const diffMin = Math.round(Math.abs(diff) / 60);
      if (diffMin < 2) {
        compareEl.textContent = '오늘 평균과 비슷';
      } else if (diff > 0) {
        compareEl.textContent = `평균보다 +${diffMin}분 오래됨`;
      } else {
        compareEl.textContent = `평균보다 ${diffMin}분 짧음`;
      }
    } else {
      compareEl.textContent = '';
    }
  } else {
    elapsedEl.textContent = '—';
    compareEl.textContent = '오늘 첫 흡연 전';
  }
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

  // 판정 문장 — 흡연 횟수 비교
  const judgeCountEl = el('avg-judge-count');
  if (s.todayCount > 0 && s.weekAvgCount != null) {
    const diff = +(s.todayCount - s.weekAvgCount).toFixed(1);
    const absDiff = Math.abs(diff);
    if (absDiff < 0.3) {
      judgeCountEl.textContent = '오늘 흡연은 주간 평균과 같음';
    } else if (diff > 0) {
      judgeCountEl.textContent = `오늘은 주간 평균보다 +${absDiff}회 많음`;
    } else {
      judgeCountEl.textContent = `오늘은 주간 평균보다 ${absDiff}회 적음`;
    }
  } else {
    judgeCountEl.textContent = '';
  }

  // 판정 문장 — 간격 비교
  const judgeGapEl = el('avg-judge-gap');
  if (s.todayAvgGap != null && s.weekAvgGap != null) {
    const diffMin = Math.round((s.todayAvgGap - s.weekAvgGap) / 60);
    const absDiffMin = Math.abs(diffMin);
    if (absDiffMin < 2) {
      judgeGapEl.textContent = '오늘 평균 간격은 주간 평균과 비슷';
    } else if (diffMin > 0) {
      judgeGapEl.textContent = `오늘 평균 간격은 주간 평균보다 +${absDiffMin}분 김`;
    } else {
      judgeGapEl.textContent = `오늘 평균 간격은 주간 평균보다 ${absDiffMin}분 짧음`;
    }
  } else {
    judgeGapEl.textContent = '';
  }

  renderDayLog();
}

// ── 일별 로그 ─────────────────────────────────────────
let logDate;

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
  const shortLabel = `오늘 기록 · ${logDate.getMonth() + 1}/${logDate.getDate()}`;

  document.getElementById('day-label').textContent = isToday ? shortLabel : dateLabel;
  document.getElementById('day-next').disabled = isToday;

  const key  = dateStr(logDate);
  const data = load();
  const allSorted = [...data.sessions].sort((a, b) => a.startedAt - b.startedAt);
  const rows = allSorted.filter(s => s.date === key);

  const countEl = document.getElementById('day-count');
  countEl.textContent = rows.length > 0 ? `${rows.length}건` : '';

  const list = document.getElementById('daylog-list');
  list.innerHTML = '';

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'daylog-empty';
    empty.textContent = '기록 없음';
    list.appendChild(empty);
    return;
  }

  // 오늘 평균 간격 (짧음 배지 판단용)
  const rowGaps = [];
  for (let i = 1; i < rows.length; i++) {
    const g = gapSec(rows[i - 1], rows[i]);
    if (g >= 0) rowGaps.push(g);
  }
  const avgGapForDay = avgOf(rowGaps);

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

    let gapSecs = null;
    if (i === 0) {
      const globalIdx = allSorted.findIndex(x => x.startedAt === s.startedAt);
      if (globalIdx <= 0) {
        gapEl.textContent = '첫 기록';
      } else {
        const g = gapSec(allSorted[globalIdx - 1], s);
        if (g >= 0) {
          gapSecs = g;
          gapEl.textContent = `+${formatGap(g)}`;
        } else {
          gapEl.textContent = '—';
        }
      }
    } else {
      const g = gapSec(rows[i - 1], s);
      if (g >= 0) {
        gapSecs = g;
        gapEl.textContent = `+${formatGap(g)}`;
      } else {
        gapEl.textContent = '—';
      }
    }

    left.appendChild(time);
    left.appendChild(gapEl);

    // 짧음 배지: 간격이 30분 미만이거나 평균의 60% 미만
    if (gapSecs != null) {
      const threshold = avgGapForDay != null ? Math.min(30 * 60, avgGapForDay * 0.6) : 30 * 60;
      if (gapSecs < threshold) {
        const badge = document.createElement('span');
        badge.className = 'daylog-badge';
        badge.textContent = '짧음';
        gapEl.appendChild(badge);
      }
    }

    if (s.note) {
      const note = document.createElement('span');
      note.className = 'daylog-gap';
      note.textContent = s.note;
      left.appendChild(note);
    }

    const dur = document.createElement('span');
    dur.className = 'daylog-duration';
    dur.textContent = formatTime(s.durationSec);

    row.appendChild(idx);
    row.appendChild(left);
    row.appendChild(dur);
    list.appendChild(row);
  });
}

// ── 내보내기 / 가져오기 ────────────────────────────────
function exportData() {
  const data = load();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yetto-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported.sessions)) throw new Error();
      const current = load();
      const tsSet = new Set(current.sessions.map(s => s.startedAt));
      imported.sessions.forEach(s => {
        if (!tsSet.has(s.startedAt)) current.sessions.push(s);
      });
      current.sessions.sort((a, b) => a.startedAt - b.startedAt);
      save(current);
      updateStats();
      alert(`${imported.sessions.length}건 가져오기 완료`);
    } catch {
      alert('올바른 백업 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

// ── 토스트 ───────────────────────────────────────────
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ── 이벤트 ───────────────────────────────────────────
function addSessionNow() {
  const data = load();
  const now = Date.now();
  data.sessions.push({
    id: String(now),
    startedAt: now,
    durationSec: 0,
    date: todayStr(),
  });
  save(data);
  updateHome();
}

document.getElementById('btn-immediate').addEventListener('click', () => {
  addSessionNow();
  showToast('흡연 기록됨');
});

document.getElementById('btn-quick-add').addEventListener('click', () => {
  addSessionNow();
  showToast('흡연 횟수 추가됨');
});

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

  showScreen('home');
});

document.getElementById('btn-retry').addEventListener('click', () => {
  const data = load();
  data.active = { startedAt: Date.now() };
  save(data);
  showScreen('timer');
  startTimer();
});

document.getElementById('btn-home').addEventListener('click', () => {
  showScreen('home');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const screen = btn.dataset.screen;
    if (screen === 'stats') updateStats();
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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && timerInterval) updateTimerDisplay();
  if (!document.hidden && homeInterval) updateHome();
});

document.getElementById('btn-export').addEventListener('click', exportData);

document.getElementById('btn-import-trigger').addEventListener('click', () => {
  document.getElementById('input-import').click();
});

document.getElementById('input-import').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importData(file);
  e.target.value = '';
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
    showScreen('home');
  }
}

init();
