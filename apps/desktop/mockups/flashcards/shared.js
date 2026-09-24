/*
  闪卡页三方案共用：图标 sprite / mock 数据 / 排期预估 / 壳层 / Menu / Toast / 复习引擎 / 编辑器 / 卡组表单。
  【视觉参考，非导出源】—— 三方案共用同一套数据、复习引擎与编辑器，差异只在布局与承载方式。
  数据形状对齐 src/types/flashcard.ts（FlashcardDeck / Flashcard / FlashcardReference）；
  排期预估 = src-electron/main/modules/tables/flashcard.ts calculateSchedule 同式（REVIEW_INTERVALS × (0.8 + ease × 0.2)）。
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
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/>',
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
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    chart:
      '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.8"/><rect x="12" y="8" width="3" height="10" rx="0.8"/><rect x="17" y="5" width="3" height="13" rx="0.8"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    archive:
      '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sub: '<path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
    move: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>',
    sunrise:
      '<path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
    "calendar-days":
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "panel-right": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h6"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>',
    maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    skip: '<path d="m5 4 10 8-10 8V4z"/><path d="M19 5v14"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    focus:
      '<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    pause:
      '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    "circle-dot": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
    "list-checks":
      '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    "text-cursor":
      '<path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1M7 22h1a4 4 0 0 0 4-4v-1M7 2h1a4 4 0 0 1 4 4v1"/>',
    message:
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
    toggle: '<rect x="2" y="6" width="20" height="12" rx="6"/><circle cx="16" cy="12" r="3"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
    "x-circle": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6M8 16h8"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    minimize:
      '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="M14.5 5.5 18.5 9.5"/><path d="M5 3v4M3 5h4M19 15v4M17 17h4"/>',
    "chev-left": '<path d="m15 18-6-6 6-6"/>',
    "chev-up": '<path d="m18 15-6-6-6 6"/>',
    flip: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
    brain:
      '<path d="M12 5a3 3 0 1 0-5.99.14A4 4 0 0 0 4 12a4 4 0 0 0 2 3.46V17a3 3 0 0 0 6 0z"/><path d="M12 5a3 3 0 1 1 5.99.14A4 4 0 0 1 20 12a4 4 0 0 1-2 3.46V17a3 3 0 0 1-6 0z"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    puzzle:
      '<path d="M19.44 7.85c-.49.49-1.28.49-1.77 0l-1.69-1.69a1.25 1.25 0 0 1 0-1.77 2.5 2.5 0 1 0-3.54-3.54 1.25 1.25 0 0 1-1.77 0L8.98 2.54a1.2 1.2 0 0 0-1.7 0L5.54 4.28a1.2 1.2 0 0 0 0 1.7l1.69 1.69c.49.49.49 1.28 0 1.77a2.5 2.5 0 1 1-3.54 3.54 1.25 1.25 0 0 0-1.77 0 1.2 1.2 0 0 0 0 1.7l6.4 6.4a1.2 1.2 0 0 0 1.7 0l1.69-1.69c.49-.49.49-1.28 0-1.77a2.5 2.5 0 1 1 3.54-3.54c.49.49 1.28.49 1.77 0l1.69-1.69a1.2 1.2 0 0 0 0-1.7z"/>',
    microscope:
      '<path d="M6 18h8M3 22h18M14 22a7 7 0 1 0 0-14h-1M9 14h2M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2zM12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    rocket:
      '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  };
  function injectSprite() {
    const s = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${s}</svg>`
    );
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  const esc = s =>
    String(s).replace(
      /[&<>"]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );

  /* ============ 时间（演示「现在」固定为 2026-09-24 周四 14:20） ============ */
  const NOW = new Date(2026, 8, 24, 14, 20).getTime();
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;
  const startOfDay = t => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const TODAY0 = startOfDay(NOW);
  const dayDiff = t => Math.round((startOfDay(t) - TODAY0) / DAY);
  const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  function fmtSpan(ms) {
    if (ms < HOUR) return Math.max(1, Math.round(ms / MIN)) + " 分钟";
    if (ms < DAY) return Math.round(ms / HOUR) + " 小时";
    if (ms < 30 * DAY) return Math.round(ms / DAY) + " 天";
    return Math.round(ms / (30 * DAY)) + " 个月";
  }
  /** 到期描述：{ text, cls }，cls ∈ late / now / ""（未来） */
  function dueInfo(c) {
    if (c.status === "suspended") return { text: "已暂停", cls: "" };
    if (c.status === "new") return { text: "新卡", cls: "now" };
    const d = c.due - NOW;
    if (d <= 0) {
      const late = dayDiff(c.due);
      return late < 0 ? { text: `逾期 ${-late} 天`, cls: "late" } : { text: "现在", cls: "now" };
    }
    const dd = dayDiff(c.due);
    const hm = new Date(c.due).toTimeString().slice(0, 5);
    if (dd === 0) return { text: `今天 ${hm}`, cls: "" };
    if (dd === 1) return { text: `明天 ${hm}`, cls: "" };
    if (dd < 7) return { text: `${dd} 天后`, cls: "" };
    return { text: `${new Date(c.due).getMonth() + 1}月${new Date(c.due).getDate()}日`, cls: "" };
  }

  /* ============ 元数据 ============ */
  const TYPE_META = {
    "single-choice": { label: "单选", icon: "circle-dot" },
    "multiple-choice": { label: "多选", icon: "list-checks" },
    cloze: { label: "填空", icon: "text-cursor" },
    qa: { label: "问答", icon: "message" },
    boolean: { label: "判断", icon: "toggle" },
  };
  const TYPE_ORDER = ["qa", "cloze", "single-choice", "multiple-choice", "boolean"];
  const STATUS_LABEL = { new: "新卡", learning: "学习中", review: "巩固", suspended: "已暂停" };
  const DIFF_LABEL = { foundation: "基础", standard: "常规", advanced: "进阶" };
  // 评分文案与统计页口径一致（03 指南：轻松 / 记得 / 模糊 / 忘记）；键位按「忘记 → 轻松」从左到右
  const RATINGS = [
    { value: "hard", label: "忘记", key: "1" },
    { value: "struggle", label: "模糊", key: "2" },
    { value: "normal", label: "记得", key: "3" },
    { value: "easy", label: "轻松", key: "4" },
  ];
  const REVIEW_INTERVALS = [
    5 * MIN,
    30 * MIN,
    12 * HOUR,
    DAY,
    2 * DAY,
    4 * DAY,
    7 * DAY,
    15 * DAY,
    30 * DAY,
    60 * DAY,
  ];
  const RATING_DELTA = { easy: 2, normal: 1, struggle: -1, hard: -2 };
  const EASE_DELTA = { easy: 0.15, normal: 0, struggle: -0.1, hard: -0.25 };
  function schedule(c, rating) {
    let lv = c.level + RATING_DELTA[rating];
    if (rating === "struggle") lv = Math.max(c.level - 1, 0);
    lv = Math.max(0, Math.min(REVIEW_INTERVALS.length - 1, lv));
    const ease = Math.min(3.5, Math.max(1.3, c.ease + EASE_DELTA[rating]));
    const interval = Math.round(REVIEW_INTERVALS[lv] * (0.8 + ease * 0.2));
    const reviewCount = c.reviewCount + 1;
    return {
      level: lv,
      ease,
      interval,
      reviewCount,
      status: reviewCount >= 3 && rating !== "hard" ? "review" : "learning",
    };
  }

  /* ============ Mock 数据 ============ */
  // 卡组色：legacy coverColor 收敛到主题 tag-1…5 / accent（与待办项目色同口径，零新 token）
  const DECK_COLORS = ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "accent"];
  const decks = [
    {
      id: 1,
      name: "操作系统",
      icon: "microscope",
      color: "tag-2",
      description: "进程、内存管理与文件系统，配合《深入理解计算机系统》",
      sortOrder: 0,
    },
    {
      id: 2,
      name: "React 原理",
      icon: "rocket",
      color: "tag-3",
      description: "Fiber、调度与 Hooks 的实现细节",
      sortOrder: 1,
    },
    {
      id: 3,
      name: "技术英语",
      icon: "book",
      color: "tag-1",
      description: "读源码与文档时遇到的词汇和表达",
      sortOrder: 2,
    },
    { id: 4, name: "数据库与索引", icon: "target", color: "tag-4", description: "", sortOrder: 3 },
    {
      id: 5,
      name: "中国近代史",
      icon: "notes",
      color: "tag-5",
      description: "考研政治史纲部分",
      sortOrder: 4,
    },
    { id: 6, name: "Rust 所有权", icon: "puzzle", color: "accent", description: "", sortOrder: 5 },
  ];
  // legacy flashcardDeckIcons 键 → 线性图标（DeckIcon 同口径，旧 emoji 由 DeckIcon 映射兼容）
  const DECK_ICON_KEYS = {
    brain: "brain",
    book: "book-open",
    zap: "zap",
    target: "target",
    puzzle: "puzzle",
    microscope: "microscope",
    star: "star",
    rocket: "rocket",
    lightbulb: "bulb",
    notes: "note",
  };
  const deckGlyph = d => icon(DECK_ICON_KEYS[d.icon] || "brain");
  const deckCss = d =>
    `--c:var(--${d.color});--cs:var(--${d.color === "accent" ? "accent-soft" : d.color + "-soft"})`;

  const R = (title, kind) => ({ title, kind });
  // prompt 中 {{答案|备选1|备选2}} 表示填空；h = 到期相对现在的小时数（新卡为创建时刻）
  const RAW = [
    // —— 操作系统
    {
      d: 1,
      t: "single-choice",
      s: "review",
      lv: 5,
      e: 2.6,
      n: 6,
      h: -2,
      diff: "standard",
      tags: ["进程"],
      p: "Linux 中 <code>fork()</code> 之后、任一方写入之前，父子进程共享的是？",
      opts: [
        ["写时复制前的物理内存页", 1, "页表项被标为只读共享"],
        ["各自的栈空间", 0],
        ["进程 PID", 0],
        ["未决信号集", 0, "子进程的未决信号集被清空"],
      ],
      x: "fork 采用写时复制（COW）：父子进程的页表指向同一批物理页并标为只读，任一方写入时触发缺页异常，内核才复制该页。",
      refs: [R("CSAPP 第 9 章 · 虚拟内存", "文章"), R("写时复制", "卡片")],
    },
    {
      d: 1,
      t: "cloze",
      s: "learning",
      lv: 1,
      e: 2.4,
      n: 2,
      h: -0.5,
      diff: "foundation",
      tags: ["内存"],
      p: "虚拟地址到物理地址的转换由 {{MMU|内存管理单元}} 完成，转换结果的缓存称为 {{TLB|快表}}。",
      x: "TLB 未命中时需要逐级查页表（x86-64 为四级），命中率直接影响访存性能。",
      refs: [R("CSAPP 第 9 章 · 虚拟内存", "文章")],
    },
    {
      d: 1,
      t: "boolean",
      s: "review",
      lv: 4,
      e: 2.5,
      n: 5,
      h: -26,
      diff: "foundation",
      tags: ["进程", "线程"],
      p: "同一进程内的两个线程之间切换，不需要切换页表。",
      bool: true,
      x: "同进程线程共享地址空间，切换时只需保存 / 恢复寄存器与栈指针，不刷新 TLB，这是线程切换比进程切换轻的主要原因。",
    },
    {
      d: 1,
      t: "qa",
      s: "new",
      lv: 0,
      e: 2.5,
      n: 0,
      h: -50,
      diff: "standard",
      tags: ["并发"],
      p: "死锁产生的四个必要条件是什么？",
      a: "互斥、占有并等待、不可抢占、循环等待。",
      x: "破坏任意一个条件即可预防死锁；实践中最常用的是给锁定全局顺序，破坏循环等待。",
      hint: "想想资源是怎样被持有和请求的",
      refs: [R("操作系统导论 · 并发", "文章")],
    },
    {
      d: 1,
      t: "multiple-choice",
      s: "learning",
      lv: 2,
      e: 2.3,
      n: 3,
      h: 3,
      diff: "standard",
      tags: ["IPC"],
      p: "以下哪些属于进程间通信（IPC）方式？",
      opts: [
        ["管道", 1],
        ["共享内存", 1],
        ["信号量", 1],
        ["页表", 0, "页表是地址转换结构，不是通信机制"],
      ],
      x: "常见 IPC：管道 / 命名管道、消息队列、共享内存、信号量、信号、套接字。",
    },
    {
      d: 1,
      t: "single-choice",
      s: "review",
      lv: 6,
      e: 2.7,
      n: 8,
      h: -5,
      diff: "advanced",
      tags: ["内存"],
      p: "下列页面置换算法中，会出现 Belady 异常的是？",
      opts: [
        ["FIFO", 1],
        ["LRU", 0, "LRU 是栈算法"],
        ["OPT", 0, "OPT 是栈算法"],
      ],
      x: "Belady 异常：分配的物理页框增多，缺页次数反而上升。栈算法（LRU、OPT）不会出现。",
    },
    {
      d: 1,
      t: "cloze",
      s: "review",
      lv: 5,
      e: 2.6,
      n: 7,
      h: 50,
      diff: "standard",
      tags: ["调度"],
      p: "Linux 6.6 之前的默认调度器是 {{CFS|完全公平调度器}}，它用 {{红黑树}} 按 vruntime 组织可运行进程。",
      x: "6.6 起默认调度器换为 EEVDF。",
    },
    {
      d: 1,
      t: "qa",
      s: "new",
      lv: 0,
      e: 2.5,
      n: 0,
      h: -30,
      diff: "foundation",
      tags: ["内核"],
      p: "用户态进入内核态有哪几种途径？",
      a: "系统调用、异常（如缺页）、外部中断。",
    },
    {
      d: 1,
      t: "boolean",
      s: "learning",
      lv: 1,
      e: 2.3,
      n: 2,
      h: -0.2,
      diff: "standard",
      tags: ["文件"],
      p: "<code>mmap</code> 映射文件后，对映射区的写入会立刻写回磁盘。",
      bool: false,
      x: "写入先落在页缓存，由内核回写线程或显式 <code>msync</code> 触发落盘。",
    },
    {
      d: 1,
      t: "single-choice",
      s: "new",
      lv: 0,
      e: 2.5,
      n: 0,
      h: -20,
      diff: "foundation",
      tags: ["文件"],
      p: "inode 中<b>不</b>包含下列哪项信息？",
      opts: [
        ["文件名", 1, "文件名存在目录项里"],
        ["权限位", 0],
        ["数据块指针", 0],
        ["修改时间", 0],
      ],
    },
    // —— React 原理
    {
      d: 2,
      t: "cloze",
      s: "learning",
      lv: 2,
      e: 2.4,
      n: 3,
      h: -1,
      diff: "advanced",
      tags: ["调度"],
      p: "React 18 的并发渲染中，更新优先级用 {{Lane|lanes}} 模型表示，本质是一个 31 位的 {{位掩码|bitmask}}。",
      refs: [R("React 源码阅读 · Scheduler 与 Lane", "文章")],
    },
    {
      d: 2,
      t: "qa",
      s: "review",
      lv: 4,
      e: 2.5,
      n: 5,
      h: -3,
      diff: "standard",
      tags: ["Hooks"],
      p: "为什么 Hooks 不能写在条件语句里？",
      a: "Hooks 依赖调用顺序：每次渲染按顺序对应 Fiber 上 memoizedState 链表中的节点，条件调用会打乱顺序，导致状态错位。",
      x: "这也是 eslint-plugin-react-hooks 的 rules-of-hooks 规则要保证的事情。",
      refs: [R("Hooks 链表", "卡片")],
    },
    {
      d: 2,
      t: "single-choice",
      s: "review",
      lv: 5,
      e: 2.6,
      n: 6,
      h: -6,
      diff: "standard",
      tags: ["Hooks"],
      p: "<code>useLayoutEffect</code> 与 <code>useEffect</code> 的主要区别是？",
      opts: [
        ["执行时机：前者在 DOM 变更后、浏览器绘制前同步执行", 1],
        ["前者只在服务端执行", 0],
        ["后者不能返回清理函数", 0],
        ["二者没有区别", 0],
      ],
    },
    {
      d: 2,
      t: "boolean",
      s: "review",
      lv: 6,
      e: 2.8,
      n: 9,
      h: 20,
      diff: "foundation",
      tags: ["批处理"],
      p: "React 18 中，同一个事件回调里连续多次 <code>setState</code>，默认会合并为一次渲染。",
      bool: true,
      x: "React 18 起自动批处理（automatic batching）覆盖 Promise、setTimeout 与原生事件。",
    },
    {
      d: 2,
      t: "multiple-choice",
      s: "new",
      lv: 0,
      e: 2.5,
      n: 0,
      h: -4,
      diff: "standard",
      tags: ["渲染"],
      p: "以下哪些会导致组件重新渲染？",
      opts: [
        ["自身 state 变化", 1],
        ["父组件重新渲染", 1],
        ["订阅的 Context 值变化", 1],
        ["修改 <code>ref.current</code>", 0, "ref 变化不触发渲染"],
      ],
    },
    {
      d: 2,
      t: "cloze",
      s: "learning",
      lv: 1,
      e: 2.2,
      n: 4,
      h: -8,
      diff: "standard",
      tags: ["Fiber"],
      p: "Fiber 架构把一次更新分为可中断的 {{render}} 阶段和不可中断的 {{commit}} 阶段。",
    },
    {
      d: 2,
      t: "qa",
      s: "review",
      lv: 7,
      e: 2.9,
      n: 10,
      h: 120,
      diff: "foundation",
      tags: ["Diff"],
      p: "列表渲染时 key 的作用是什么？用数组下标当 key 有什么问题？",
      a: "key 帮助 Diff 在同层识别节点身份以复用；用下标作 key 时插入 / 删除 / 排序会让身份错位，导致状态串位和多余的重建。",
    },
    {
      d: 2,
      t: "single-choice",
      s: "suspended",
      lv: 3,
      e: 2.1,
      n: 6,
      h: -48,
      diff: "foundation",
      tags: ["性能"],
      p: "<code>React.memo</code> 默认使用哪种方式比较 props？",
      opts: [
        ["浅比较", 1],
        ["深比较", 0],
        ["引用比较整个 props 对象", 0],
      ],
    },
    // —— 技术英语
    {
      d: 3,
      t: "qa",
      s: "review",
      lv: 5,
      e: 2.6,
      n: 6,
      h: -2.5,
      diff: "foundation",
      tags: ["形容词"],
      p: "idempotent",
      a: "幂等的：执行多次与执行一次效果相同。",
      x: "例：PUT / DELETE 在 HTTP 语义上应当是 idempotent 的。",
    },
    {
      d: 3,
      t: "cloze",
      s: "learning",
      lv: 1,
      e: 2.3,
      n: 2,
      h: -0.4,
      diff: "foundation",
      tags: ["短语"],
      p: "This function is {{deprecated}} and will be removed in the next major release.",
      hint: "已弃用的",
    },
    {
      d: 3,
      t: "single-choice",
      s: "review",
      lv: 4,
      e: 2.5,
      n: 5,
      h: -9,
      diff: "foundation",
      tags: ["动词"],
      p: "“mitigate” 最接近的意思是？",
      opts: [
        ["缓解、减轻", 1],
        ["迁移", 0],
        ["模仿", 0],
        ["调解", 0, "那是 mediate"],
      ],
    },
    {
      d: 3,
      t: "qa",
      s: "new",
      lv: 0,
      e: 2.5,
      n: 0,
      h: -10,
      diff: "standard",
      tags: ["辨析"],
      p: "throttle 和 debounce 的区别？",
      a: "throttle 节流：固定间隔内最多执行一次；debounce 防抖：停止触发一段时间后才执行一次。",
    },
    {
      d: 3,
      t: "boolean",
      s: "review",
      lv: 3,
      e: 2.4,
      n: 4,
      h: -12,
      diff: "foundation",
      tags: ["形容词"],
      p: "技术文档里的 “trivial” 通常表示“琐碎但关键的”。",
      bool: false,
      x: "trivial 指“简单到不值一提的”，如 a trivial fix。",
    },
    {
      d: 3,
      t: "cloze",
      s: "review",
      lv: 6,
      e: 2.7,
      n: 8,
      h: 70,
      diff: "foundation",
      tags: ["形容词"],
      p: "This API call is {{asynchronous}}, so it returns a promise immediately.",
      hint: "异步的",
    },
    // —— 数据库与索引
    {
      d: 4,
      t: "qa",
      s: "learning",
      lv: 2,
      e: 2.3,
      n: 3,
      h: -7,
      diff: "standard",
      tags: ["索引"],
      p: "什么是联合索引的最左前缀原则？",
      a: "查询条件必须从联合索引的最左列开始并且连续，才能使用该索引；跳过左侧列则后续列无法走索引。",
      x: "范围查询（>、<、BETWEEN）会使其右侧列无法继续用于索引查找。",
      refs: [R("MySQL 索引笔记", "文章")],
    },
    {
      d: 4,
      t: "single-choice",
      s: "review",
      lv: 5,
      e: 2.6,
      n: 6,
      h: -3.5,
      diff: "standard",
      tags: ["InnoDB"],
      p: "InnoDB 聚簇索引的叶子节点存储的是？",
      opts: [
        ["整行数据", 1],
        ["主键值", 0, "那是二级索引叶子节点存的"],
        ["行指针", 0],
        ["页号", 0],
      ],
    },
    {
      d: 4,
      t: "multiple-choice",
      s: "review",
      lv: 4,
      e: 2.4,
      n: 5,
      h: -1.5,
      diff: "advanced",
      tags: ["索引"],
      p: "以下哪些情况通常会导致索引失效？",
      opts: [
        ["对索引列使用函数", 1],
        ["隐式类型转换", 1],
        ["<code>LIKE '%abc'</code>", 1],
        ["使用覆盖索引", 0, "覆盖索引恰恰避免了回表"],
      ],
    },
    {
      d: 4,
      t: "cloze",
      s: "review",
      lv: 6,
      e: 2.7,
      n: 8,
      h: 30,
      diff: "standard",
      tags: ["事务"],
      p: "MySQL InnoDB 的默认隔离级别是 {{可重复读|RR|REPEATABLE READ}}，它通过 {{MVCC}} 和间隙锁减少幻读。",
    },
    {
      d: 4,
      t: "boolean",
      s: "review",
      lv: 7,
      e: 2.8,
      n: 9,
      h: 200,
      diff: "foundation",
      tags: ["SQLite"],
      p: "SQLite 开启 WAL 模式后，读和写可以并发进行。",
      bool: true,
    },
    // —— 中国近代史（今日无到期）
    {
      d: 5,
      t: "single-choice",
      s: "review",
      lv: 8,
      e: 3.0,
      n: 11,
      h: 90,
      diff: "foundation",
      tags: ["条约"],
      p: "《南京条约》签订于哪一年？",
      opts: [
        ["1842 年", 1],
        ["1840 年", 0],
        ["1856 年", 0],
        ["1860 年", 0],
      ],
    },
    {
      d: 5,
      t: "cloze",
      s: "review",
      lv: 7,
      e: 2.8,
      n: 9,
      h: 40,
      diff: "foundation",
      tags: ["洋务运动"],
      p: "洋务运动前期以“{{自强}}”为口号，后期以“{{求富}}”为口号。",
    },
    {
      d: 5,
      t: "qa",
      s: "review",
      lv: 6,
      e: 2.6,
      n: 7,
      h: 150,
      diff: "advanced",
      tags: ["辛亥革命"],
      p: "辛亥革命的历史意义有哪些？",
      a: "推翻清王朝，结束两千多年君主专制，建立中华民国；使民主共和观念深入人心；为中国进步打开闸门。",
    },
  ];
  let seq = 100;
  const cards = RAW.map((r, i) => ({
    id: i + 1,
    deckId: r.d,
    type: r.t,
    prompt: r.p,
    options: (r.opts || []).map((o, j) => ({
      id: "o" + j,
      label: o[0],
      isCorrect: !!o[1],
      explanation: o[2] || "",
    })),
    answer: r.a || "",
    booleanAnswer: r.bool,
    hint: r.hint || "",
    detail: r.x || "",
    tags: r.tags || [],
    difficulty: r.diff,
    status: r.s,
    level: r.lv,
    ease: r.e,
    reviewCount: r.n,
    due: NOW + r.h * HOUR,
    lastReview: r.n ? NOW + r.h * HOUR - REVIEW_INTERVALS[r.lv] : null,
    refs: r.refs || [],
    createTime: NOW - (40 - i) * DAY,
  }));

  /** 近 30 天的复习记录（按天四档计数），驱动连续天数 / 保持率 / 热力 */
  const history = [];
  (function () {
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 29; i >= 1; i--) {
      const skip = i === 12 || i === 19 || i === 20 || i === 26;
      const total = skip ? 0 : 8 + Math.round(rnd() * 26);
      const hard = Math.round(total * (0.06 + rnd() * 0.08));
      const struggle = Math.round(total * (0.12 + rnd() * 0.1));
      const easy = Math.round(total * (0.18 + rnd() * 0.12));
      history.push({
        day: -i,
        hard,
        struggle,
        easy,
        normal: Math.max(0, total - hard - struggle - easy),
      });
    }
    history.push({ day: 0, hard: 0, struggle: 0, normal: 0, easy: 0 });
  })();

  /* ============ 查询 ============ */
  const byId = id => cards.find(c => c.id === id);
  const deckOf = c => decks.find(d => d.id === c.deckId);
  const deckById = id => decks.find(d => d.id === id);
  const cardsOf = deckId => cards.filter(c => deckId == null || c.deckId === deckId);
  const isDue = c => c.status !== "suspended" && (c.status === "new" || c.due <= NOW);
  /** 复习队列：与主进程 get-review-queue 同序——到期在前、due 升序、level 升序；新卡跟在到期卡之后 */
  function queue(deckId) {
    const list = cardsOf(deckId).filter(isDue);
    const old = list
      .filter(c => c.status !== "new")
      .sort((a, b) => a.due - b.due || a.level - b.level);
    const fresh = list.filter(c => c.status === "new").sort((a, b) => a.createTime - b.createTime);
    return old.concat(fresh);
  }
  function deckStats(deckId) {
    const list = cardsOf(deckId);
    const live = list.filter(c => c.status !== "suspended");
    const dueOld = live.filter(c => c.status !== "new" && c.due <= NOW).length;
    const fresh = live.filter(c => c.status === "new").length;
    const forecast = Array.from(
      { length: 7 },
      (_, i) =>
        live.filter(
          c => c.status !== "new" && (i === 0 ? c.due <= TODAY0 + DAY : dayDiff(c.due) === i)
        ).length
    );
    const last = list.map(c => c.lastReview || 0).reduce((a, b) => Math.max(a, b), 0);
    return {
      total: list.length,
      due: dueOld,
      fresh,
      todo: dueOld + fresh,
      learning: list.filter(c => c.status === "learning").length,
      review: list.filter(c => c.status === "review").length,
      suspended: list.filter(c => c.status === "suspended").length,
      forecast,
      lastReview: last || null,
      laterToday: live.filter(c => c.status !== "new" && c.due > NOW && dayDiff(c.due) === 0)
        .length,
    };
  }
  /** 预计耗时：按每张 20 秒估算（新卡 40 秒），只作提示 */
  const estMinutes = list =>
    Math.max(1, Math.round(list.reduce((s, c) => s + (c.status === "new" ? 40 : 20), 0) / 60));
  function streak() {
    let n = history[history.length - 1] && sumDay(history[history.length - 1]) > 0 ? 1 : 0;
    for (let i = history.length - 2; i >= 0; i--) {
      if (sumDay(history[i]) > 0) n++;
      else break;
    }
    return n;
  }
  const sumDay = h => h.hard + h.struggle + h.normal + h.easy;
  function retention(days = 7) {
    const slice = history.slice(-days);
    const tot = slice.reduce((s, h) => s + sumDay(h), 0);
    const ok = slice.reduce((s, h) => s + h.normal + h.easy, 0);
    return { total: tot, rate: tot ? ok / tot : 0 };
  }
  function recordReview(c, rating) {
    const today = history[history.length - 1];
    const snap = { ...c };
    const r = schedule(c, rating);
    Object.assign(c, {
      level: r.level,
      ease: r.ease,
      reviewCount: r.reviewCount,
      status: r.status,
      due: NOW + r.interval,
      lastReview: NOW,
    });
    today[rating]++;
    return () => {
      Object.assign(c, snap);
      today[rating]--;
    };
  }

  /* ============ 题面文本工具 ============ */
  const BLANK_RE = /\{\{([^}]+)\}\}/g;
  function blanksOf(c) {
    const out = [];
    c.prompt.replace(BLANK_RE, (_, body) => {
      const [answer, ...alts] = body.split("|");
      out.push({ answer, alts });
    });
    return out;
  }
  const plain = html => html.replace(/<[^>]+>/g, "");
  /** 列表 / 卡片墙用的题面摘要：填空显示为 ____（或答案高亮） */
  function promptText(c, { reveal = false } = {}) {
    return c.prompt.replace(BLANK_RE, (_, body) =>
      reveal
        ? `<span class="blank-src">${esc(body.split("|")[0])}</span>`
        : '<span class="blank-src">＿＿</span>'
    );
  }
  function answerText(c) {
    switch (c.type) {
      case "single-choice":
      case "multiple-choice":
        return c.options
          .filter(o => o.isCorrect)
          .map(o => o.label)
          .join("；");
      case "boolean":
        return c.booleanAnswer ? "正确" : "错误";
      case "cloze":
        return blanksOf(c)
          .map(b => b.answer)
          .join("；");
      default:
        return c.answer;
    }
  }

  /* ============ 壳层（与 app/navigation.ts 当前分组一致） ============ */
  const NAV = [
    [
      "工作台",
      [
        ["flame", "今日"],
        ["calendar", "日程"],
        ["list-todo", "待办"],
        ["timer", "番茄专注"],
        ["users", "协作"],
      ],
    ],
    [
      "知识",
      [
        ["layers", "卡片库"],
        ["file-text", "文章"],
        ["pen", "日记"],
        ["board", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习", true],
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
  const THEME_KEY = "fc-mock-theme";
  function mountShell({ crumb = "闪卡复习" } = {}) {
    injectSprite();
    const theme = localStorage.getItem(THEME_KEY) || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? '<span class="badge num" id="nav-badge"></span>' : ""}</button>`
          )
          .join("")}</div>`
    ).join("");
    document.getElementById("app").innerHTML = `
      <div class="app" id="app-grid">
        <nav class="sidebar"><div class="sidebar-head"><span class="brand-mark">τ</span><span class="brand-name">Tau</span></div>${nav}
          <div class="nav-spacer"></div><button class="nav-item">${icon("sliders")}设置</button></nav>
        <div></div>
        <main class="main">
          <div class="titlebar">
            <button class="titlebar-btn" id="nav-back" title="后退 (Alt+←)" disabled>${icon("back")}</button>
            <button class="titlebar-btn" disabled title="前进 (Alt+→)">${icon("fwd")}</button>
            <span class="titlebar-crumb" id="crumb">${crumb}</span>
            <span class="titlebar-spacer"></span>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
          <div class="statusbar" id="statusbar"></div>
        </main>
      </div>`;
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    return {
      page: document.getElementById("page-root"),
      status: document.getElementById("statusbar"),
      crumb: document.getElementById("crumb"),
      back: document.getElementById("nav-back"),
    };
  }
  function setNavBadge() {
    const b = document.getElementById("nav-badge");
    if (b) b.textContent = queue(null).length || "";
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
  const menuOpen = () => !!menuEl;
  function openMenu(anchor, entries, onPick, opts = {}) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    if (opts.width) el.style.width = opts.width + "px";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.header
            ? `<div class="menu-label">${e.header}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}${e.checked ? " checked" : ""}" data-i="${i}">${e.deck ? `<span class="deck-mark sm" style="${deckCss(e.deck)}">${deckGlyph(e.deck)}</span>` : e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const w = el.offsetWidth,
      h = el.offsetHeight;
    let x = opts.alignRight ? r.right - w : r.left,
      y = r.bottom + 6;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    el.style.left = Math.max(8, x) + "px";
    el.style.top = y + "px";
    requestAnimationFrame(() => el.classList.add("open"));
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const e = entries[+b.dataset.i];
      closeMenu();
      onPick(e);
    });
    const onDown = ev => {
      if (
        !el.contains(ev.target) &&
        ev.target !== anchor &&
        !(anchor.contains && anchor.contains(ev.target))
      )
        closeMenu();
    };
    const onKey = ev => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        closeMenu();
      }
    };
    setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey, true);
    menuEl = el;
    menuCleanup = () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }

  /* ============ Toast ============ */
  let toastEl = null,
    toastTimer = null;
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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  /* ============ Dialog（遮罩 + 居中；Esc / 点遮罩关闭） ============ */
  let dlgStack = [];
  function openDialog({ width = 560, html, onMount, onClose }) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    const dl = document.createElement("div");
    dl.className = "dialog";
    dl.style.width = width + "px";
    dl.innerHTML = html;
    document.body.append(ov, dl);
    requestAnimationFrame(() => {
      ov.classList.add("open");
      dl.classList.add("open");
    });
    const api = {
      el: dl,
      close() {
        ov.classList.remove("open");
        dl.classList.remove("open");
        document.removeEventListener("keydown", onKey, true);
        dlgStack = dlgStack.filter(x => x !== api);
        setTimeout(() => {
          ov.remove();
          dl.remove();
        }, 200);
        onClose && onClose();
      },
    };
    const onKey = e => {
      if (e.key === "Escape" && dlgStack[dlgStack.length - 1] === api && !menuOpen()) {
        e.stopPropagation();
        api.close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("click", () => api.close());
    dl.querySelectorAll("[data-close]").forEach(b =>
      b.addEventListener("click", () => api.close())
    );
    dlgStack.push(api);
    onMount && onMount(api);
    return api;
  }
  const dialogOpen = () => dlgStack.length > 0;

  /* =====================================================================
     复习引擎：mountReview(el, { queue, onExit, onEdit, onProgress, compact })
     阶段：answer（作答）→ revealed（翻面 + 评分）；键位：
       作答  A–F 选项 / Enter 提交 / Space 显示答案（问答）
       评分  1 忘记 · 2 模糊 · 3 记得 · 4 轻松
       任意  E 编辑本卡 · S 暂停本卡 · ⌘Z 撤销上一张 · Esc 退出
     ===================================================================== */
  function mountReview(el, opts) {
    const list = opts.queue.slice();
    const st = {
      i: 0,
      phase: "answer",
      ans: {},
      correct: null,
      dist: { hard: 0, struggle: 0, normal: 0, easy: 0 },
      undo: [],
      started: Date.now(),
      judge: null,
    };
    const LET = "ABCDEF";
    // 在 Dialog 里挂载时只响应本层键盘；其上再叠 Dialog（如编辑）或 Menu 时让出
    const baseDepth = dlgStack.length;
    function cur() {
      return list[st.i];
    }
    function emit() {
      opts.onProgress &&
        opts.onProgress({
          index: st.i,
          total: list.length,
          dist: st.dist,
          card: cur(),
          phase: st.phase,
        });
    }
    function reset() {
      st.phase = "answer";
      st.ans = {};
      st.correct = null;
      st.judge = null;
    }
    function check(c) {
      switch (c.type) {
        case "single-choice":
          return c.options.find(o => o.isCorrect)?.id === st.ans.single;
        case "multiple-choice": {
          const want = c.options
            .filter(o => o.isCorrect)
            .map(o => o.id)
            .sort()
            .join();
          return (st.ans.multi || []).slice().sort().join() === want;
        }
        case "boolean":
          return st.ans.bool === c.booleanAnswer;
        case "cloze":
          return blanksOf(c).every((b, i) => {
            const v = (st.ans.cloze?.[i] || "").trim().toLowerCase();
            return [b.answer, ...b.alts].some(a => a.toLowerCase() === v);
          });
        default:
          return null;
      }
    }
    function submit() {
      const c = cur();
      if (!c || st.phase !== "answer") return;
      if (c.type === "cloze") st.ans.cloze = [...el.querySelectorAll(".blank")].map(i => i.value);
      if (c.type === "qa") st.ans.qa = el.querySelector(".rv-qa")?.value.trim() || "";
      st.correct = check(c);
      st.phase = "revealed";
      // 问答题：已配置模型且用户写了答案才调用 AI 评判；分数映射为推荐评分
      if (c.type === "qa" && st.ans.qa && opts.aiConfigured !== false) {
        st.judge = "loading";
        st.score = Math.min(10, 3 + Math.round(st.ans.qa.length / 6));
        setTimeout(() => {
          if (cur() === c && st.phase === "revealed") {
            st.judge = "done";
            render(false);
          }
        }, 1300);
      }
      render(false);
    }
    function scoreToRating(n) {
      return n >= 9 ? "easy" : n >= 6 ? "normal" : n >= 4 ? "struggle" : "hard";
    }
    function suggested(c) {
      if (c.type === "qa") return st.judge === "done" ? scoreToRating(st.score) : null;
      return st.correct ? "normal" : "hard";
    }
    function rate(v) {
      const c = cur();
      if (!c || st.phase !== "revealed") return;
      const btn = el.querySelector(`.rate.${v}`);
      btn && btn.classList.add("flash");
      const undoRec = recordReview(c, v);
      st.dist[v]++;
      st.undo.push({ i: st.i, v, undoRec });
      setTimeout(() => {
        st.i++;
        reset();
        render(true);
        setNavBadge();
      }, 140);
    }
    function undoLast() {
      const u = st.undo.pop();
      if (!u) return toast("没有可撤销的评分");
      u.undoRec();
      st.dist[u.v]--;
      st.i = u.i;
      reset();
      render(true);
      setNavBadge();
      toast(`已撤销上一张的「${RATINGS.find(r => r.value === u.v).label}」评分`);
    }
    function suspend() {
      const c = cur();
      if (!c) return;
      const prev = c.status;
      c.status = "suspended";
      list.splice(st.i, 1);
      reset();
      render(true);
      setNavBadge();
      toast("已暂停这张卡片，不再进入复习", () => {
        c.status = prev;
        list.splice(st.i, 0, c);
        reset();
        render(true);
        setNavBadge();
      });
    }

    function frontHTML(c) {
      const d = deckOf(c);
      const locked = st.phase === "revealed";
      let body = "";
      if (c.type === "single-choice" || c.type === "multiple-choice") {
        const multi = c.type === "multiple-choice";
        body = `<div class="rv-opts">${c.options
          .map((o, i) => {
            const chosen = multi ? (st.ans.multi || []).includes(o.id) : st.ans.single === o.id;
            let cls = chosen ? " sel" : "";
            if (locked) cls = o.isCorrect ? " right" : chosen ? " wrong" : " dim";
            const why =
              locked && o.explanation && (o.isCorrect || chosen)
                ? `<span class="why">${o.explanation}</span>`
                : "";
            return `<button class="rv-opt${multi ? " multi" : ""}${cls}" data-opt="${o.id}" ${locked ? "disabled" : ""}><span class="k">${LET[i]}</span><span>${o.label}</span>${why}</button>`;
          })
          .join("")}</div>`;
      } else if (c.type === "boolean") {
        body = `<div class="rv-bool">${[true, false]
          .map((v, i) => {
            const chosen = st.ans.bool === v;
            let cls = chosen ? " sel" : "";
            if (locked) cls = v === c.booleanAnswer ? " right" : chosen ? " wrong" : " dim";
            return `<button class="rv-opt${cls}" data-bool="${v}" ${locked ? "disabled" : ""}><span class="k">${LET[i]}</span>${v ? "正确" : "错误"}</button>`;
          })
          .join("")}</div>`;
      } else if (c.type === "qa") {
        body = locked
          ? st.ans.qa
            ? `<div class="small muted" style="margin-bottom:4px">你的回答</div><div style="white-space:pre-wrap;color:var(--ink-2)">${esc(st.ans.qa)}</div>`
            : ""
          : `<textarea class="textarea rv-qa" placeholder="先在心里或这里作答，再显示答案（可留空）"></textarea>`;
      }
      let prompt = c.prompt;
      if (c.type === "cloze") {
        const bl = blanksOf(c);
        let k = 0;
        prompt = c.prompt.replace(BLANK_RE, () => {
          const i = k++;
          const b = bl[i];
          if (!locked)
            return `<input class="blank" data-bi="${i}" size="${Math.max(4, b.answer.length + 1)}" autocomplete="off">`;
          const v = (st.ans.cloze?.[i] || "").trim();
          const ok = [b.answer, ...b.alts].some(a => a.toLowerCase() === v.toLowerCase());
          return ok
            ? `<span class="blank right">${esc(v)}</span>`
            : `${v ? `<span class="blank wrong">${esc(v)}</span>` : ""}<span class="blank-fix">${esc(b.answer)}</span>`;
        });
      }
      const hint =
        c.hint && !locked
          ? `<div class="rv-hint">${icon("bulb")}<button data-hint>显示提示</button></div>`
          : "";
      return `
        <div class="rv-meta">
          <span class="deck"><span class="deck-mark sm" style="${deckCss(d)}">${deckGlyph(d)}</span>${d.name}</span>
          <span class="type-chip">${icon(TYPE_META[c.type].icon)}${TYPE_META[c.type].label}</span>
          <span class="st ${c.status}">${STATUS_LABEL[c.status]}</span>
          <span class="grow"></span>
          <button class="icon-btn sm" data-act="edit" title="编辑 (E)">${icon("edit")}</button>
          <button class="icon-btn sm" data-act="more" title="更多">${icon("more")}</button>
        </div>
        <div class="rv-prompt">${prompt}</div>${hint}
        ${body ? `<div class="rv-body">${body}</div>` : ""}`;
    }
    function backHTML(c) {
      let verdict = "";
      if (st.correct === true)
        verdict = `<div class="rv-verdict ok">${icon("check-circle")}回答正确</div>`;
      if (st.correct === false)
        verdict = `<div class="rv-verdict bad">${icon("x-circle")}回答有误</div>`;
      const std =
        c.type === "qa"
          ? `<h4>参考答案</h4><div class="std">${c.answer}</div>`
          : c.type === "boolean"
            ? `<h4>答案</h4><div class="std">${c.booleanAnswer ? "正确" : "错误"}</div>`
            : "";
      const judge =
        c.type === "qa" && st.judge
          ? st.judge === "loading"
            ? `<div class="ai-judge"><div class="head">${icon("sparkles")}AI 评判<span class="loading" style="margin-left:6px"><span class="spin"></span>对照参考答案中…</span></div></div>`
            : `<div class="ai-judge"><div class="head">${icon("sparkles")}AI 评判<span class="score">${st.score} / 10</span></div>
                <p>${st.score >= 9 ? "要点完整，表述准确。" : st.score >= 6 ? "要点基本覆盖，表述可以更完整。" : "只答到了部分要点，建议对照参考答案再看一遍。"}已按分数推荐「${RATINGS.find(r => r.value === scoreToRating(st.score)).label}」，可以改。</p>
                <div class="lbl">遗漏</div><ul><li>${plain(c.answer).split(/[、，；。]/)[1] || "关键条件之一"}</li></ul></div>`
          : "";
      const detail = c.detail ? `<h4>解析</h4><div class="detail">${c.detail}</div>` : "";
      const refs = c.refs.length
        ? `<h4>参考资料</h4><div class="rv-refs">${c.refs.map(r => `<button class="rv-ref">${icon(r.kind === "卡片" ? "card" : "file-text")}${r.title}</button>`).join("")}</div>`
        : "";
      const inner = verdict + std + judge + detail + refs;
      return inner ? `<div class="rv-answer">${inner}</div>` : "";
    }
    function actionHTML(c) {
      if (st.phase === "answer") {
        const needSubmit = c.type === "multiple-choice" || c.type === "cloze";
        if (c.type === "qa")
          return `<div class="rv-action"><button class="btn btn-primary" data-act="submit">显示答案<kbd>Space</kbd></button></div>`;
        if (needSubmit)
          return `<div class="rv-action"><button class="btn btn-ghost" data-act="giveup">不会，看答案</button><button class="btn btn-primary" data-act="submit">提交<kbd>↵</kbd></button></div>`;
        return `<div class="rv-action"><span class="small muted">选择一项即提交 · 按 ${c.type === "boolean" ? "A / B" : "A–" + LET[c.options.length - 1]}</span></div>`;
      }
      const sug = suggested(c);
      return `<div class="rate-bar${opts.flatRates ? " flat" : ""}">${RATINGS.map(r => {
        const s = schedule(c, r.value);
        return `<button class="rate ${r.value}" data-rate="${r.value}" ${sug === r.value ? 'style="box-shadow:0 0 0 1.5px var(--rc) inset' + (opts.flatRates ? "" : ",var(--shadow-card)") + '"' : ""}><kbd>${r.key}</kbd><b>${r.label}</b><span>${fmtSpan(s.interval)}后</span></button>`;
      }).join("")}</div>`;
    }
    function doneHTML() {
      const n = st.undo.length;
      const ok = st.dist.normal + st.dist.easy;
      const mins = Math.max(1, Math.round((Date.now() - st.started) / 60000));
      const tomorrow = cards.filter(c => c.status !== "suspended" && dayDiff(c.due) === 1).length;
      const forgot = list.filter(c => c.status === "learning" && c.due - NOW <= 30 * MIN).length;
      return `<div class="rv-done enter">
        <div class="big">${n ? "这一轮复习完成了" : "没有需要复习的卡片"}</div>
        <p>${n ? `共 ${n} 张 · 记住 ${Math.round((ok / n) * 100)}% · 用时约 ${mins} 分钟 · 明天有 ${tomorrow} 张到期` : "今天的队列已清空，明天再来。"}</p>
        ${n ? `<div class="dist">${RATINGS.map(r => `<div><b style="color:var(--${{ hard: "danger", struggle: "warn", normal: "ok", easy: "info" }[r.value]})">${st.dist[r.value]}</b><span class="muted">${r.label}</span></div>`).join("")}</div>` : ""}
        <div class="acts">${forgot ? `<button class="btn btn-soft" data-act="again">${icon("repeat")}再过一遍刚忘记的 ${forgot} 张</button>` : ""}<button class="btn btn-primary" data-act="exit">完成</button></div>
      </div>`;
    }
    function render(animate) {
      const c = cur();
      emit();
      if (!c) {
        el.innerHTML = doneHTML();
        bind();
        return;
      }
      const host = opts.flat ? "rv-card flat" : "rv-card";
      el.innerHTML = `<div class="${host} phase-${st.phase}${animate ? " enter" : ""}">${frontHTML(c)}${st.phase === "revealed" ? backHTML(c) : ""}</div><div class="rv-actions" style="margin-top:18px">${actionHTML(c)}</div>`;
      bind();
      if (st.phase === "answer") {
        const f = el.querySelector(".blank") || null;
        f && f.focus();
      }
    }
    function bind() {
      el.querySelectorAll("[data-opt]").forEach(b =>
        b.addEventListener("click", () => pickOpt(b.dataset.opt))
      );
      el.querySelectorAll("[data-bool]").forEach(b =>
        b.addEventListener("click", () => {
          st.ans.bool = b.dataset.bool === "true";
          submit();
        })
      );
      el.querySelectorAll("[data-rate]").forEach(b =>
        b.addEventListener("click", () => rate(b.dataset.rate))
      );
      el.querySelector("[data-hint]")?.addEventListener("click", e => {
        e.currentTarget.parentElement.innerHTML = `${icon("bulb")}${cur().hint}`;
      });
      el.querySelectorAll("[data-act]").forEach(b =>
        b.addEventListener("click", e => {
          const a = b.dataset.act;
          if (a === "submit") submit();
          if (a === "giveup") {
            submit();
          }
          if (a === "edit") opts.onEdit && opts.onEdit(cur(), () => render(false));
          if (a === "more")
            openMenu(
              b,
              [
                { icon: "pause", label: "暂停这张卡片", k: "S", v: "s" },
                { icon: "undo", label: "撤销上一张评分", k: "⌘Z", v: "u" },
                "-",
                { icon: "skip", label: "跳过，放到队尾", v: "k" },
              ],
              e2 => {
                if (e2.v === "s") suspend();
                if (e2.v === "u") undoLast();
                if (e2.v === "k") {
                  list.push(list.splice(st.i, 1)[0]);
                  reset();
                  render(true);
                }
              },
              { alignRight: true }
            );
          if (a === "exit") opts.onExit && opts.onExit(st);
          if (a === "again") {
            const again = list.filter(c => c.status === "learning" && c.due - NOW <= 30 * MIN);
            list.length = 0;
            list.push(...again);
            st.i = 0;
            st.undo = [];
            st.dist = { hard: 0, struggle: 0, normal: 0, easy: 0 };
            reset();
            render(true);
          }
        })
      );
      el.querySelectorAll(".blank").forEach((inp, i, all) =>
        inp.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (i < all.length - 1 && !e.shiftKey && all[i + 1].value === "") all[i + 1].focus();
            else submit();
          }
        })
      );
      el.querySelector(".rv-qa")?.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      });
    }
    function pickOpt(id) {
      const c = cur();
      if (st.phase !== "answer") return;
      if (c.type === "single-choice") {
        st.ans.single = id;
        submit();
      } else {
        const s = new Set(st.ans.multi || []);
        s.has(id) ? s.delete(id) : s.add(id);
        st.ans.multi = [...s];
        render(false);
      }
    }
    function onKey(e) {
      if (dlgStack.length > baseDepth || menuOpen()) return;
      const c = cur();
      const typing =
        /INPUT|TEXTAREA/.test(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        return undoLast();
      }
      if (e.key === "Escape") {
        if (typing) return document.activeElement.blur();
        return opts.onExit && opts.onExit(st);
      }
      if (!c || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "e") return opts.onEdit && opts.onEdit(c, () => render(false));
      if (k === "s") return suspend();
      if (st.phase === "answer") {
        if (c.type === "single-choice" || c.type === "multiple-choice") {
          const idx = LET.toLowerCase().indexOf(k);
          if (idx >= 0 && idx < c.options.length) return pickOpt(c.options[idx].id);
        }
        if (c.type === "boolean" && (k === "a" || k === "b")) {
          st.ans.bool = k === "a";
          return submit();
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          return submit();
        }
      } else {
        const r = RATINGS.find(x => x.key === e.key);
        if (r) return rate(r.value);
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          return rate(suggested(c) || "normal");
        }
      }
    }
    document.addEventListener("keydown", onKey);
    render(true);
    return {
      destroy() {
        document.removeEventListener("keydown", onKey);
      },
      rerender: () => render(false),
    };
  }

  /* =====================================================================
     编辑器：renderEditor(el, card | null, { deckId, onSave, onCancel, layout })
     内容：卡组 / 题型 / 难度 → 题干 → 答案区（按题型）→ 提示 → 解析 → 标签 → 参考资料 → 复习信息（编辑态）
     layout: "dialog"（单列）| "split"（左题面右属性）| "inline"（窄列，属性收为两列小格）
     ===================================================================== */
  function renderEditor(el, card, o = {}) {
    const draft = card
      ? JSON.parse(JSON.stringify(card))
      : {
          id: null,
          deckId: o.deckId || decks[0].id,
          type: o.type || "qa",
          prompt: "",
          options: [
            { id: "o0", label: "", isCorrect: true },
            { id: "o1", label: "", isCorrect: false },
          ],
          answer: "",
          booleanAnswer: true,
          hint: "",
          detail: "",
          tags: [],
          difficulty: "standard",
          refs: [],
          status: "new",
        };
    if (!draft.options.length)
      draft.options = [
        { id: "o0", label: "", isCorrect: true },
        { id: "o1", label: "", isCorrect: false },
      ];
    const layout = o.layout || "dialog";

    function seg(name, items, val) {
      return `<div class="seg sm" data-seg="${name}">${items.map(([v, l, ic]) => `<button class="${v === val ? "on" : ""}" data-v="${v}">${ic ? icon(ic) : ""}${l}</button>`).join("")}</div>`;
    }
    function answerHTML() {
      const t = draft.type;
      if (t === "single-choice" || t === "multiple-choice")
        return `<div class="field"><div class="lbl">选项<span class="aux">点字母标记${t === "single-choice" ? "唯一" : ""}正确答案</span></div>
          <div class="stack" style="gap:6px">${draft.options
            .map(
              (op, i) =>
                `<div class="opt-edit${op.isCorrect ? " correct" : ""}" data-oi="${i}"><button class="mark" data-mark="${i}" title="标为正确">${"ABCDEF"[i]}</button><input class="input" data-olabel="${i}" value="${esc(plain(op.label))}" placeholder="选项 ${i + 1}"><button class="icon-btn sm" data-odel="${i}" title="删除">${icon("x")}</button></div>`
            )
            .join("")}
          ${draft.options.length < 6 ? `<button class="add-ref" data-oadd>${icon("plus")}添加选项</button>` : ""}</div></div>`;
      if (t === "boolean")
        return `<div class="field"><div class="lbl">答案</div>${seg(
          "bool",
          [
            ["true", "正确", "check"],
            ["false", "错误", "x"],
          ],
          String(draft.booleanAnswer)
        )}</div>`;
      if (t === "qa")
        return `<div class="field"><div class="lbl">参考答案<span class="aux">复习时用于对照，配置模型后可 AI 评判</span></div><textarea class="textarea" data-f="answer" placeholder="标准答案或要点">${esc(plain(draft.answer))}</textarea></div>`;
      if (t === "cloze") {
        const bl = blanksOf(draft);
        return `<div class="field"><div class="lbl">填空<span class="aux">在题干中选中文字，按 ⌘⇧C 或点「设为填空」</span></div>
          ${bl.length ? `<div class="stack" style="gap:6px">${bl.map((b, i) => `<div class="opt-edit"><span class="mark">${i + 1}</span><span class="blank-src" style="flex:none">${esc(b.answer)}</span><input class="input" data-alt="${i}" value="${esc(b.alts.join("，"))}" placeholder="备选答案（逗号分隔，可空）"></div>`).join("")}</div>` : `<div class="small muted">还没有填空</div>`}</div>`;
      }
      return "";
    }
    function promptEditable() {
      // 填空在编辑态以高亮片段呈现
      return draft.prompt.replace(
        BLANK_RE,
        (_, body) =>
          `<span class="blank-src" data-blank="${esc(body)}">${esc(body.split("|")[0])}</span>`
      );
    }
    const metaHTML = () => `
      <div class="field"><div class="lbl">卡组</div><button class="btn btn-soft" data-deck style="justify-content:flex-start">${(() => {
        const d = deckById(draft.deckId);
        return `<span class="deck-mark sm" style="${deckCss(d)}">${deckGlyph(d)}</span>${d.name}`;
      })()}${icon("chev-down")}</button></div>
      <div class="field"><div class="lbl">难度</div>${seg(
        "difficulty",
        [
          ["foundation", "基础"],
          ["standard", "常规"],
          ["advanced", "进阶"],
        ],
        draft.difficulty
      )}</div>`;
    const tagsHTML = () =>
      `<div class="field"><div class="lbl">标签</div><div class="chips input" style="padding:5px 6px">${draft.tags.map((t, i) => `<span class="chip">${esc(t)}<button data-tdel="${i}">${icon("x")}</button></span>`).join("")}<input class="chip-input" data-tadd placeholder="${draft.tags.length ? "" : "回车添加标签"}"></div></div>`;
    const refsHTML =
      () => `<div class="field"><div class="lbl">参考资料<span class="aux">复习翻面后可跳转</span></div>
      ${draft.refs.map((r, i) => `<div class="ref-row">${icon(r.kind === "卡片" ? "card" : "file-text")}<span>${esc(r.title)}</span><span class="kind">${r.kind}</span><button class="icon-btn sm" data-rdel="${i}">${icon("x")}</button></div>`).join("")}
      <div style="display:flex;gap:4px"><button class="add-ref" data-radd="note">${icon("link")}关联笔记</button><button class="add-ref" data-radd="custom">${icon("plus")}自定义资料</button></div></div>`;
    const schedHTML = () =>
      card
        ? `<div class="field"><div class="lbl">复习信息</div><div class="small" style="color:var(--ink-2);display:grid;grid-template-columns:auto 1fr;gap:3px 14px">
          <span class="muted">状态</span><span class="st ${card.status}">${STATUS_LABEL[card.status]}</span>
          <span class="muted">下次复习</span><span>${dueInfo(card).text}</span>
          <span class="muted">已复习</span><span class="num">${card.reviewCount} 次 · 熟练度 ${card.level}/9</span></div></div>`
        : "";
    function html() {
      const typeSeg = seg(
        "type",
        TYPE_ORDER.map(t => [t, TYPE_META[t].label, TYPE_META[t].icon]),
        draft.type
      );
      const promptField = `<div class="field"><div class="lbl">题干${draft.type === "cloze" ? `<span class="aux"><button class="btn btn-ghost" style="height:22px;padding:0 7px;font-size:11.5px" data-mkblank>${icon("text-cursor")}设为填空</button></span>` : ""}</div><div class="rich prompt" contenteditable="true" data-ph="${draft.type === "qa" ? "问题，或要记住的词条" : "题目内容"}" data-f="prompt">${promptEditable()}</div></div>`;
      const hintField = `<div class="field"><div class="lbl">提示<span class="aux">可选，复习时点开才显示</span></div><input class="input" data-f="hint" value="${esc(draft.hint)}" placeholder="一句话线索"></div>`;
      const detailField = `<div class="field"><div class="lbl">解析</div><div class="rich" contenteditable="true" data-ph="为什么是这个答案 · 可选" data-f="detail">${draft.detail}</div></div>`;
      if (layout === "split")
        return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 236px;gap:26px">
          <div class="stack"><div>${typeSeg}</div>${promptField}${answerHTML()}${hintField}${detailField}</div>
          <div class="stack">${metaHTML()}${tagsHTML()}${refsHTML()}${schedHTML()}</div></div>`;
      if (layout === "inline")
        return `<div class="stack"><div style="overflow-x:auto;scrollbar-width:none">${typeSeg}</div>${promptField}${answerHTML()}${hintField}${detailField}<div class="row2">${metaHTML()}</div>${tagsHTML()}${refsHTML()}${schedHTML()}</div>`;
      return `<div class="stack"><div style="display:flex;gap:10px;align-items:center">${typeSeg}</div>${promptField}${answerHTML()}${detailField}<div class="row2">${metaHTML()}</div>${hintField}${tagsHTML()}${refsHTML()}</div>`;
    }
    function syncPrompt() {
      const p = el.querySelector('[data-f="prompt"]');
      if (!p) return;
      const clone = p.cloneNode(true);
      clone.querySelectorAll("[data-blank]").forEach(s => s.replaceWith(`{{${s.dataset.blank}}}`));
      draft.prompt = clone.innerHTML.replace(/&nbsp;/g, " ");
      const d = el.querySelector('[data-f="detail"]');
      if (d) draft.detail = d.innerHTML;
      const h = el.querySelector('[data-f="hint"]');
      if (h) draft.hint = h.value;
      const a = el.querySelector('[data-f="answer"]');
      if (a) draft.answer = a.value;
      el.querySelectorAll("[data-olabel]").forEach(
        i => (draft.options[+i.dataset.olabel].label = esc(i.value))
      );
    }
    function paint() {
      el.innerHTML = html();
      wire();
    }
    function wire() {
      el.querySelectorAll("[data-seg]").forEach(sg =>
        sg.querySelectorAll("button").forEach(b =>
          b.addEventListener("click", () => {
            syncPrompt();
            const k = sg.dataset.seg;
            if (k === "type") draft.type = b.dataset.v;
            if (k === "difficulty") draft.difficulty = b.dataset.v;
            if (k === "bool") draft.booleanAnswer = b.dataset.v === "true";
            paint();
          })
        )
      );
      el.querySelectorAll("[data-mark]").forEach(b =>
        b.addEventListener("click", () => {
          syncPrompt();
          const i = +b.dataset.mark;
          if (draft.type === "single-choice")
            draft.options.forEach((op, j) => (op.isCorrect = j === i));
          else draft.options[i].isCorrect = !draft.options[i].isCorrect;
          paint();
        })
      );
      el.querySelectorAll("[data-odel]").forEach(b =>
        b.addEventListener("click", () => {
          syncPrompt();
          if (draft.options.length > 2) draft.options.splice(+b.dataset.odel, 1);
          paint();
        })
      );
      el.querySelector("[data-oadd]")?.addEventListener("click", () => {
        syncPrompt();
        draft.options.push({ id: "o" + seq++, label: "", isCorrect: false });
        paint();
        el.querySelectorAll("[data-olabel]")[draft.options.length - 1].focus();
      });
      el.querySelector("[data-mkblank]")?.addEventListener("click", makeBlank);
      el.querySelector('[data-f="prompt"]')?.addEventListener("keydown", e => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
          e.preventDefault();
          makeBlank();
        }
      });
      el.querySelectorAll("[data-alt]").forEach(inp =>
        inp.addEventListener("change", () => {
          syncPrompt();
          const i = +inp.dataset.alt;
          let k = 0;
          draft.prompt = draft.prompt.replace(BLANK_RE, (m, body) => {
            if (k++ !== i) return m;
            const alts = inp.value
              .split(/[,，]/)
              .map(s => s.trim())
              .filter(Boolean);
            return `{{${[body.split("|")[0], ...alts].join("|")}}}`;
          });
        })
      );
      el.querySelector("[data-tadd]")?.addEventListener("keydown", e => {
        if (e.key === "Enter" && e.target.value.trim()) {
          e.preventDefault();
          e.stopPropagation();
          syncPrompt();
          draft.tags.push(e.target.value.trim());
          paint();
          el.querySelector("[data-tadd]").focus();
        }
      });
      el.querySelectorAll("[data-tdel]").forEach(b =>
        b.addEventListener("click", () => {
          syncPrompt();
          draft.tags.splice(+b.dataset.tdel, 1);
          paint();
        })
      );
      el.querySelectorAll("[data-rdel]").forEach(b =>
        b.addEventListener("click", () => {
          syncPrompt();
          draft.refs.splice(+b.dataset.rdel, 1);
          paint();
        })
      );
      el.querySelectorAll("[data-radd]").forEach(b =>
        b.addEventListener("click", () => {
          syncPrompt();
          if (b.dataset.radd === "note")
            openMenu(
              b,
              [
                { header: "最近的笔记（复用 ContentSelector）" },
                { icon: "file-text", label: "CSAPP 第 9 章 · 虚拟内存", kind: "文章" },
                { icon: "file-text", label: "React 源码阅读 · Scheduler 与 Lane", kind: "文章" },
                { icon: "card", label: "Hooks 链表", kind: "卡片" },
              ],
              e => {
                draft.refs.push({ title: e.label, kind: e.kind });
                paint();
              }
            );
          else {
            draft.refs.push({ title: "自定义资料 " + (draft.refs.length + 1), kind: "自定义" });
            paint();
          }
        })
      );
      el.querySelector("[data-deck]")?.addEventListener("click", e =>
        openMenu(
          e.currentTarget,
          decks.map(d => ({ deck: d, label: d.name, checked: d.id === draft.deckId, id: d.id })),
          p => {
            syncPrompt();
            draft.deckId = p.id;
            paint();
          }
        )
      );
    }
    function makeBlank() {
      const sel = getSelection();
      const p = el.querySelector('[data-f="prompt"]');
      if (!sel.rangeCount || sel.isCollapsed || !p.contains(sel.anchorNode))
        return toast("先在题干里选中要挖空的文字");
      const r = sel.getRangeAt(0);
      const text = r.toString().trim();
      const span = document.createElement("span");
      span.className = "blank-src";
      span.dataset.blank = text;
      span.textContent = text;
      r.deleteContents();
      r.insertNode(span);
      syncPrompt();
      paint();
    }
    paint();
    return {
      getDraft() {
        syncPrompt();
        return draft;
      },
      validate() {
        syncPrompt();
        if (!plain(draft.prompt).trim()) return "题干不能为空";
        if (draft.type === "cloze" && !blanksOf(draft).length) return "填空题至少需要一个填空";
        if (
          (draft.type === "single-choice" || draft.type === "multiple-choice") &&
          !draft.options.some(x => x.isCorrect)
        )
          return "请标记正确答案";
        return null;
      },
    };
  }
  /** 保存草稿到数据：新建 push / 编辑 assign */
  function commitDraft(draft, original) {
    if (original) {
      Object.assign(original, {
        deckId: draft.deckId,
        type: draft.type,
        prompt: draft.prompt,
        options: draft.options,
        answer: draft.answer,
        booleanAnswer: draft.booleanAnswer,
        hint: draft.hint,
        detail: draft.detail,
        tags: draft.tags,
        difficulty: draft.difficulty,
        refs: draft.refs,
      });
      return original;
    }
    const c = {
      ...draft,
      id: cards.length + 1000 + seq++,
      status: "new",
      level: 0,
      ease: 2.5,
      reviewCount: 0,
      due: NOW,
      lastReview: null,
      createTime: Date.now(),
    };
    cards.push(c);
    return c;
  }
  /** 编辑器 Dialog（A / C 方案共用承载；B 方案内联到检查器） */
  function openEditorDialog(card, { deckId, type, onSaved, layout = "split" } = {}) {
    let ed;
    const isEdit = !!card;
    openDialog({
      width: layout === "split" ? 880 : 620,
      html: `<div class="dlg-head"><h3>${isEdit ? "编辑闪卡" : "新建闪卡"}</h3><span class="sub">${isEdit ? `${deckOf(card).name} · 修改不影响复习进度` : "⌘↵ 保存"}</span><span style="flex:1"></span><button class="icon-btn" data-close>${icon("x")}</button></div>
        <div class="dlg-body scroller" data-ed></div>
        <div class="dlg-foot">${isEdit ? `<button class="btn btn-ghost" data-more>${icon("more")}</button>` : `<span class="hint"><kbd>⌘</kbd><kbd>↵</kbd> 保存 · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↵</kbd> 保存并继续新建</span>`}<span style="flex:1"></span><button class="btn btn-ghost" data-close>取消</button>${isEdit ? "" : '<button class="btn btn-soft" data-save="next">保存并新建</button>'}<button class="btn btn-primary" data-save="1">保存</button></div>`,
      onMount(api) {
        const mount = () =>
          (ed = renderEditor(api.el.querySelector("[data-ed]"), card, { deckId, type, layout }));
        mount();
        const save = next => {
          const err = ed.validate();
          if (err) return toast(err);
          const saved = commitDraft(ed.getDraft(), card);
          onSaved && onSaved(saved);
          setNavBadge();
          if (next) {
            toast("已保存，继续新建下一张");
            deckId = saved.deckId;
            type = saved.type;
            card = null;
            mount();
          } else {
            api.close();
            toast(isEdit ? "已保存修改" : "已新建闪卡");
          }
        };
        api.el
          .querySelectorAll("[data-save]")
          .forEach(b => b.addEventListener("click", () => save(b.dataset.save === "next")));
        api.el.addEventListener("keydown", e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save(e.shiftKey && !isEdit);
          }
        });
        api.el.querySelector("[data-more]")?.addEventListener("click", e =>
          openMenu(
            e.currentTarget,
            [
              {
                icon: "pause",
                label: card.status === "suspended" ? "恢复复习" : "暂停复习",
                v: "p",
              },
              { icon: "undo", label: "重置复习进度", v: "r" },
              "-",
              { icon: "trash", label: "删除闪卡", danger: true, v: "d" },
            ],
            p => {
              if (p.v === "d") {
                const idx = cards.indexOf(card);
                cards.splice(idx, 1);
                api.close();
                onSaved && onSaved(null);
                setNavBadge();
                toast("已删除闪卡", () => {
                  cards.splice(idx, 0, card);
                  onSaved && onSaved(card);
                  setNavBadge();
                });
              }
              if (p.v === "p") {
                card.status = card.status === "suspended" ? "review" : "suspended";
                api.close();
                onSaved && onSaved(card);
                setNavBadge();
                toast(card.status === "suspended" ? "已暂停，不再进入复习" : "已恢复复习");
              }
              if (p.v === "r") {
                Object.assign(card, {
                  status: "new",
                  level: 0,
                  ease: 2.5,
                  reviewCount: 0,
                  due: NOW,
                });
                api.close();
                onSaved && onSaved(card);
                setNavBadge();
                toast("已重置为新卡");
              }
            }
          )
        );
      },
    });
  }

  /* ============ 卡组表单（新建 / 编辑） ============ */
  const ICON_KEYS = Object.keys(DECK_ICON_KEYS);
  function openDeckDialog(deck, onSaved) {
    const d = deck ? { ...deck } : { name: "", icon: "brain", color: "tag-2", description: "" };
    const body = () => `
      <div class="stack">
        <div style="display:flex;gap:12px;align-items:flex-end">
          <span class="deck-mark lg" style="${deckCss(d)}">${deckGlyph(d)}</span>
          <div class="field" style="flex:1"><div class="lbl">名称</div><input class="input" data-n value="${esc(d.name)}" placeholder="例如：操作系统"></div>
        </div>
        <div class="field"><div class="lbl">图标</div><div class="chips">${ICON_KEYS.map(k => `<button class="icon-btn" data-emo="${k}" style="width:32px;height:32px;${k === d.icon ? "background:var(--bg-selected);color:var(--accent-text)" : ""}">${icon(DECK_ICON_KEYS[k])}</button>`).join("")}</div></div>
        <div class="field"><div class="lbl">颜色<span class="aux">只用于识别卡组</span></div><div class="chips">${DECK_COLORS.map(c => `<button data-col="${c}" style="width:24px;height:24px;border-radius:8px;background:var(--${c});${c === d.color ? "box-shadow:0 0 0 2px var(--bg-surface),0 0 0 4px var(--" + c + ")" : ""}"></button>`).join("")}</div></div>
        <div class="field"><div class="lbl">描述<span class="aux">可选</span></div><textarea class="textarea" data-desc placeholder="这个卡组复习什么">${esc(d.description)}</textarea></div>
      </div>`;
    openDialog({
      width: 440,
      html: `<div class="dlg-head"><h3>${deck ? "编辑卡组" : "新建卡组"}</h3><span style="flex:1"></span><button class="icon-btn" data-close>${icon("x")}</button></div>
        <div class="dlg-body" data-body>${body()}</div>
        <div class="dlg-foot">${deck ? '<button class="btn btn-ghost" data-del style="color:var(--danger)">删除卡组</button>' : ""}<span style="flex:1"></span><button class="btn btn-ghost" data-close>取消</button><button class="btn btn-primary" data-ok>${deck ? "保存" : "创建"}</button></div>`,
      onMount(api) {
        const root = api.el.querySelector("[data-body]");
        const sync = () => {
          d.name = root.querySelector("[data-n]").value;
          d.description = root.querySelector("[data-desc]").value;
        };
        const wire = () => {
          root.querySelectorAll("[data-emo]").forEach(b =>
            b.addEventListener("click", () => {
              sync();
              d.icon = b.dataset.emo;
              root.innerHTML = body();
              wire();
            })
          );
          root.querySelectorAll("[data-col]").forEach(b =>
            b.addEventListener("click", () => {
              sync();
              d.color = b.dataset.col;
              root.innerHTML = body();
              wire();
            })
          );
        };
        wire();
        setTimeout(() => root.querySelector("[data-n]").focus(), 60);
        api.el.querySelector("[data-ok]").addEventListener("click", () => {
          sync();
          if (!d.name.trim()) return toast("请填写卡组名称");
          if (deck) Object.assign(deck, d);
          else decks.push({ ...d, id: decks.length + 1 + seq++, sortOrder: decks.length });
          api.close();
          onSaved && onSaved(deck || decks[decks.length - 1]);
        });
        api.el.querySelector("[data-del]")?.addEventListener("click", () => {
          const n = cardsOf(deck.id).length;
          api.el.querySelector(".dlg-foot").innerHTML =
            `<span class="small" style="color:var(--danger)">将同时删除 ${n} 张闪卡与其复习记录，无法撤销。</span><span style="flex:1"></span><button class="btn btn-ghost" data-close2>取消</button><button class="btn btn-danger" data-del2>删除</button>`;
          api.el.querySelector("[data-close2]").onclick = () => api.close();
          api.el.querySelector("[data-del2]").onclick = () => {
            decks.splice(decks.indexOf(deck), 1);
            for (let i = cards.length - 1; i >= 0; i--)
              if (cards[i].deckId === deck.id) cards.splice(i, 1);
            api.close();
            onSaved && onSaved(null);
            setNavBadge();
            toast(`已删除卡组「${deck.name}」`);
          };
        });
      },
    });
  }

  /* ============ 小件 HTML ============ */
  const deckMark = (d, size = "") =>
    `<span class="deck-mark ${size}" style="${deckCss(d)}">${deckGlyph(d)}</span>`;
  const typeChip = c =>
    `<span class="type-chip">${icon(TYPE_META[c.type].icon)}${TYPE_META[c.type].label}</span>`;
  const statusDot = c => `<span class="st ${c.status}">${STATUS_LABEL[c.status]}</span>`;
  const dueSpan = c => {
    const d = dueInfo(c);
    return `<span class="due ${d.cls}">${d.text}</span>`;
  };
  function mixBar(s) {
    const t = Math.max(1, s.total - s.suspended);
    const n = cardsOf(null).length;
    return `<div class="mixbar" title="新 ${s.fresh} · 学习中 ${s.learning} · 巩固 ${s.review}"><i class="n" style="width:${(s.fresh / t) * 100}%"></i><i class="l" style="width:${(s.learning / t) * 100}%"></i><i class="r" style="width:${(s.review / t) * 100}%"></i></div>`;
  }
  function forecastBars(arr, max) {
    const m = max || Math.max(1, ...arr);
    return `<div class="fcast">${arr.map((v, i) => `<i class="${i === 0 ? "cur" : ""}" style="height:${Math.max(2, (v / m) * 22)}px" title="${i === 0 ? "今天" : i === 1 ? "明天" : WEEK_CN[new Date(NOW + i * DAY).getDay()]} ${v} 张"></i>`).join("")}</div>`;
  }

  window.FC = {
    icon,
    esc,
    NOW,
    DAY,
    HOUR,
    MIN,
    TODAY0,
    WEEK_CN,
    dayDiff,
    fmtSpan,
    dueInfo,
    TYPE_META,
    TYPE_ORDER,
    STATUS_LABEL,
    DIFF_LABEL,
    RATINGS,
    schedule,
    decks,
    cards,
    history,
    DECK_COLORS,
    deckCss,
    byId,
    deckOf,
    deckById,
    cardsOf,
    isDue,
    queue,
    deckStats,
    estMinutes,
    streak,
    sumDay,
    retention,
    blanksOf,
    promptText,
    answerText,
    plain,
    mountShell,
    setNavBadge,
    openMenu,
    closeMenu,
    menuOpen,
    toast,
    openDialog,
    dialogOpen,
    mountReview,
    renderEditor,
    commitDraft,
    openEditorDialog,
    openDeckDialog,
    deckMark,
    deckGlyph,
    typeChip,
    statusDot,
    dueSpan,
    mixBar,
    forecastBars,
  };
})();
