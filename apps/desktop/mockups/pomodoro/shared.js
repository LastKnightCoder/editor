/*
  番茄专注三方案共用：图标 sprite / mock 数据 / 计时引擎（模拟主进程）/ 壳层 / Menu / Popover / Toast /
  背景音面板 / 预设编辑表单 / 时间带 / 小窗与沉浸窗示意。
  【视觉参考，非导出源】—— 三方案共用同一套数据与计时语义，差异只在布局与交互承载。
  数据形状对齐 src/types/pomodoro.ts（PomodoroPreset / PomodoroSession / PauseSpan），不加新字段。
  计时语义对齐 src-electron/main/modules/pomodoro.ts：
    · 倒计时到 0 自动结束（asComplete=true）；
    · 专注不足 5 分钟结束 → 主进程直接丢弃、不落库；
    · 【修正】UI 手动结束未到点的倒计时传 asComplete=false（legacy 恒传 true，提前结束也记为 completed）。
*/
(function () {
  "use strict";

  /* ============ 图标（lucide 线性 1.75） ============ */
  const ICONS = {
    flame:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "list-todo":
      '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    timer:
      '<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    "file-text":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    presentation:
      '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
    "folder-kanban":
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 12v4M12 12v2M16 12v5"/>',
    repeat:
      '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    "book-open":
      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    inbox:
      '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sparkles:
      '<path d="M12 3.5l1.7 4.4 4.4 1.6-4.4 1.7L12 15.6l-1.7-4.4-4.4-1.7 4.4-1.6z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    chart:
      '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.8"/><rect x="12" y="8" width="3" height="10" rx="0.8"/><rect x="17" y="5" width="3" height="13" rx="0.8"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    "chev-up": '<path d="m18 15-6-6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    archive:
      '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.2-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>',
    pause:
      '<rect x="14" y="4" width="4" height="16" rx="1.2"/><rect x="6" y="4" width="4" height="16" rx="1.2"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
    music:
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    volume:
      '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>',
    pip: '<path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"/><rect width="10" height="7" x="12" y="13" rx="2"/>',
    expand:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    history:
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    "list-checks":
      '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    hourglass:
      '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    "arrow-up": '<path d="M12 19V5M5 12l7-7 7 7"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    coffee:
      '<path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };
  function injectSprite() {
    if (document.getElementById("pomo-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "pomo-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;

  /* ============ 时间：演示时钟固定从 2026-09-24 周四 14:20 起走，可快进 ============ */
  const MIN = 60000,
    H = 3600000,
    D = 86400000;
  const BASE = new Date(2026, 8, 24, 14, 20, 0).getTime();
  let simNow = BASE,
    speed = 1,
    lastReal = performance.now();
  const now = () => simNow;
  function advance() {
    const t = performance.now();
    simNow += (t - lastReal) * speed;
    lastReal = t;
  }
  function setSpeed(s) {
    advance();
    speed = s;
    emit("timer");
  }
  const getSpeed = () => speed;
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const DAY0 = startOfDay(BASE);
  const at = (off, h, m = 0) => DAY0 + off * D + h * H + m * MIN;
  const dayOffset = ts => Math.round((startOfDay(ts) - startOfDay(now())) / D);
  const WEEK = "日一二三四五六";
  const pad = n => String(n).padStart(2, "0");
  const hm = ts => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  function fmtClock(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      ss = s % 60;
    return (h > 0 ? `${h}:${pad(m)}` : pad(m)) + `:${pad(ss)}`;
  }
  /** 1h 05m / 25m */
  function fmtDur(ms) {
    const t = Math.round(ms / MIN);
    const h = Math.floor(t / 60),
      m = t % 60;
    return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
  }
  /** 1 小时 5 分 / 25 分钟 */
  function fmtDurCN(ms) {
    const t = Math.round(ms / MIN);
    const h = Math.floor(t / 60),
      m = t % 60;
    if (h === 0) return `${m} 分钟`;
    return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }
  const dateCN = ts => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
  };
  function dayLabel(ts) {
    const o = dayOffset(ts);
    if (o === 0) return "今天";
    if (o === -1) return "昨天";
    if (o === -2) return "前天";
    return dateCN(ts);
  }

  /* ============ Mock 数据 ============ */
  const presets = [
    { id: 1, name: "具体数学", mode: "countdown", durationMin: 25, sortOrder: 0, archived: false },
    { id: 2, name: "英语听力", mode: "countdown", durationMin: 30, sortOrder: 1, archived: false },
    { id: 3, name: "论文写作", mode: "countdown", durationMin: 50, sortOrder: 2, archived: false },
    { id: 4, name: "编程", mode: "countup", durationMin: 0, sortOrder: 3, archived: false },
    { id: 5, name: "晨读", mode: "countdown", durationMin: 45, sortOrder: 4, archived: false },
    { id: 6, name: "冥想", mode: "countdown", durationMin: 10, sortOrder: 5, archived: false },
    { id: 7, name: "考研政治", mode: "countdown", durationMin: 25, sortOrder: 6, archived: true },
    { id: 8, name: "吉他练习", mode: "countup", durationMin: 0, sortOrder: 7, archived: true },
  ];
  let nextPresetId = 9;
  // 预设色：设计数据色（同文章封面派生色口径），按 id 派生，不进主题词表、不加字段
  const COLORS = ["accent", "tag-2", "tag-1", "tag-3", "tag-4", "tag-5"];
  const colorKey = pid => COLORS[(pid - 1) % COLORS.length];
  const colorOf = pid => `var(--${colorKey(pid)})`;
  const softOf = pid => {
    const k = colorKey(pid);
    return k === "accent" ? "var(--accent-soft)" : `var(--${k}-soft)`;
  };

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let nextSessionId = 1;
  function mkSession(pid, start, focusMin, pausesSpec, status) {
    const p = presets.find(x => x.id === pid);
    const pauses = [];
    let pauseTotal = 0;
    for (const [afterMin, lenMin] of pausesSpec) {
      const s = start + (afterMin + pauseTotal / MIN) * MIN;
      pauses.push({ start: s, end: s + lenMin * MIN });
      pauseTotal += lenMin * MIN;
    }
    const focusMs = Math.round(focusMin * MIN);
    return {
      id: nextSessionId++,
      presetId: pid,
      startTime: start,
      endTime: start + focusMs + pauseTotal,
      expectedMs: p.mode === "countdown" ? p.durationMin * MIN : undefined,
      focusMs,
      pauseTotalMs: pauseTotal,
      pauseCount: pauses.length,
      pauses,
      status: status || "completed",
    };
  }
  const sessions = [];
  (function genHistory() {
    const r = rng(20260924);
    for (let off = -400; off <= -1; off++) {
      const dow = new Date(DAY0 + off * D).getDay();
      const weekend = dow === 0 || dow === 6;
      let n = Math.floor(r() * (weekend ? 4 : 6.5));
      if (r() < 0.08) n = 0;
      let t = at(off, 7, 20 + Math.floor(r() * 80));
      const pool =
        off < -40 && off > -200 ? [1, 2, 3, 4, 5, 6, 7, 8, 7, 1] : [1, 1, 2, 3, 3, 4, 4, 5, 6, 2];
      for (let i = 0; i < n; i++) {
        const pid = pool[Math.floor(r() * pool.length)];
        const p = presets.find(x => x.id === pid);
        let focus;
        let status = "completed";
        if (p.mode === "countdown") {
          focus = p.durationMin;
          if (r() < 0.14) {
            focus = Math.max(6, Math.round(p.durationMin * (0.45 + r() * 0.45)));
            status = r() < 0.5 ? "stopped" : "completed"; // 历史数据里提前结束多被记成 completed（legacy 缺陷）
          }
        } else focus = 20 + Math.round(r() * 95);
        const pc = r() < 0.6 ? 0 : r() < 0.75 ? 1 : 2;
        const spec = [];
        for (let k = 0; k < pc; k++)
          spec.push([Math.round(((k + 1) * focus) / (pc + 1)), 1 + Math.round(r() * 6)]);
        const s = mkSession(pid, t, focus, spec, status);
        if (s.endTime > at(off, 23, 20)) break;
        sessions.push(s);
        t = s.endTime + (10 + Math.floor(r() * 80)) * MIN;
      }
    }
    // 今天（14:20 之前）
    sessions.push(mkSession(5, at(0, 7, 50), 45, []));
    sessions.push(mkSession(1, at(0, 9, 30), 25, [[11, 4]]));
    sessions.push(mkSession(4, at(0, 10, 20), 68, [[38, 6]]));
    sessions.push(mkSession(2, at(0, 13, 30), 22, [], "stopped"));
    sessions.sort((a, b) => b.startTime - a.startTime);
  })();

  /* ============ 订阅 ============ */
  const listeners = new Set();
  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit(type, payload) {
    listeners.forEach(f => f(type, payload));
  }

  /* ============ 查询（全部由现有字段推导） ============ */
  const presetById = id => presets.find(p => p.id === id);
  const activePresets = () =>
    presets.filter(p => !p.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedPresets = () =>
    presets.filter(p => p.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const presetMeta = p => (p.mode === "countdown" ? `${p.durationMin} 分钟 · 倒计时` : "正计时");
  const presetShort = p => (p.mode === "countdown" ? `${p.durationMin}′` : "正计时");
  const sessionsOn = off => sessions.filter(s => dayOffset(s.startTime) === off);
  const sum = list => list.reduce((a, s) => a + s.focusMs, 0);
  function todaySummary() {
    const l = sessionsOn(0);
    return { count: l.length, focusMs: sum(l) };
  }
  function totalSummary() {
    // 真实 summaryPomodoroTotal 覆盖全部历史；mock 叠加一个 75 天之前的存量底数
    return { count: sessions.length, focusMs: sum(sessions) };
  }
  function weekSummary() {
    const dow = (new Date(now()).getDay() + 6) % 7; // 周一为首
    const l = sessions.filter(s => {
      const o = dayOffset(s.startTime);
      return o <= 0 && o >= -dow;
    });
    return { count: l.length, focusMs: sum(l) };
  }
  function dayTotals(n) {
    const out = [];
    for (let o = -(n - 1); o <= 0; o++) {
      const l = sessionsOn(o);
      out.push({ off: o, ms: sum(l), count: l.length, ts: DAY0 + o * D });
    }
    return out;
  }
  function presetStats(id) {
    const mine = sessions.filter(s => s.presetId === id);
    const days = [];
    for (let o = -6; o <= 0; o++) days.push(sum(mine.filter(s => dayOffset(s.startTime) === o)));
    const today = mine.filter(s => dayOffset(s.startTime) === 0);
    return {
      todayMs: sum(today),
      todayCount: today.length,
      days,
      weekMs: days.reduce((a, b) => a + b, 0),
      totalMs: sum(mine),
      totalCount: mine.length,
      lastTs: mine[0] ? mine[0].startTime : null,
    };
  }
  function streak() {
    let n = 0,
      o = sessionsOn(0).length ? 0 : -1;
    while (sessionsOn(o).length) {
      n++;
      o--;
    }
    return n;
  }
  function groupByDay(list) {
    const map = new Map();
    for (const s of list) {
      const k = startOfDay(s.startTime);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([ts, items]) => ({ ts, off: dayOffset(ts), items, focusMs: sum(items) }));
  }
  const isEarly = s => !!s.expectedMs && s.focusMs < s.expectedMs - 30000;
  function recTags(s) {
    const t = [];
    if (isEarly(s)) t.push(`<span class="tag warn">提前结束</span>`);
    if (s.pauseCount)
      t.push(
        `<span class="tag">暂停 ${s.pauseCount} 次 · ${Math.round(s.pauseTotalMs / MIN)}′</span>`
      );
    return t.join("");
  }

  /* ============ 变更（乐观更新 + 撤销） ============ */
  function createPreset(v) {
    const p = {
      id: nextPresetId++,
      name: v.name,
      mode: v.mode,
      durationMin: v.mode === "countdown" ? v.durationMin : 0,
      sortOrder: Math.max(...presets.map(x => x.sortOrder)) + 1,
      archived: false,
    };
    presets.push(p);
    emit("data");
    return p;
  }
  function updatePreset(id, v) {
    Object.assign(presetById(id), v, v.mode === "countup" ? { durationMin: 0 } : {});
    emit("data");
  }
  function archivePreset(id, val) {
    presetById(id).archived = val;
    emit("data");
  }
  function deletePreset(id) {
    const i = presets.findIndex(p => p.id === id);
    const [p] = presets.splice(i, 1);
    emit("data");
    return () => {
      presets.splice(i, 0, p);
      emit("data");
    };
  }
  function reorderPresets(ids) {
    ids.forEach((id, i) => (presetById(id).sortOrder = i));
    emit("data");
  }
  function deleteSessions(ids) {
    const removed = [];
    ids.forEach(id => {
      const i = sessions.findIndex(s => s.id === id);
      if (i >= 0) removed.push(sessions.splice(i, 1)[0]);
    });
    emit("data");
    return () => {
      sessions.push(...removed);
      sessions.sort((a, b) => b.startTime - a.startTime);
      emit("data");
    };
  }
  function updateSessionFocus(id, ms) {
    // 真实接口 updatePomodoroSession(sessionId, focusMs) 只能改专注时长
    sessions.find(s => s.id === id).focusMs = ms;
    emit("data");
  }

  /* ============ 计时引擎（模拟主进程 · tick 广播） ============ */
  const timer = { session: null, sound: null, volume: 45 };
  function timing() {
    const s = timer.session;
    if (!s) return null;
    const n = now();
    let pt = s.pauseTotalMs;
    const last = s.pauses[s.pauses.length - 1];
    if (s.status === "paused" && last && last.end === undefined) pt += n - last.start;
    const elapsed = Math.max(0, n - s.startTime - pt);
    const remain = s.expectedMs ? Math.max(0, s.expectedMs - elapsed) : undefined;
    const progress = s.expectedMs ? Math.min(1, elapsed / s.expectedMs) : (elapsed % H) / H;
    return {
      elapsed,
      remain,
      progress,
      display: s.expectedMs ? remain : elapsed,
      paused: s.status === "paused",
      preset: presetById(s.presetId),
      endsAt: s.expectedMs && s.status === "running" ? n + remain : null,
      willDiscard: elapsed < 5 * MIN,
    };
  }
  function start(pid) {
    if (timer.session) return false;
    const p = presetById(pid);
    timer.session = {
      id: nextSessionId++,
      presetId: pid,
      startTime: now(),
      expectedMs: p.mode === "countdown" ? p.durationMin * MIN : undefined,
      pauses: [],
      pauseTotalMs: 0,
      pauseCount: 0,
      status: "running",
    };
    emit("timer");
    return true;
  }
  function pause() {
    const s = timer.session;
    if (!s || s.status !== "running") return;
    s.status = "paused";
    s.pauses.push({ start: now() });
    s.pauseCount++;
    emit("timer");
  }
  function resume() {
    const s = timer.session;
    if (!s || s.status !== "paused") return;
    const last = s.pauses[s.pauses.length - 1];
    last.end = now();
    s.pauseTotalMs += last.end - last.start;
    s.status = "running";
    emit("timer");
  }
  const toggle = () => timer.session && (timer.session.status === "running" ? pause() : resume());
  function stop(asComplete) {
    const s = timer.session;
    if (!s) return null;
    const n = now();
    const last = s.pauses[s.pauses.length - 1];
    if (s.status === "paused" && last && last.end === undefined) {
      last.end = n;
      s.pauseTotalMs += n - last.start;
    }
    const focusMs = Math.max(0, n - s.startTime - s.pauseTotalMs);
    timer.session = null;
    if (focusMs < 5 * MIN) {
      emit("timer");
      emit("discarded");
      return { discarded: true };
    }
    const saved = {
      ...s,
      endTime: n,
      focusMs,
      status: asComplete ? "completed" : "stopped",
    };
    sessions.unshift(saved);
    emit("timer");
    emit("data");
    return { saved };
  }
  /** 用户手动结束：倒计时未到点记为 stopped（修 legacy 恒传 asComplete=true） */
  function stopByUser() {
    const t = timing();
    return stop(!(t && t.remain > 0));
  }
  setInterval(() => {
    advance();
    const t = timing();
    if (t && timer.session.expectedMs && t.remain === 0 && timer.session.status === "running") {
      const r = stop(true);
      emit("completed", r.saved);
    }
    emit("tick");
  }, 250);

  /* 演示态 */
  function demo(kind) {
    timer.session = null;
    if (kind === "idle") return emit("timer");
    const n = now();
    if (kind === "ending") {
      timer.session = {
        id: nextSessionId++,
        presetId: 6,
        startTime: n - 10 * MIN + 8000,
        expectedMs: 10 * MIN,
        pauses: [],
        pauseTotalMs: 0,
        pauseCount: 0,
        status: "running",
      };
      return emit("timer");
    }
    // 具体数学 14:05 开始，中途暂停 3 分钟
    const st = n - 15 * MIN - 20000;
    timer.session = {
      id: nextSessionId++,
      presetId: 1,
      startTime: st,
      expectedMs: 25 * MIN,
      pauses: [{ start: st + 4 * MIN, end: st + 7 * MIN }],
      pauseTotalMs: 3 * MIN,
      pauseCount: 1,
      status: "running",
    };
    if (kind === "paused") {
      timer.session.pauses.push({ start: n - 80000 });
      timer.session.pauseCount++;
      timer.session.status = "paused";
    }
    emit("timer");
  }

  /* ============ 背景音 ============ */
  const SOUNDS = [
    ["brook", "小溪"],
    ["birds", "小鸟"],
    ["autumn", "秋风"],
    ["tide", "潮汐"],
    ["summer", "夏夜"],
    ["wind-chime", "风铃"],
    ["bonfire", "篝火"],
    ["rain", "大雨"],
  ];
  const soundName = k => (SOUNDS.find(s => s[0] === k) || [null, "无"])[1];
  const eqHTML = '<span class="eq"><i></i><i></i><i></i></span>';
  function soundPanelHTML() {
    return `<div class="pop-title">${icon("music")}背景音<span class="spacer"></span><span class="muted" style="font-weight:400;font-size:12px">专注时循环播放</span></div>
      <div class="sound-grid">
        <button class="sound${timer.sound ? "" : " on"}" data-snd="">无</button>
        ${SOUNDS.map(([k, n]) => `<button class="sound${timer.sound === k ? " on" : ""}" data-snd="${k}">${timer.sound === k && timer.session ? eqHTML : ""}${n}</button>`).join("")}
      </div>
      <div class="vol" style="${timer.sound ? "" : "opacity:.45;pointer-events:none"}">${icon("volume")}<input type="range" class="range" min="0" max="100" value="${timer.volume}" style="--v:${timer.volume}%"><span class="num" style="width:30px;text-align:right">${timer.volume}%</span></div>`;
  }
  function openSound(anchor, opts = {}) {
    return openPop(anchor, soundPanelHTML(), {
      width: 292,
      placement: opts.placement || "bottom-end",
      onMount(el, close, rerender) {
        el.addEventListener("click", e => {
          const b = e.target.closest("[data-snd]");
          if (!b) return;
          timer.sound = b.dataset.snd || null;
          emit("sound");
          rerender(soundPanelHTML());
        });
        el.addEventListener("input", e => {
          if (e.target.type !== "range") return;
          timer.volume = +e.target.value;
          e.target.style.setProperty("--v", timer.volume + "%");
          e.target.nextElementSibling.textContent = timer.volume + "%";
        });
      },
    });
  }

  /* ============ 预设表单（Popover / 行内共用） ============ */
  const QUICK = [10, 15, 25, 30, 45, 50, 60, 90];
  function presetFormHTML(p) {
    const mode = p ? p.mode : "countdown";
    const dur = p && p.mode === "countdown" ? p.durationMin : 25;
    return `<div class="field"><label>名称</label><input class="input" data-f="name" placeholder="如：具体数学" value="${p ? p.name : ""}"></div>
      <div class="field"><label>计时方式</label>
        <div class="seg" data-f="mode"><button data-v="countdown" class="${mode === "countdown" ? "on" : ""}">${icon("hourglass")}倒计时</button><button data-v="countup" class="${mode === "countup" ? "on" : ""}">${icon("arrow-up")}正计时</button></div>
      </div>
      <div class="field" data-f="durbox" style="${mode === "countdown" ? "" : "display:none"}"><label>时长</label>
        <div class="stepper"><button class="ibtn" data-step="-5">${icon("minus")}</button><input class="input" data-f="dur" value="${dur}"><span class="unit">分钟</span><button class="ibtn" data-step="5">${icon("plus")}</button></div>
        <div class="chips">${QUICK.map(q => `<button class="chip${q === dur ? " on" : ""}" data-q="${q}">${q}</button>`).join("")}</div>
      </div>
      <div class="field" data-f="uphint" style="${mode === "countup" ? "" : "display:none"};color:var(--ink-2);font-size:12.5px">正计时没有终点，手动结束；不足 5 分钟不会留下记录。</div>`;
  }
  function bindPresetForm(root, p, onSubmit) {
    let mode = p ? p.mode : "countdown";
    const name = root.querySelector('[data-f="name"]');
    const dur = root.querySelector('[data-f="dur"]');
    const syncChips = () =>
      root
        .querySelectorAll("[data-q]")
        .forEach(c => c.classList.toggle("on", +c.dataset.q === +dur.value));
    root.querySelector('[data-f="mode"]').addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      mode = b.dataset.v;
      root
        .querySelectorAll('[data-f="mode"] button')
        .forEach(x => x.classList.toggle("on", x === b));
      root.querySelector('[data-f="durbox"]').style.display = mode === "countdown" ? "" : "none";
      root.querySelector('[data-f="uphint"]').style.display = mode === "countup" ? "" : "none";
    });
    root.querySelectorAll("[data-step]").forEach(b =>
      b.addEventListener("click", () => {
        dur.value = Math.min(600, Math.max(1, (+dur.value || 0) + +b.dataset.step));
        syncChips();
      })
    );
    root.querySelectorAll("[data-q]").forEach(c =>
      c.addEventListener("click", () => {
        dur.value = c.dataset.q;
        syncChips();
      })
    );
    dur.addEventListener("input", syncChips);
    const submit = () => {
      const v = { name: name.value.trim(), mode, durationMin: +dur.value };
      if (!v.name) {
        name.focus();
        name.style.borderColor = "var(--danger)";
        return;
      }
      if (mode === "countdown" && !(v.durationMin >= 1 && v.durationMin <= 600)) return dur.focus();
      onSubmit(v);
    };
    root.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    setTimeout(() => name.focus(), 30);
    return submit;
  }
  function openPresetEditor(anchor, p, opts = {}) {
    return openPop(
      anchor,
      `<div class="pop-title">${icon(p ? "edit" : "plus")}${p ? "编辑预设" : "新建预设"}</div>${presetFormHTML(p)}
       <div class="pop-foot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-primary" data-ok>${p ? "保存" : "创建"}</button></div>`,
      {
        width: 316,
        placement: opts.placement || "bottom-end",
        onMount(el, close) {
          const submit = bindPresetForm(el, p, v => {
            if (p) updatePreset(p.id, v);
            else {
              const np = createPreset(v);
              opts.onCreate && opts.onCreate(np);
            }
            close();
            toast(p ? "预设已保存" : `已创建「${v.name}」`);
          });
          el.querySelector("[data-ok]").onclick = submit;
          el.querySelector("[data-x]").onclick = close;
        },
      }
    );
  }
  /** 预设右键 / 更多菜单（进行中的预设不能归档或删除） */
  function presetMenu(anchor, p, extra = {}) {
    const busy = timer.session && timer.session.presetId === p.id;
    const entries = p.archived
      ? [
          { icon: "undo", label: "恢复", act: "restore" },
          "-",
          { icon: "trash", label: "删除", act: "delete", danger: true },
        ]
      : [
          { icon: "play", label: "开始专注", act: "start", disabled: !!timer.session },
          { icon: "edit", label: "编辑", act: "edit" },
          "-",
          { icon: "archive", label: "归档", act: "archive", disabled: busy },
        ];
    openMenu(anchor, entries, e => {
      if (e.act === "start") start(p.id);
      if (e.act === "edit")
        (extra.onEdit || (() => openPresetEditor(extra.editAnchor || anchor, p)))(p);
      if (e.act === "archive") {
        archivePreset(p.id, true);
        toast(`已归档「${p.name}」`, () => archivePreset(p.id, false));
      }
      if (e.act === "restore") {
        archivePreset(p.id, false);
        toast(`已恢复「${p.name}」`);
      }
      if (e.act === "delete") {
        const undo = deletePreset(p.id);
        toast(`已删除「${p.name}」，历史记录保留`, undo);
      }
    });
  }

  /* ============ 时间带（6:00–24:00） ============ */
  function ribbonHTML(list, opts = {}) {
    const from = opts.from ?? 6,
      to = opts.to ?? 24;
    const off = opts.off ?? 0;
    const d0 = DAY0 + off * D;
    const x = ts => (((ts - d0) / H - from) / (to - from)) * 100;
    const clamp = v => Math.max(0, Math.min(100, v));
    let html = "";
    const one = (s, live) => {
      const end = s.endTime ?? now();
      const l = clamp(x(s.startTime)),
        r = clamp(x(end));
      html += `<div class="blk${live ? " live" : ""}" style="left:${l}%;width:${Math.max(0.35, r - l)}%;--c:${colorOf(s.presetId)}" title="${presetById(s.presetId)?.name ?? "已删除的预设"} · ${hm(s.startTime)}–${hm(end)}"></div>`;
      for (const p of s.pauses) {
        const pl = clamp(x(p.start)),
          pr = clamp(x(p.end ?? now()));
        if (pr - pl > 0.05) html += `<div class="gap" style="left:${pl}%;width:${pr - pl}%"></div>`;
      }
    };
    list.filter(s => dayOffset(s.startTime) === off).forEach(s => one(s, false));
    if (off === 0 && timer.session && opts.live !== false) one(timer.session, true);
    if (off === 0 && opts.now !== false)
      html += `<div class="now" style="left:${clamp(x(now()))}%"></div>`;
    return html;
  }
  function ribbonAxis(from = 6, to = 24, step = 3) {
    let h = "";
    for (let i = from; i <= to; i += step) h += `<span>${i}</span>`;
    return `<div class="ribbon-axis">${h}</div>`;
  }

  /* ============ 进度环 ============ */
  function ringSVG(size, stroke, progress, paused) {
    const r = (size - stroke) / 2,
      c = 2 * Math.PI * r;
    return `<svg class="ring${paused ? " paused" : ""}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - progress)}"/></svg>`;
  }
  function setRing(svg, progress, paused) {
    if (!svg) return;
    const bar = svg.querySelector(".bar");
    const c = +bar.getAttribute("stroke-dasharray");
    bar.setAttribute("stroke-dashoffset", c * (1 - progress));
    svg.classList.toggle("paused", !!paused);
  }

  /* ============ 壳层 ============ */
  const NAV = [
    [
      "工作台",
      [
        ["flame", "今日"],
        ["calendar", "日程"],
        ["list-todo", "待办"],
        ["timer", "番茄专注", true],
        ["users", "协作"],
      ],
    ],
    [
      "知识",
      [
        ["layers", "卡片库"],
        ["file-text", "文章"],
        ["pen", "日记"],
        ["presentation", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["help", "问题管理"],
        ["book-open", "微信读书"],
        ["inbox", "订阅"],
      ],
    ],
    [
      "AI",
      [
        ["chat", "AI 对话"],
        ["sparkles", "Skill 管理"],
      ],
    ],
    [
      "工具",
      [
        ["chart", "统计"],
        ["send", "发布"],
      ],
    ],
  ];
  function mountShell({ crumb = "番茄专注" } = {}) {
    injectSprite();
    const theme = localStorage.getItem("pomo-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? '<span class="nav-live" id="nav-live"><i></i><span></span></span>' : ""}</button>`
          )
          .join("")}</div>`
    ).join("");
    document.getElementById("app").innerHTML = `
      <div class="app">
        <nav class="sidebar"><div class="sidebar-head"><span class="brand-mark">τ</span><span class="brand-name">Tau</span></div>${nav}
          <div class="nav-spacer"></div><button class="nav-item">${icon("sliders")}设置</button></nav>
        <div></div>
        <main class="main">
          <div class="titlebar">
            <button class="titlebar-btn" disabled title="后退 (Alt+←)">${icon("back")}</button>
            <button class="titlebar-btn" disabled title="前进 (Alt+→)">${icon("fwd")}</button>
            <span class="titlebar-crumb">${crumb}</span>
            <span class="titlebar-spacer"></span>
            <div class="demo" title="mockup 演示控制，非产品 UI"><span>演示</span>
              <button data-demo="idle">空闲</button><button data-demo="running">专注中</button><button data-demo="paused">已暂停</button><button data-demo="ending">剩 8 秒</button>
              <i class="sep"></i><button data-speed>×30 快进</button></div>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
        </main>
      </div>`;
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("pomo-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    document.querySelectorAll("[data-demo]").forEach(b => (b.onclick = () => demo(b.dataset.demo)));
    const sp = document.querySelector("[data-speed]");
    sp.onclick = () => setSpeed(speed === 1 ? 30 : 1);
    const live = document.getElementById("nav-live");
    const syncShell = () => {
      const t = timing();
      live.classList.toggle("on", !!t);
      if (t) {
        live.classList.toggle("paused", t.paused);
        live.lastElementChild.textContent = t.paused ? "已暂停" : fmtClock(t.display);
      }
      const st = !t
        ? "idle"
        : t.paused
          ? "paused"
          : t.remain !== undefined && t.remain < 10000
            ? "ending"
            : "running";
      document
        .querySelectorAll("[data-demo]")
        .forEach(b => b.classList.toggle("on", b.dataset.demo === st));
      sp.classList.toggle("on", speed !== 1);
    };
    on(syncShell);
    syncShell();
    return { page: document.getElementById("page-root") };
  }

  /* ============ Menu ============ */
  let menuEl = null,
    menuCleanup = null;
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    if (menuCleanup) menuCleanup();
    menuCleanup = null;
  }
  function place(el, anchor, placement, gap = 6) {
    const r = anchor.getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const w = el.offsetWidth,
      h = el.offsetHeight;
    let x = placement.endsWith("end")
      ? r.right - w
      : placement === "top" || placement === "bottom"
        ? (r.left + r.right) / 2 - w / 2
        : r.left;
    let y = placement.startsWith("top") ? r.top - h - gap : r.bottom + gap;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - gap);
    if (y < 8) y = r.bottom + gap;
    el.style.left = Math.max(8, x) + "px";
    el.style.top = y + "px";
  }
  function openMenu(anchor, entries, onPick, opts = {}) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.header
            ? `<div class="menu-label">${e.header}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}" data-i="${i}"${e.disabled ? " disabled" : ""}>${e.dot ? `<span class="pdot" style="--c:${e.dot}"></span>` : e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    place(el, anchor, opts.placement || "bottom-start");
    requestAnimationFrame(() => el.classList.add("open"));
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const entry = entries[+b.dataset.i];
      closeMenu();
      onPick && onPick(entry);
    });
    const onDown = ev => !el.contains(ev.target) && closeMenu();
    const onKey = ev => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        closeMenu();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    menuEl = el;
    menuCleanup = () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }

  /* ============ Popover（单例；Esc / 外点关闭） ============ */
  let popClose = null;
  function openPop(anchor, html, opts = {}) {
    if (popClose) popClose();
    closeMenu();
    const el = document.createElement("div");
    el.className = "pop";
    if (opts.width) el.style.width = opts.width + "px";
    el.innerHTML = html;
    document.body.appendChild(el);
    const placement = opts.placement || "bottom-start";
    place(el, anchor, placement, 8);
    requestAnimationFrame(() => el.classList.add("open"));
    const onDown = ev => {
      if (!el.contains(ev.target) && !(anchor.contains && anchor.contains(ev.target))) close();
    };
    const onKey = ev => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
      }
    };
    function close() {
      el.remove();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      if (popClose === close) popClose = null;
      opts.onClose && opts.onClose();
    }
    const rerender = h => {
      el.innerHTML = h;
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    popClose = close;
    opts.onMount && opts.onMount(el, close, rerender);
    return close;
  }
  const popOpen = () => !!popClose || !!menuEl;

  /* ============ Toast ============ */
  let toastEl, toastTimer;
  function toast(msg, undo) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span class="${undo ? "" : "solo"}">${msg}</span>${undo ? "<button>撤销</button>" : ""}`;
    if (undo)
      toastEl.querySelector("button").onclick = () => {
        undo();
        toastEl.classList.remove("show");
      };
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), undo ? 5000 : 2600);
  }

  /* ============ 页面键盘（输入框内 / 浮层打开时不接管） ============ */
  function bindKeys(handlers) {
    document.addEventListener("keydown", e => {
      if (e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
      if (popOpen() || document.querySelector(".imm.open, .wfull.open")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && timer.session) {
        e.preventDefault();
        toggle();
      } else if (/^[1-9]$/.test(e.key) && !timer.session) {
        const p = activePresets()[+e.key - 1];
        if (p) start(p.id);
      } else if (e.key === "i" && timer.session) window.P.openImmersive();
      else if (handlers && handlers[e.key]) handlers[e.key](e);
    });
  }

  /* ============ 小窗（独立 always-on-top 窗口的示意） ============ */
  let miniEl = null;
  function openMini() {
    if (miniEl || !timer.session) return;
    miniEl = document.createElement("div");
    miniEl.className = "mini-win";
    miniEl.innerHTML = `<div class="mini-cap">小窗 · 独立置顶窗口示意 <button data-x title="关闭小窗">${icon("x")}</button></div>
      <div class="mini-body"><div class="mini-ring">${ringSVG(40, 3.5, 0, false)}<button data-t title="暂停 / 继续"></button></div>
      <div class="mini-txt"><div class="mini-time num"></div><div class="mini-name"></div></div>
      <button class="ibtn" data-s title="结束">${icon("stop")}</button><button class="ibtn" data-b title="回到主窗口">${icon("expand")}</button></div>`;
    document.body.appendChild(miniEl);
    const sync = () => {
      const t = timing();
      if (!t) return closeMini();
      miniEl.querySelector(".mini-time").textContent = fmtClock(t.display);
      miniEl.querySelector(".mini-name").textContent = t.paused
        ? `${t.preset.name} · 已暂停`
        : t.preset.name;
      miniEl.querySelector("[data-t]").innerHTML = icon(t.paused ? "play" : "pause", "fill");
      setRing(miniEl.querySelector(".ring"), t.progress, t.paused);
    };
    const off = on(sync);
    sync();
    miniEl.querySelector("[data-t]").onclick = toggle;
    miniEl.querySelector("[data-s]").onclick = () => {
      const t = timing();
      if (t && t.willDiscard) return toast("不足 5 分钟，请在主窗口确认结束");
      stopByUser();
    };
    miniEl.querySelector("[data-b]").onclick = closeMini;
    miniEl.querySelector("[data-x]").onclick = closeMini;
    let drag = null;
    miniEl.querySelector(".mini-cap").addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      const r = miniEl.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    });
    document.addEventListener("mousemove", e => {
      if (!drag || !miniEl) return;
      miniEl.style.left = e.clientX - drag.dx + "px";
      miniEl.style.top = e.clientY - drag.dy + "px";
      miniEl.style.right = "auto";
      miniEl.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => (drag = null));
    miniEl._off = off;
    emit("mini");
  }
  function closeMini() {
    if (!miniEl) return;
    miniEl._off();
    miniEl.remove();
    miniEl = null;
    emit("mini");
  }
  const miniOpen = () => !!miniEl;

  /* ============ 沉浸（独立全屏窗口的示意：大字钟 + 细进度线，控件随鼠标浮现） ============ */
  let immEl = null;
  function openImmersive() {
    if (!timer.session) return;
    if (!immEl) {
      immEl = document.createElement("div");
      immEl.className = "imm";
      immEl.innerHTML = `<div class="imm-top"><span>沉浸 · 独立全屏窗口示意</span><span class="spacer"></span><kbd>Esc</kbd> 退出</div>
        <div class="imm-center"><div class="imm-name"></div><div class="imm-time num"></div>
          <div class="imm-line"><i></i></div><div class="imm-sub num"></div></div>
        <div class="imm-ctrl"><button class="imm-btn" data-snd title="背景音">${icon("music")}</button>
          <button class="imm-btn main" data-t></button><button class="imm-btn" data-s title="结束">${icon("stop")}</button></div>`;
      document.body.appendChild(immEl);
      immEl.querySelector("[data-t]").onclick = toggle;
      immEl.querySelector("[data-s]").onclick = () => {
        const t = timing();
        if (t && t.willDiscard) return toast("不足 5 分钟，退出沉浸后确认结束");
        stopByUser();
      };
      immEl.querySelector("[data-snd]").onclick = e =>
        openSound(e.currentTarget, { placement: "top" });
      let idle;
      immEl.addEventListener("mousemove", () => {
        immEl.classList.add("awake");
        clearTimeout(idle);
        idle = setTimeout(() => immEl.classList.remove("awake"), 2200);
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && immEl.classList.contains("open") && !popOpen()) closeImmersive();
        if (e.key === " " && immEl.classList.contains("open")) {
          e.preventDefault();
          toggle();
        }
      });
      on(syncImm);
    }
    requestAnimationFrame(() => immEl.classList.add("open", "awake"));
    syncImm();
  }
  function syncImm() {
    if (!immEl || !immEl.classList.contains("open")) return;
    const t = timing();
    if (!t) return closeImmersive();
    immEl.classList.toggle("paused", t.paused);
    immEl.querySelector(".imm-name").textContent = t.preset.name;
    immEl.querySelector(".imm-time").textContent = fmtClock(t.display);
    immEl.querySelector(".imm-line i").style.width = t.progress * 100 + "%";
    immEl.querySelector(".imm-sub").textContent = t.paused
      ? "已暂停 · 空格继续"
      : t.endsAt
        ? `${hm(now())} · 预计 ${hm(t.endsAt)} 结束`
        : `正计时 · ${hm(timer.session.startTime)} 开始`;
    immEl.querySelector("[data-t]").innerHTML = icon(t.paused ? "play" : "pause", "fill");
  }
  function closeImmersive() {
    if (immEl) immEl.classList.remove("open");
  }

  // 小窗 / 沉浸窗示意样式（随 shared.js 注入，免得三份页面各写一遍）
  const css = document.createElement("style");
  css.textContent = `
  .mini-win{position:fixed;right:22px;bottom:22px;z-index:250;width:292px;background:var(--bg-surface);border-radius:16px;box-shadow:0 0 0 1px color-mix(in srgb,var(--ink-1) 7%,transparent),var(--shadow-float);overflow:hidden;animation:miniIn 240ms var(--ease-out)}
  @keyframes miniIn{from{opacity:0;transform:translateY(10px) scale(.97)}}
  .mini-cap{height:24px;display:flex;align-items:center;padding:0 4px 0 12px;font-size:10.5px;color:var(--ink-3);cursor:grab;user-select:none}
  .mini-cap button{margin-left:auto;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;color:var(--ink-3)}
  .mini-cap button:hover{background:var(--bg-hover);color:var(--ink-1)} .mini-cap .icon{width:12px;height:12px}
  .mini-body{display:flex;align-items:center;gap:10px;padding:2px 10px 12px 12px}
  .mini-ring{position:relative;width:40px;height:40px;flex:none}
  .mini-ring button{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;color:var(--ink-1)}
  .mini-ring button .icon{width:13px;height:13px} .mini-ring button:hover{background:var(--bg-hover)}
  .mini-txt{flex:1;min-width:0} .mini-time{font-size:21px;font-weight:600;line-height:1.15;letter-spacing:-.01em}
  .mini-name{font-size:11.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .imm{position:fixed;inset:0;z-index:500;background:var(--bg-page);display:flex;flex-direction:column;opacity:0;pointer-events:none;transition:opacity 400ms var(--ease-out)}
  .imm.open{opacity:1;pointer-events:auto}
  .imm-top{display:flex;align-items:center;gap:8px;height:48px;padding:0 22px;font-size:12px;color:var(--ink-3);opacity:0;transition:opacity 400ms}
  .imm-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding-bottom:40px}
  .imm-name{font-size:16px;color:var(--ink-2)}
  .imm-time{font-size:156px;font-weight:400;letter-spacing:-.035em;line-height:1;color:var(--ink-1);transition:color 400ms}
  .imm.paused .imm-time{color:var(--ink-3)}
  .imm-line{width:320px;height:3px;border-radius:2px;background:var(--bg-track);margin-top:26px;overflow:hidden}
  .imm-line i{display:block;height:100%;background:var(--accent);border-radius:2px;transition:width 1s linear}
  .imm.paused .imm-line i{background:var(--warn)}
  .imm-sub{font-size:13px;color:var(--ink-3);margin-top:12px}
  .imm-ctrl{display:flex;justify-content:center;gap:14px;padding-bottom:56px;opacity:0;transform:translateY(6px);transition:opacity 400ms,transform 400ms var(--ease-out)}
  .imm.awake .imm-ctrl,.imm.awake .imm-top{opacity:1;transform:none}
  .imm-btn{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--ink-2);background:var(--bg-hover)}
  .imm-btn:hover{background:var(--bg-press);color:var(--ink-1)} .imm-btn .icon{width:17px;height:17px}
  .imm-btn.main{width:56px;height:56px;background:var(--accent);color:var(--ink-inverse)} .imm-btn.main:hover{background:var(--accent-hover);color:var(--ink-inverse)}`;
  document.head.appendChild(css);

  window.P = {
    injectSprite,
    icon,
    MIN,
    H,
    D,
    now,
    at,
    dayOffset,
    startOfDay,
    hm,
    fmtClock,
    fmtDur,
    fmtDurCN,
    dateCN,
    dayLabel,
    WEEK,
    presets,
    sessions,
    colorOf,
    softOf,
    presetById,
    activePresets,
    archivedPresets,
    presetMeta,
    presetShort,
    sessionsOn,
    todaySummary,
    totalSummary,
    weekSummary,
    dayTotals,
    presetStats,
    streak,
    groupByDay,
    isEarly,
    recTags,
    createPreset,
    updatePreset,
    archivePreset,
    deletePreset,
    reorderPresets,
    deleteSessions,
    updateSessionFocus,
    timer,
    timing,
    start,
    pause,
    resume,
    toggle,
    stopByUser,
    demo,
    setSpeed,
    getSpeed,
    SOUNDS,
    soundName,
    eqHTML,
    openSound,
    presetFormHTML,
    bindPresetForm,
    openPresetEditor,
    presetMenu,
    ribbonHTML,
    ribbonAxis,
    ringSVG,
    setRing,
    mountShell,
    openMenu,
    closeMenu,
    openPop,
    toast,
    on,
    emit,
    bindKeys,
    openMini,
    closeMini,
    miniOpen,
    openImmersive,
  };
})();
