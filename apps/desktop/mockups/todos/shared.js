/*
  待办页三方案共用：图标 sprite / mock 数据 / 日期与周期工具 / 壳层 / Menu / Toast / 详情内容渲染。
  【视觉参考，非导出源】—— 三方案共用同一套数据与详情内容，差异只在布局与交互承载。
  数据形状对齐 src/types/todo.ts（TodoGroup / TodoItem / TodoRecurrence / TodoNoteLink）。
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

  /* ============ 日期工具（今天固定为 2026-09-24 周四，保证三方案演示一致） ============ */
  const TODAY = new Date(2026, 8, 24);
  const DAY = 86400000;
  const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  function at(md, hm) {
    // at("09-24", "17:00")
    const [m, d] = md.split("-").map(Number);
    const [h, mi] = (hm || "00:00").split(":").map(Number);
    return new Date(2026, m - 1, d, h, mi).getTime();
  }
  const startOfDay = t => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const dayDiff = t => Math.round((startOfDay(t) - TODAY.getTime()) / DAY);
  const hm = t => {
    const x = new Date(t);
    return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  };
  const md = t => {
    const x = new Date(t);
    return `${x.getMonth() + 1}月${x.getDate()}日`;
  };
  const endOfWeekDiff = 7 - (TODAY.getDay() || 7); // 本周剩余天数（周日为周末）
  function dayWord(t) {
    const d = dayDiff(t);
    if (d === 0) return "今天";
    if (d === 1) return "明天";
    if (d === 2) return "后天";
    if (d === -1) return "昨天";
    if (d > 0 && d <= endOfWeekDiff) return WEEK_CN[new Date(t).getDay()];
    return md(t);
  }
  const timePart = t => (hm(t) === "00:00" || hm(t) === "23:59" ? "" : " " + hm(t));

  /* ============ 周期规则（对齐 TodoRecurrence：daily/weekdays/weekly/monthly/yearly） ============ */
  function isScheduledOn(rec, t) {
    const x = new Date(t),
      wd = x.getDay();
    if (startOfDay(t) < startOfDay(rec.start)) return false;
    switch (rec.type) {
      case "daily":
        return true;
      case "weekdays":
        return wd >= 1 && wd <= 5;
      case "weekly":
        return rec.weekdays.includes(wd);
      case "monthly":
        return x.getDate() === rec.monthDay;
      default:
        return false;
    }
  }
  function nextOccurrence(rec, fromOffset = 0) {
    for (let i = fromOffset; i < 60; i++) {
      const t = TODAY.getTime() + i * DAY;
      if (isScheduledOn(rec, t)) return t;
    }
    return null;
  }
  function recText(rec) {
    const time = rec.time ? " " + rec.time : "";
    switch (rec.type) {
      case "daily":
        return "每天" + time;
      case "weekdays":
        return "工作日" + time;
      case "weekly":
        return (
          "每" +
          rec.weekdays
            .map(w => WEEK_CN[w])
            .join("、")
            .replace(/周/g, "周")
            .replace(/、周/g, "、") +
          time
        );
      case "monthly":
        return `每月 ${rec.monthDay} 日` + time;
      case "yearly":
        return "每年" + time;
    }
    return "";
  }
  // 打卡历史：按周列对齐（行 = 周日…周六），12 周 + 本周剩余日为 future；确定性伪随机，最近 streak 次全部完成
  function history(item, weeks = 12) {
    const rec = item.rec;
    const out = [];
    let seed = item.id * 9301 + 49297;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    let streakLeft = item.streak || 0;
    const first = TODAY.getTime() - ((weeks - 1) * 7 + TODAY.getDay()) * DAY;
    for (let i = 0; i < weeks * 7; i++) {
      const t = first + i * DAY,
        d = dayDiff(t);
      if (d > 0) {
        out.push({ t, s: "future" });
        continue;
      }
      if (t < startOfDay(rec.start)) {
        out.push({ t, s: "future" });
        continue;
      }
      if (!isScheduledOn(rec, t)) {
        out.push({ t, s: "off" });
        continue;
      }
      if (d === 0) {
        out.push({ t, s: item.done ? "done" : "today" });
        continue;
      }
      out.push({ t, s: "pending" });
    }
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c.s !== "pending") continue;
      if (streakLeft > 0) {
        c.s = "done";
        streakLeft--;
        continue;
      }
      const r = rnd();
      c.s = r < 0.72 ? "done" : r < 0.8 ? "skip" : "miss";
    }
    return out;
  }
  function recStats(item) {
    const h = history(item).filter(c => c.s !== "off" && c.s !== "future");
    const done = h.filter(c => c.s === "done").length;
    return {
      done,
      total: h.length,
      rate: h.length ? Math.round((done / h.length) * 100) : 0,
      miss: h.filter(c => c.s === "miss").length,
    };
  }

  /* ============ Mock 数据（13 个任务树 + 5 个进行中项目 + 1 个归档项目） ============ */
  const groups = [
    { id: 1, title: "编辑器重构", color: "blue" },
    { id: 2, title: "日语 N2", color: "green" },
    { id: 3, title: "生活", color: "orange" },
    { id: 4, title: "读书", color: "purple" },
    { id: 5, title: "健身", color: "teal" },
    { id: 6, title: "旧版迁移收尾", color: "gray", archived: true },
  ];
  const items = [
    {
      id: 1,
      g: 1,
      t: "迁移待办页 UI",
      type: "planned",
      start: at("09-24", "10:00"),
      due: at("09-26", "18:00"),
      remind: 15,
      desc: "按 features/todos 四件套落地：pages / views / queries / components。旧 TodoWindow 独立窗口与 TabType.Todo 入口登记进 04 删除清单。",
      notes: [
        { kind: "文章", icon: "file-text", title: "D-031 项目列表页定稿" },
        { kind: "卡片", icon: "card", title: "待办页信息架构草图" },
      ],
      created: at("09-22", "09:12"),
    },
    {
      id: 11,
      g: 1,
      p: 1,
      t: "出三案 mockup",
      type: "normal",
      done: true,
      doneAt: at("09-24", "11:20"),
    },
    { id: 12, g: 1, p: 1, t: "评审定稿并记 DECISIONS", type: "normal" },
    { id: 13, g: 1, p: 1, t: "落地 features/todos", type: "normal" },
    { id: 14, g: 1, p: 1, t: "更新 04 删除清单", type: "normal" },
    {
      id: 2,
      g: 1,
      t: "修复 DatePicker 跨月选择丢焦点",
      type: "deadline",
      due: at("09-23", "18:00"),
      remind: 60,
      created: at("09-20", "14:02"),
    },
    {
      id: 3,
      g: 1,
      t: "写 D-040 决策记录",
      type: "deadline",
      due: at("09-26", "12:00"),
      created: at("09-23", "16:40"),
    },
    { id: 4, g: 1, t: "升级 Electron 到 38", type: "normal", created: at("09-12", "10:00") },
    {
      id: 5,
      g: 1,
      t: "周会同步进度",
      type: "recurring",
      rec: { type: "weekly", weekdays: [1, 4], time: "15:00", start: at("08-04") },
      streak: 6,
      remind: 10,
      created: at("08-04", "09:00"),
    },
    { id: 6, g: 1, t: "整理样板间截图", type: "normal", done: true, doneAt: at("09-23", "19:05") },
    {
      id: 7,
      g: 2,
      t: "背 50 个单词",
      type: "recurring",
      rec: { type: "daily", time: "08:00", start: at("06-01") },
      streak: 23,
      remind: 0,
      created: at("06-01", "08:00"),
    },
    {
      id: 8,
      g: 2,
      t: "完成模拟卷第 3 套",
      type: "deadline",
      due: at("09-28", "21:00"),
      created: at("09-18", "20:00"),
    },
    {
      id: 9,
      g: 2,
      t: "听力精听 NHK 新闻",
      type: "recurring",
      rec: { type: "weekdays", time: "12:30", start: at("07-01") },
      streak: 9,
      done: true,
      doneAt: at("09-24", "12:41"),
    },
    {
      id: 10,
      g: 2,
      t: "报名 12 月 JLPT",
      type: "deadline",
      due: at("09-22", "23:59"),
      remind: 1440,
      notes: [{ kind: "卡片", icon: "card", title: "JLPT 报名流程与材料" }],
      created: at("09-10", "21:30"),
    },
    {
      id: 101,
      g: 2,
      p: 10,
      t: "准备证件照",
      type: "normal",
      done: true,
      doneAt: at("09-18", "10:00"),
    },
    { id: 102, g: 2, p: 10, t: "确认考场与交通", type: "normal" },
    {
      id: 15,
      g: 3,
      t: "交房租",
      type: "recurring",
      rec: { type: "monthly", monthDay: 25, time: "10:00", start: at("01-25") },
      streak: 8,
      remind: 1440,
    },
    {
      id: 16,
      g: 3,
      t: "预约牙医",
      type: "deadline",
      due: at("09-24", "17:00"),
      remind: 60,
      created: at("09-21", "13:00"),
    },
    { id: 17, g: 3, t: "买猫粮", type: "normal", created: at("09-23", "22:10") },
    {
      id: 18,
      g: 3,
      t: "给爸妈打电话",
      type: "recurring",
      rec: { type: "weekly", weekdays: [0], time: "20:00", start: at("03-01") },
      streak: 11,
    },
    { id: 19, g: 3, t: "取快递", type: "normal", done: true, doneAt: at("09-24", "09:10") },
    {
      id: 20,
      g: 4,
      t: "读完《设计中的设计》第 4 章",
      type: "planned",
      start: at("09-25", "20:00"),
      due: at("09-25", "22:00"),
      remind: 30,
      created: at("09-19", "08:00"),
    },
    {
      id: 21,
      g: 4,
      t: "写《禅与摩托车维修艺术》读书笔记",
      type: "normal",
      notes: [{ kind: "日记", icon: "pen", title: "2026-09-20 日记" }],
      created: at("09-20", "23:00"),
    },
    {
      id: 22,
      g: 4,
      t: "挑下个月的书单",
      type: "deadline",
      due: at("10-03", "00:00"),
      created: at("09-15", "12:00"),
    },
    {
      id: 23,
      g: 5,
      t: "跑步 5km",
      type: "recurring",
      rec: { type: "weekly", weekdays: [2, 4, 6], time: "07:00", start: at("05-12") },
      streak: 14,
      done: true,
      doneAt: at("09-24", "07:32"),
    },
    {
      id: 24,
      g: 5,
      t: "拉伸 15 分钟",
      type: "recurring",
      rec: { type: "daily", time: "22:00", start: at("08-20") },
      streak: 4,
    },
    {
      id: 25,
      g: 5,
      t: "更新体测数据",
      type: "deadline",
      due: at("10-01", "00:00"),
      created: at("09-01", "09:00"),
    },
    {
      id: 60,
      g: 6,
      t: "删除旧 TaskDialog 样式",
      type: "normal",
      done: true,
      doneAt: at("09-02", "10:00"),
    },
    {
      id: 61,
      g: 6,
      t: "迁移 Todo 快捷键",
      type: "normal",
      done: true,
      doneAt: at("09-03", "10:00"),
    },
  ];
  items.forEach((it, i) => {
    it.p = it.p || null;
    it.done = !!it.done;
    it.order = i;
    it.notes = it.notes || [];
    it.created = it.created || at("09-01", "09:00");
  });

  const TYPES = {
    normal: { label: "普通", icon: null },
    deadline: { label: "截止", icon: "flag" },
    planned: { label: "计划", icon: "clock" },
    recurring: { label: "周期", icon: "repeat" },
  };
  const REMIND = [
    [null, "不提醒"],
    [0, "准时"],
    [5, "提前 5 分钟"],
    [10, "提前 10 分钟"],
    [15, "提前 15 分钟"],
    [30, "提前 30 分钟"],
    [60, "提前 1 小时"],
    [120, "提前 2 小时"],
    [1440, "提前 1 天"],
  ];
  const remindText = m => (REMIND.find(r => r[0] === (m ?? null)) || REMIND[0])[1];

  /* ============ 任务派生 ============ */
  const byId = id => items.find(i => i.id === id);
  const groupOf = it => groups.find(g => g.id === it.g);
  const children = it => items.filter(c => c.p === it.id).sort((a, b) => a.order - b.order);
  const subProgress = it => {
    const c = children(it);
    return c.length ? { done: c.filter(x => x.done).length, total: c.length } : null;
  };
  const isOverdue = it =>
    !it.done && (it.type === "deadline" || it.type === "planned") && dayDiff(it.due) < 0;
  const scheduledToday = it => it.type === "recurring" && isScheduledOn(it.rec, TODAY.getTime());
  function dueInfo(it) {
    if (it.type === "deadline") {
      const d = dayDiff(it.due);
      if (!it.done && d < 0) return { text: `逾期 ${-d} 天`, cls: "overdue", icon: "flag" };
      return {
        text: dayWord(it.due) + timePart(it.due),
        cls: d === 0 && !it.done ? "today" : "",
        icon: "flag",
      };
    }
    if (it.type === "planned") {
      const s = it.start,
        e = it.due;
      const same = startOfDay(s) === startOfDay(e);
      const running = dayDiff(s) <= 0 && dayDiff(e) >= 0;
      const text = same
        ? `${dayWord(s)} ${hm(s)}–${hm(e)}`
        : `${dayWord(s)} ${hm(s)} → ${dayWord(e)}${timePart(e)}`;
      return { text, cls: running && !it.done ? "today" : "", icon: "clock", running };
    }
    if (it.type === "recurring") {
      const today = scheduledToday(it);
      const nx = today ? TODAY.getTime() : nextOccurrence(it.rec, 1);
      return {
        text: recText(it.rec),
        cls: today && !it.done ? "today" : "",
        icon: "repeat",
        next: nx,
        today,
      };
    }
    return null;
  }
  // 时间桶：议程视图与「今天」视图共用
  function bucketOf(it) {
    if (it.type === "deadline") {
      const d = dayDiff(it.due);
      return d < 0
        ? "overdue"
        : d === 0
          ? "today"
          : d === 1
            ? "tomorrow"
            : d <= endOfWeekDiff
              ? "week"
              : "later";
    }
    if (it.type === "planned") {
      const ds = dayDiff(it.start),
        de = dayDiff(it.due);
      if (ds <= 0 && de >= 0) return "today";
      if (de < 0) return "overdue";
      return ds === 1 ? "tomorrow" : ds <= endOfWeekDiff ? "week" : "later";
    }
    if (it.type === "recurring") {
      if (scheduledToday(it)) return "today";
      const n = nextOccurrence(it.rec, 1);
      const d = dayDiff(n);
      return d === 1 ? "tomorrow" : d <= endOfWeekDiff ? "week" : "later";
    }
    return "none";
  }
  const BUCKETS = [
    { key: "overdue", label: "已逾期" },
    {
      key: "today",
      label: "今天",
      sub: () => `${TODAY.getMonth() + 1}月${TODAY.getDate()}日 · ${WEEK_CN[TODAY.getDay()]}`,
    },
    {
      key: "tomorrow",
      label: "明天",
      sub: () => md(TODAY.getTime() + DAY) + " · " + WEEK_CN[(TODAY.getDay() + 1) % 7],
    },
    { key: "week", label: "本周稍后", sub: () => "周六 – 周日" },
    { key: "later", label: "以后" },
    { key: "none", label: "无日期" },
  ];
  const sortKey = it =>
    it.type === "deadline"
      ? it.due
      : it.type === "planned"
        ? it.start
        : it.type === "recurring"
          ? scheduledToday(it)
            ? TODAY.getTime() + (parseInt(it.rec.time) || 0) * 3600000
            : nextOccurrence(it.rec, 1)
          : Infinity;
  const activeGroups = () => groups.filter(g => !g.archived);
  const liveItems = () => items.filter(i => !groupOf(i).archived);
  function counts() {
    const roots = liveItems().filter(i => !i.p);
    const open = roots.filter(i => !(i.type !== "recurring" && i.done));
    return {
      open: open.filter(i => i.type !== "recurring" || !i.done).length,
      overdue: roots.filter(isOverdue).length,
      today: roots.filter(i => bucketOf(i) === "today" && !i.done).length,
      habitsToday: roots.filter(scheduledToday).length,
      habitsDone: roots.filter(i => scheduledToday(i) && i.done).length,
      doneToday: liveItems().filter(i => i.done && i.doneAt && dayDiff(i.doneAt) === 0).length,
    };
  }

  /* ============ 壳层 ============ */
  const NAV = [
    [
      "工作台",
      [
        ["flame", "今日"],
        ["calendar", "日程"],
        ["list-todo", "待办", true],
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
        ["book", "知识库"],
        ["board", "白板"],
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
        ["folder", "资源管理"],
        ["chart", "统计"],
      ],
    ],
  ];
  function mountShell({ crumb = "待办", compactNav = false } = {}) {
    injectSprite();
    const theme = localStorage.getItem("todo-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? '<span class="badge num" id="nav-todo-badge"></span>' : ""}</button>`
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
      localStorage.setItem("todo-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    return {
      page: document.getElementById("page-root"),
      status: document.getElementById("statusbar"),
      crumb: document.getElementById("crumb"),
    };
  }
  function setNavBadge(n) {
    const b = document.getElementById("nav-todo-badge");
    if (b) b.textContent = n || "";
  }

  /* ============ Menu（锚点 / 坐标定位 · Esc 与外点关闭） ============ */
  let menuEl = null,
    menuCleanup = null;
  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    if (menuCleanup) {
      menuCleanup();
      menuCleanup = null;
    }
  }
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
            : `<button class="menu-item${e.danger ? " danger" : ""}${e.checked ? " checked" : ""}" data-i="${i}">${e.dot ? `<span class="pdot" style="--c:var(--pc-${e.dot})"></span>` : e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
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
      const entry = entries[+b.dataset.i];
      closeMenu();
      onPick && onPick(entry);
    });
    const onDown = ev => {
      if (!el.contains(ev.target)) closeMenu();
    };
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
  const menuOpen = () => !!menuEl;

  /* ============ Toast（可撤销） ============ */
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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ============ 完成切换（普通/截止/计划 = 连带子任务；周期 = 今日打卡） ============ */
  function toggleDone(it) {
    if (it.type === "recurring" && !scheduledToday(it) && !it.done) {
      toast("今天不是计划打卡日——可在详情里补打卡或跳过");
      return false;
    }
    it.done = !it.done;
    it.doneAt = it.done ? Date.now() : null;
    if (it.type === "recurring") it.streak = Math.max(0, (it.streak || 0) + (it.done ? 1 : -1));
    else
      children(it).forEach(c => {
        c.done = it.done;
        c.doneAt = it.doneAt;
      });
    return true;
  }

  /* ============ 详情内容（三方案共用，容器各异） ============ */
  // 返回 HTML；bindDetail 负责交互。layout: "stack"（面板/抽屉）| "split"（Dialog 双栏）
  function propsHTML(it) {
    const rows = [];
    const g = groupOf(it);
    rows.push(
      `<div class="prop"><span class="k">${icon("folder")}项目</span><span class="v"><button class="field-btn" data-act="group"><span class="pdot" style="--c:var(--pc-${g.color})"></span>${g.title}${icon("chev-down")}</button></span></div>`
    );
    rows.push(
      `<div class="prop"><span class="k">${icon("list")}类型</span><span class="v"><div class="seg sm" data-act="type">${Object.entries(
        TYPES
      )
        .map(
          ([k, v]) =>
            `<button data-type="${k}" class="${it.type === k ? "on" : ""}">${v.icon ? icon(v.icon) : ""}${v.label}</button>`
        )
        .join("")}</div></span></div>`
    );
    if (it.type === "deadline") {
      const info = dueInfo(it);
      rows.push(
        `<div class="prop"><span class="k">${icon("flag")}截止</span><span class="v"><button class="field-btn${info.cls === "overdue" ? " overdue" : ""}" data-act="due">${icon("calendar")}${md(it.due)} ${hm(it.due)}</button>${info.cls === "overdue" ? `<span class="meta-chip overdue">${info.text}</span>` : `<span class="meta-chip muted">${dayWord(it.due)}</span>`}</span></div>`
      );
    }
    if (it.type === "planned") {
      rows.push(
        `<div class="prop"><span class="k">${icon("clock")}时间</span><span class="v"><button class="field-btn" data-act="start">${md(it.start)} ${hm(it.start)}</button><span style="color:var(--ink-3)">→</span><button class="field-btn" data-act="end">${md(it.due)} ${hm(it.due)}</button></span></div>`
      );
    }
    if (it.type === "recurring") {
      rows.push(
        `<div class="prop"><span class="k">${icon("repeat")}重复</span><span class="v"><button class="field-btn" data-act="rec">${recText(it.rec)}${icon("chev-down")}</button><span class="meta-chip muted">自 ${md(it.rec.start)} 起 · 永不结束</span></span></div>`
      );
    }
    if (it.type !== "normal") {
      rows.push(
        `<div class="prop"><span class="k">${icon("bell")}提醒</span><span class="v"><button class="field-btn${it.remind == null ? " placeholder" : ""}" data-act="remind">${remindText(it.remind)}${icon("chev-down")}</button></span></div>`
      );
    }
    if (it.type !== "normal") {
      rows.push(
        `<div class="prop"><span class="k">${icon("calendar-days")}日程</span><span class="v"><span class="meta-chip muted">已同步到「待办清单 · ${TYPES[it.type].label}」日历</span></span></div>`
      );
    }
    return rows.join("");
  }
  function habitHTML(it) {
    if (it.type !== "recurring") return "";
    const h = history(it),
      st = recStats(it);
    const todayCell = scheduledToday(it)
      ? `<button class="btn ${it.done ? "btn-soft" : "btn-primary"}" data-act="checkin">${icon(it.done ? "undo" : "check")}${it.done ? "撤销今日打卡" : "今日打卡"}</button><button class="btn btn-ghost" data-act="skip">${icon("skip")}跳过今天</button>`
      : `<span class="meta-chip muted">今天不是计划日 · 下次 ${dayWord(nextOccurrence(it.rec, 1))}</span>`;
    return `<div class="sec-title">打卡<span class="en">habit</span><span class="spacer"></span></div>
      <div class="habit-box">
        <div class="habit-stats">
          <div><b class="num">${it.streak}</b><span>连续${it.rec.type === "weekly" && it.rec.weekdays.length < 3 ? "次" : "天"}</span></div>
          <div><b class="num">${st.rate}%</b><span>近 12 周完成率</span></div>
          <div><b class="num">${st.done}</b><span>累计打卡</span></div>
        </div>
        <div class="heat">${h.map(c => `<i class="${c.s}" title="${md(c.t)} ${{ done: "已完成", miss: "缺卡", skip: "已跳过", off: "非计划日", today: "今天 · 待打卡", future: "" }[c.s] || ""}"></i>`).join("")}</div>
        <div class="habit-actions">${todayCell}</div>
      </div>`;
  }
  function subtasksHTML(it) {
    const c = children(it),
      p = subProgress(it);
    return `<div class="sec-title">子任务<span class="en">subtasks</span><span class="spacer"></span>${p ? `<span class="meta-chip muted num">${p.done}/${p.total}</span>` : ""}</div>
      <div class="subtasks">${c.map(s => `<div class="subtask" data-id="${s.id}"><button class="check${s.done ? " on" : ""}" data-act="sub-toggle">${icon("check")}</button><span class="t${s.done ? " strike" : ""}">${s.t}</span></div>`).join("")}
      <label class="add-line">${icon("plus")}<input data-act="sub-add" placeholder="添加子任务，回车确认"></label></div>`;
  }
  function notesHTML(it) {
    return `<div class="sec-title">关联笔记<span class="en">notes</span><span class="spacer"></span><button class="icon-btn sm" data-act="note-add" title="关联卡片 / 文章 / 文档 / 日记">${icon("plus")}</button></div>
      <div class="notes">${
        it.notes.length
          ? it.notes
              .map(
                n =>
                  `<button class="note-chip">${icon(n.icon)}<span class="kind">${n.kind}</span><span class="t">${n.title}</span></button>`
              )
              .join("")
          : `<span class="meta-chip muted">暂无关联——可关联卡片、文章、项目条目、文档或日记</span>`
      }</div>`;
  }
  function descHTML(it) {
    return `<div class="sec-title">描述<span class="en">description</span></div><div class="desc-box" contenteditable="true">${it.desc || ""}</div>`;
  }
  function footHTML(it) {
    return `<div class="detail-foot">创建于 ${md(it.created)} ${hm(it.created)}${it.done && it.doneAt ? ` · 完成于 ${dayWord(it.doneAt)} ${hm(it.doneAt)}` : ""}</div>`;
  }
  function detailBodyHTML(it, layout = "stack") {
    if (layout === "split") {
      return `<div class="detail-split"><div class="detail-main">${descHTML(it)}${subtasksHTML(it)}${notesHTML(it)}</div>
        <aside class="detail-side">${propsHTML(it)}${habitHTML(it)}${footHTML(it)}</aside></div>`;
    }
    return `<div class="props">${propsHTML(it)}</div>${habitHTML(it)}${subtasksHTML(it)}${notesHTML(it)}${descHTML(it)}${footHTML(it)}`;
  }
  // 绑定详情交互；onChange(reason) 由容器决定如何重渲染
  function bindDetail(root, it, onChange) {
    root.onclick = ev => {
      const b = ev.target.closest("[data-act], [data-type]");
      if (!b || !root.contains(b)) return;
      if (b.dataset.type) {
        const t = b.dataset.type;
        if (t === it.type) return;
        it.type = t;
        if (t === "deadline" && !it.due) it.due = at("09-24", "18:00");
        if (t === "planned") {
          if (!it.start) it.start = at("09-25", "09:00");
          if (!it.due || it.due < it.start) it.due = at("09-25", "11:00");
        }
        if (t === "recurring" && !it.rec) {
          it.rec = { type: "daily", time: "09:00", start: TODAY.getTime() };
          it.streak = 0;
        }
        toast(`已改为${TYPES[t].label}任务`);
        onChange("type");
        return;
      }
      const act = b.dataset.act;
      if (act === "group")
        openMenu(
          b,
          [
            { header: "移动到项目" },
            ...activeGroups().map(g => ({
              label: g.title,
              dot: g.color,
              checked: g.id === it.g,
              g,
            })),
          ],
          e => {
            it.g = e.g.id;
            children(it).forEach(c => (c.g = e.g.id));
            toast(`已移动到「${e.g.title}」`);
            onChange("group");
          }
        );
      if (act === "remind")
        openMenu(
          b,
          REMIND.map(([v, l]) => ({ label: l, checked: (it.remind ?? null) === v, v })),
          e => {
            it.remind = e.v;
            onChange("remind");
          }
        );
      if (act === "due" || act === "start" || act === "end")
        openMenu(
          b,
          [
            { header: "快捷日期（完整面板 = DatePicker precision=minute）" },
            { label: "今天 18:00", icon: "sun", d: at("09-24", "18:00") },
            { label: "明天 09:00", icon: "sunrise", d: at("09-25", "09:00") },
            { label: "本周六", icon: "calendar", d: at("09-26", "10:00") },
            { label: "下周一", icon: "calendar", d: at("09-28", "09:00") },
            "-",
            { label: "选择日期与时间…", icon: "calendar-days", k: "D" },
          ],
          e => {
            if (!e.d) return;
            if (act === "due") it.due = e.d;
            if (act === "start") it.start = e.d;
            if (act === "end") it.due = e.d;
            if (it.type === "planned" && it.due < it.start) it.due = it.start + 2 * 3600000;
            onChange("date");
          }
        );
      if (act === "rec")
        openMenu(
          b,
          [
            { header: "重复规则（创建后可改，修复 legacy 只读缺陷）" },
            { label: "每天", r: { type: "daily" } },
            { label: "工作日", r: { type: "weekdays" } },
            { label: "每周二、四、六", r: { type: "weekly", weekdays: [2, 4, 6] } },
            { label: "每月 25 日", r: { type: "monthly", monthDay: 25 } },
            "-",
            { label: "自定义间隔 / 结束条件 / 排除节假日…", icon: "sliders" },
          ],
          e => {
            if (!e.r) return;
            Object.assign(it.rec, { weekdays: null, monthDay: null }, e.r);
            onChange("rec");
          }
        );
      if (act === "checkin") {
        toggleDone(it);
        onChange("done");
      }
      if (act === "skip") {
        toast("已跳过今天，不计入缺卡", () => {});
      }
      if (act === "sub-toggle") {
        const s = byId(+b.closest(".subtask").dataset.id);
        s.done = !s.done;
        s.doneAt = s.done ? Date.now() : null;
        onChange("sub");
      }
      if (act === "note-add")
        openMenu(
          b,
          [
            { header: "关联已有内容" },
            { label: "卡片…", icon: "card" },
            { label: "文章…", icon: "file-text" },
            { label: "项目条目…", icon: "folder-kanban" },
            { label: "文档…", icon: "book" },
            { label: "日记…", icon: "pen" },
            "-",
            { label: "新建笔记并关联", icon: "plus" },
          ],
          null,
          { alignRight: true }
        );
    };
    root.querySelectorAll('[data-act="sub-add"]').forEach(inp =>
      inp.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" || ev.isComposing || !inp.value.trim()) return;
        items.push({
          id: Date.now(),
          g: it.g,
          p: it.id,
          t: inp.value.trim(),
          type: "normal",
          done: false,
          order: items.length,
          notes: [],
          created: Date.now(),
        });
        onChange("sub-add", true);
      })
    );
  }

  window.Todo = {
    icon,
    TODAY,
    DAY,
    WEEK_CN,
    at,
    dayDiff,
    dayWord,
    hm,
    md,
    startOfDay,
    groups,
    items,
    TYPES,
    REMIND,
    remindText,
    byId,
    groupOf,
    children,
    subProgress,
    isOverdue,
    scheduledToday,
    dueInfo,
    bucketOf,
    BUCKETS,
    sortKey,
    activeGroups,
    liveItems,
    counts,
    isScheduledOn,
    nextOccurrence,
    recText,
    history,
    recStats,
    mountShell,
    setNavBadge,
    openMenu,
    closeMenu,
    menuOpen,
    toast,
    toggleDone,
    detailBodyHTML,
    bindDetail,
  };
})();
