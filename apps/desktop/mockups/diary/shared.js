/*
  日记页三方案共用：图标 / 壳层 / mock 碎碎念数据 / 浮层（Menu · Popover · Dialog · Toast）/
  发布框内核（# 联想、标签 chip、⌘↵ 发布）/ 标签选择器（多选、新建、改色、清理）/ 就地编辑 / 删除撤销。
  数据形状与 types/diary.ts 一致：一条碎碎念 = DiarySegment（富文本 + 段级 tags + createTime），
  归属某一天的 DiaryEntry（date）；标签颜色 = DiaryTagSetting。天气 / 心情是 entry 级遗留字段，
  当前 UI 已无编辑入口，三方案都不展示（见 index 待决项）。
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
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-up": '<path d="m18 15-6-6-6 6"/>',
    "chev-left": '<path d="m15 18-6-6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    history:
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7M12 19V5"/>',
    "arrow-down": '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    "corner-down-left": '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    "calendar-days":
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    palette:
      '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    eraser:
      '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  };
  function injectSprite() {
    if (document.getElementById("diary-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "diary-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  const esc = s =>
    String(s ?? "").replace(
      /[&<>"]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );

  /* ============ 时间 ============ */
  const MIN = 60000,
    H = 3600000,
    D = 86400000;
  const NOW = new Date(2026, 8, 25, 15, 20, 0).getTime();
  const BOOT = performance.now();
  const now = () => NOW + (performance.now() - BOOT);
  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  const pad = n => String(n).padStart(2, "0");
  const dayKey = ts => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const keyDate = k => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const TODAY = dayKey(NOW);
  const addDays = (k, n) => dayKey(keyDate(k).getTime() + n * D + 2 * H);
  const diffDays = (a, b) => Math.round((keyDate(a) - keyDate(b)) / D);
  const fmtTime = ts => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  /** 日期标签：今天 / 昨天 / 9月22日；跨年带年份 */
  function dayLabel(k, { week = true, year = "auto" } = {}) {
    const d = keyDate(k);
    const off = diffDays(TODAY, k);
    const wk = week ? ` 周${WEEK[d.getDay()]}` : "";
    if (off === 0) return "今天" + (week ? ` · ${d.getMonth() + 1}月${d.getDate()}日${wk}` : "");
    if (off === 1) return "昨天" + (week ? ` · ${d.getMonth() + 1}月${d.getDate()}日${wk}` : "");
    const y =
      year === true || (year === "auto" && d.getFullYear() !== keyDate(TODAY).getFullYear());
    return `${y ? d.getFullYear() + "年" : ""}${d.getMonth() + 1}月${d.getDate()}日${wk}`;
  }
  function rel(ts) {
    const d = now() - ts;
    if (d < MIN) return "刚刚";
    if (d < H) return `${Math.round(d / MIN)} 分钟前`;
    if (dayKey(ts) === TODAY) return `${Math.round(d / H)} 小时前`;
    return fmtTime(ts);
  }

  /* ============ 标签色：ColorSwatch 同源七色（D-021） ============ */
  const COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "gray"];
  const COLOR_ZH = {
    red: "红",
    orange: "橙",
    yellow: "黄",
    green: "绿",
    blue: "蓝",
    purple: "紫",
    gray: "灰",
  };

  /* ============ mock 数据 ============ */
  // 图片块用派生色块代替（离线 mockup 不放真实照片）
  const IMG_TONES = ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "accent"];
  function imgsHTML(n, seedN) {
    const cells = Array.from({ length: n }, (_, i) => {
      const t = IMG_TONES[(seedN + i * 2) % IMG_TONES.length];
      const g1 = t === "accent" ? "var(--accent-soft)" : `var(--${t}-soft)`;
      const g2 = `color-mix(in srgb, var(--${t}) 62%, var(--bg-surface))`;
      return `<i style="--g1:${g1};--g2:${g2}"></i>`;
    }).join("");
    return `<div class="m-imgs n${n}" contenteditable="false">${cells}</div>`;
  }
  function blocksHTML(blocks, seedN) {
    return blocks
      .map(b => {
        if (typeof b === "string") return `<p>${esc(b)}</p>`;
        if (b.ul) return `<ul>${b.ul.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
        if (b.q) return `<blockquote>${esc(b.q)}</blockquote>`;
        if (b.img) return imgsHTML(b.img, seedN);
        return "";
      })
      .join("");
  }
  const _tmp = document.createElement("div");
  function textOf(html) {
    _tmp.innerHTML = html;
    _tmp.querySelectorAll("p,li,blockquote").forEach(el => el.append("\n"));
    return _tmp.textContent.replace(/\n+$/, "");
  }
  const wordsOf = html => textOf(html).replace(/\s/g, "").length;

  const TAGS0 = [
    { name: "工作", color: "blue" },
    { name: "生活", color: "green" },
    { name: "读书", color: "purple" },
    { name: "灵感", color: "orange" },
    { name: "健身", color: "red" },
    { name: "情绪", color: "yellow" },
    { name: "碎碎念", color: "gray" },
  ];
  // [日期, 时间, 标签, ...块]；日期写 MM-DD 默认 2026 年
  const RAW = [
    ["09-25", "08:12", ["碎碎念"], "早上的咖啡豆换成了埃塞俄比亚的，酸度有点高，但是醒得很快。"],
    [
      "09-25",
      "10:47",
      ["工作"],
      "协作页终于定稿了，侧栏嵌套那版。两条侧栏并排的别扭感说不上来哪里不对，但一眼就能感觉到。",
      { q: "页面自己的目录，不要和全局侧栏并排。" },
    ],
    ["09-25", "13:05", ["生活"], "午饭后绕着园区走了两圈，桂花开了，整条路都是甜的。", { img: 2 }],
    [
      "09-25",
      "15:02",
      ["灵感", "工作"],
      "日记也许应该更像朋友圈：不是每天交一篇作文，而是想到什么就丢一句。",
    ],
    [
      "09-24",
      "09:30",
      ["工作"],
      "番茄专注页的时间账本过了。7 天视图底下那一大片空白被抓了出来——行高要随可用高度伸缩，而不是固定行高把剩下的留给空白。",
    ],
    [
      "09-24",
      "12:40",
      ["读书"],
      "《置身事内》第三章，地方政府的土地财政讲得很清楚。",
      {
        ul: [
          "土地出让金 → 基建 → 招商引资",
          "城投债是这套循环的杠杆",
          "问题在于它只在地价上涨时成立",
        ],
      },
    ],
    ["09-24", "19:15", ["健身"], "5 公里，28'40\"。配速比上周快了 20 秒，膝盖没疼。"],
    ["09-24", "23:48", ["碎碎念", "情绪"], "又熬到这个点了。明天一定早睡（第 N 次）。"],
    ["09-23", "11:20", ["工作"], "把 Tab 导航的残留审计做完了，一共 37 处调用点，比预想的少。"],
    ["09-23", "18:30", ["生活"], "做了番茄炒蛋，这次先炒蛋再炒番茄，蛋更嫩。", { img: 1 }],
    [
      "09-23",
      "22:10",
      ["读书"],
      { q: "写作是思考的副产品，而不是思考的记录。" },
      "书里这一句被划线了一万两千次。",
    ],
    ["09-22", "07:55", ["健身"], "晨跑，雾很大，能见度不到一百米，像在跑一个没有尽头的走廊。"],
    ["09-22", "16:40", ["灵感"], "闪卡复习：沉浸式的时候题卡应该居中，不要贴顶。记下来，晚上改。"],
    [
      "09-21",
      "10:02",
      ["生活"],
      "周末去了趟花鸟市场，带回来一盆龟背竹，还有两盆多肉。",
      { img: 3 },
    ],
    ["09-21", "14:20", ["读书"], "读完《置身事内》第二章。"],
    ["09-21", "21:35", ["碎碎念"], "这周过得好快。"],
    [
      "09-20",
      "15:10",
      ["情绪"],
      "有点焦虑，事情太多了，列一下：",
      { ul: ["日程页迁移", "待办页二轮评审", "把体检报告看完"] },
      "列完好多了。",
    ],
    [
      "09-19",
      "09:05",
      ["工作"],
      "文章页评审：没有 banner 的时候用派生色兜底，比默认占位图好太多。",
    ],
    [
      "09-19",
      "20:04",
      ["生活"],
      "和老朋友吃了顿火锅，聊到十一点，聊到了大学宿舍楼下那家已经关门的炒饭。",
    ],
    [
      "09-17",
      "13:30",
      ["灵感"],
      "米黄糊成一坨的问题：不是颜色不好看，是层级塌了。纸和墨两个锚点要拉开。",
    ],
    ["09-17", "22:45", ["读书"], "开始读《始于极限》。"],
    ["09-16", "18:40", ["健身"], "10 公里，第一次跑进一小时！"],
    ["09-14", "11:00", ["工作"], "token 体系决定彻底换新，旧的前缀不继承。背历史包袱太累了。"],
    ["09-14", "16:15", ["碎碎念"], "下雨天适合写代码。"],
    ["09-13", "10:30", ["生活"], "给阳台的花换了盆。", { img: 2 }],
    [
      "09-11",
      "22:20",
      ["读书"],
      { q: "女性主义不是弱者变成强者的思想，而是追求弱者也能受到尊重的思想。" },
      "——《始于极限》",
    ],
    ["09-08", "17:50", ["情绪", "工作"], "今天状态很好，一口气把设置页写完了。"],
    ["09-05", "07:40", ["健身"], "恢复跑步第一天，3 公里就喘了。"],
    ["09-01", "00:12", ["碎碎念"], "九月了。"],
    ["08-29", "21:10", ["读书"], "《置身事内》开读。"],
    ["08-23", "12:15", ["生活"], "搬家后的第一顿饭，泡面。", { img: 1 }],
    ["08-16", "19:30", ["情绪"], "有点累，但还行。"],
    ["08-02", "10:00", ["灵感"], "如果日记能按标签聚合，就能看到一年里自己都在想什么。"],
    ["2024-09-25", "19:02", ["生活"], "中秋前一周，楼下的桂花也开了。决定明年开始认真记点东西。"],
    ["2025-09-25", "21:40", ["碎碎念"], "第一次试着用自己写的编辑器记日记，字体还是太小了。"],
    ["2025-09-25", "23:05", ["读书"], "《禅与摩托车维修艺术》读到一半，良质到底是什么？"],
  ];
  function seed() {
    let id = 100;
    const moments = RAW.map(([d, t, tags, ...blocks]) => {
      const date = d.length === 5 ? `2026-${d}` : d;
      const [hh, mm] = t.split(":").map(Number);
      const ts = keyDate(date).getTime() + hh * H + mm * MIN;
      const html = blocksHTML(blocks, id);
      return { id: id++, day: date, ts, tags: [...tags], html, words: wordsOf(html) };
    });
    return { moments, tags: TAGS0.map((t, i) => ({ ...t, sort: i })) };
  }
  let S = seed();
  let demoMode = "normal";
  let stash = null;
  const subs = new Set();
  const on = fn => (subs.add(fn), () => subs.delete(fn));
  const emit = () => subs.forEach(fn => fn());
  function applyDemo(mode) {
    if (mode === demoMode) return;
    if (mode === "empty") {
      stash = S;
      S = { moments: [], tags: [] };
    } else if (stash) {
      S = stash;
      stash = null;
    }
    demoMode = mode;
    Object.assign(F, { tags: [], range: null, query: "", pending: "", searching: false });
    emit();
  }

  /* ============ 筛选 / 搜索 ============ */
  // 标签多选（任一命中）· 日期范围（entry.date）· 搜索（产品为 FTS + 向量混合召回，mock 用子串代替）
  const F = { tags: [], range: null, query: "", pending: "", searching: false };
  let searchTimer;
  function setQuery(q) {
    F.pending = q;
    clearTimeout(searchTimer);
    if (!q.trim()) {
      F.query = "";
      F.searching = false;
      emit();
      return;
    }
    F.searching = true;
    emit();
    searchTimer = setTimeout(() => {
      F.query = q.trim();
      F.searching = false;
      emit();
    }, 320);
  }
  function setFilter(patch) {
    Object.assign(F, patch);
    emit();
  }
  const hasFilter = () => F.tags.length > 0 || !!F.range || !!F.query;
  function matchQuery(m, q) {
    if (!q) return true;
    const t = (textOf(m.html) + " " + m.tags.join(" ")).toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .every(w => t.includes(w));
  }
  function filtered({ ignoreRange = false, ignoreTags = false } = {}) {
    return S.moments
      .filter(m => ignoreTags || !F.tags.length || F.tags.some(t => m.tags.includes(t)))
      .filter(m => ignoreRange || !F.range || (m.day >= F.range[0] && m.day <= F.range[1]))
      .filter(m => matchQuery(m, F.query))
      .sort((a, b) => (a.day === b.day ? b.ts - a.ts : a.day < b.day ? 1 : -1));
  }
  /** 按天分组（保持输入顺序） */
  function byDay(list) {
    const out = [];
    let cur = null;
    for (const m of list) {
      if (!cur || cur[0] !== m.day) out.push((cur = [m.day, []]));
      cur[1].push(m);
    }
    return out;
  }
  function highlight(root, q) {
    if (!q) return;
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    root.querySelectorAll(".m-body").forEach(body => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => {
        if (!re.test(n.nodeValue)) return;
        re.lastIndex = 0;
        const span = document.createElement("span");
        span.innerHTML = esc(n.nodeValue).replace(re, s => `<mark>${s}</mark>`);
        n.replaceWith(...span.childNodes);
      });
    });
  }

  /* ============ 统计（全部由真实数据派生） ============ */
  const tagOf = name => S.tags.find(t => t.name === name);
  const tagColor = name => tagOf(name)?.color || "gray";
  const tagCount = name => S.moments.filter(m => m.tags.includes(name)).length;
  const tagsSorted = () =>
    [...S.tags].sort((a, b) => tagCount(b.name) - tagCount(a.name) || a.sort - b.sort);
  function dayStats() {
    const map = new Map();
    for (const m of S.moments) {
      const s = map.get(m.day) || { n: 0, words: 0, tags: new Set() };
      s.n++;
      s.words += m.words;
      m.tags.forEach(t => s.tags.add(t));
      map.set(m.day, s);
    }
    return map;
  }
  function streak() {
    const days = new Set(S.moments.map(m => m.day));
    let k = days.has(TODAY) ? TODAY : addDays(TODAY, -1);
    let n = 0;
    while (days.has(k)) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  }
  const monthCount = (ym = TODAY.slice(0, 7)) => S.moments.filter(m => m.day.startsWith(ym)).length;
  /** 那年今日：往年同月同日的记录（无则返回空） */
  const onThisDay = () =>
    S.moments.filter(
      m => m.day.slice(5) === TODAY.slice(5) && m.day.slice(0, 4) !== TODAY.slice(0, 4)
    );

  /* ============ 片段 HTML ============ */
  function tagHTML(name, { rm = false, btn = false, dot = true, attrs = "" } = {}) {
    const tagName = btn ? "button" : "span";
    return `<${tagName} class="tg${dot ? "" : " nodot"}" data-c="${tagColor(name)}" data-tag="${esc(name)}" ${attrs}>${esc(name)}${
      rm
        ? `<span class="x" data-rm="${esc(name)}" role="button" aria-label="移除标签">${icon("x")}</span>`
        : ""
    }</${tagName}>`;
  }
  const tagsHTML = (m, opts) => m.tags.map(t => tagHTML(t, opts)).join("");
  /** 补记：写在别的日子里的（createTime 与归属日期不同天） */
  const backfill = m => dayKey(m.ts) !== m.day;

  /* ============ 壳层 ============ */
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
        ["pen", "日记", true],
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
  let crumbEl;
  function mountShell({ crumb = "日记", demos = [] } = {}) {
    injectSprite();
    const theme = localStorage.getItem("diary-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}" ${active ? 'id="nav-self"' : ""}>${icon(ic)}${name}</button>${active ? '<div id="nav-sub"></div>' : ""}`
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
            <span class="titlebar-crumb" id="tb-crumb">${crumb}</span>
            <span class="titlebar-spacer"></span>
            <div class="demo" title="mockup 演示控制，非产品 UI"><span>演示</span>
              <button data-demo="normal">正常</button><button data-demo="empty">空态</button>
              ${demos.length ? '<span class="sep"></span>' : ""}${demos.map((d, i) => `<button data-xdemo="${i}">${d.label}</button>`).join("")}
            </div>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
        </main>
      </div>`;
    crumbEl = document.getElementById("tb-crumb");
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("diary-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    document
      .querySelectorAll("[data-demo]")
      .forEach(b => (b.onclick = () => applyDemo(b.dataset.demo)));
    document
      .querySelectorAll("[data-xdemo]")
      .forEach(b => (b.onclick = () => demos[+b.dataset.xdemo].run()));
    const sync = () =>
      document
        .querySelectorAll("[data-demo]")
        .forEach(b => b.classList.toggle("on", b.dataset.demo === demoMode));
    on(sync);
    sync();
    return { page: document.getElementById("page-root") };
  }
  const setCrumb = html => (crumbEl.innerHTML = html);

  /* ============ Menu / Popover / Toast ============ */
  let menuEl = null,
    menuCleanup = null;
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    if (menuCleanup) menuCleanup();
    menuCleanup = null;
  }
  function place(el, anchor, placement, gap = 6) {
    const r = anchor.getBoundingClientRect();
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
  function openMenu(anchor, entries, opts = {}) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.header
            ? `<div class="menu-label">${e.header}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}" data-i="${i}"${e.disabled ? " disabled" : ""}>${e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    place(el, anchor, opts.placement || "bottom-end");
    requestAnimationFrame(() => el.classList.add("open"));
    const host = anchor.closest(".hover-host");
    host && host.classList.add("menu-on");
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const entry = entries[+b.dataset.i];
      closeMenu();
      entry.run && entry.run();
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
      host && host.classList.remove("menu-on");
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }

  let popClose = null;
  function openPop(anchor, render, opts = {}) {
    if (popClose) popClose();
    closeMenu();
    const el = document.createElement("div");
    el.className = "pop";
    if (opts.width) el.style.width = opts.width + "px";
    document.body.appendChild(el);
    const placement = opts.placement || "bottom-start";
    const host = anchor.closest && anchor.closest(".hover-host");
    host && host.classList.add("menu-on");
    const draw = () => {
      el.innerHTML = render(close);
      opts.bind && opts.bind(el, close, draw);
      if (anchor.isConnected || !el.style.left) place(el, anchor, placement, 8);
    };
    const onDown = ev => {
      if (dialogs.length) return;
      if (!el.contains(ev.target) && !anchor.contains(ev.target)) close();
    };
    const onKey = ev => {
      if (ev.key === "Escape" && !dialogs.length && !menuEl) {
        ev.stopPropagation();
        close();
      }
    };
    function close() {
      el.remove();
      host && host.classList.remove("menu-on");
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      if (popClose === close) popClose = null;
      opts.onClose && opts.onClose();
    }
    draw();
    requestAnimationFrame(() => el.classList.add("open"));
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    popClose = close;
    return close;
  }
  const closePop = () => popClose && popClose();

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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), undo ? 5000 : 2400);
  }

  /* ============ Dialog（LIFO：Esc 只关栈顶） ============ */
  const dialogs = [];
  function openDialog(render, opts = {}) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dlg" style="${opts.width ? `width:${opts.width}px` : ""}"></div>`;
    const box = ov.firstElementChild;
    document.body.appendChild(ov);
    function close() {
      const i = dialogs.indexOf(close);
      if (i >= 0) dialogs.splice(i, 1);
      ov.classList.remove("open");
      setTimeout(() => ov.remove(), 180);
    }
    box.innerHTML = render(close);
    opts.bind && opts.bind(box, close);
    ov.addEventListener("mousedown", ev => ev.target === ov && close());
    dialogs.push(close);
    requestAnimationFrame(() => ov.classList.add("open"));
    const f = box.querySelector("[autofocus]");
    f && setTimeout(() => f.focus(), 30);
    return close;
  }
  document.addEventListener(
    "keydown",
    ev => {
      if (ev.key === "Escape" && dialogs.length) {
        ev.stopPropagation();
        dialogs[dialogs.length - 1]();
      }
    },
    true
  );

  /* ============ 动作（模拟 IPC） ============ */
  const findM = id => S.moments.find(m => m.id === id);
  let nextId = 1000;
  function ensureTag(name) {
    if (tagOf(name)) return;
    // 新标签按已用色轮转取色（与 legacy PRESET_COLORS 轮转同口径）
    const color = COLORS[S.tags.length % (COLORS.length - 1)];
    S.tags.push({ name, color, sort: S.tags.length });
  }
  /** 纯文本 → 段落 HTML；行内残留的 #标签 提取为标签 */
  function create({ text, tags = [], day = TODAY }) {
    const found = [];
    const clean = text.replace(/(^|\s)#([^\s#]+)/g, (_, sp, t) => (found.push(t), sp)).trim();
    const all = [...new Set([...tags, ...found])];
    all.forEach(ensureTag);
    const html = clean
      .split(/\n/)
      .map(l => `<p>${esc(l) || "<br>"}</p>`)
      .join("");
    const m = { id: nextId++, day, ts: now(), tags: all, html, words: wordsOf(html), fresh: true };
    S.moments.push(m);
    if (demoMode === "empty") demoMode = "normal";
    emit();
    return m;
  }
  function update(id, html) {
    const m = findM(id);
    if (!m || m.html === html) return;
    m.html = html;
    m.words = wordsOf(html);
    emit();
  }
  function setTags(id, tags) {
    const m = findM(id);
    if (!m) return;
    tags.forEach(ensureTag);
    m.tags = tags;
    emit();
  }
  // 删除不二次确认：立即消失 + Toast 撤销（待办页 D-040 同口径）
  function remove(id) {
    const i = S.moments.findIndex(m => m.id === id);
    if (i < 0) return;
    const [m] = S.moments.splice(i, 1);
    emit();
    toast("已删除 1 条碎碎念", () => {
      S.moments.push(m);
      emit();
    });
  }
  function recolor(name, color) {
    const t = tagOf(name);
    if (t) t.color = color;
    emit();
  }
  function clearTagDialog(name, after) {
    const n = tagCount(name);
    openDialog(
      close => `<h3>清理标签「${esc(name)}」？</h3>
        <p class="dsub">标签会从 ${n} 条碎碎念上移除，并从标签列表里删除。碎碎念本身不受影响。</p>
        <div class="dfoot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-danger" data-ok autofocus>清理</button></div>`,
      {
        bind: (box, close) => {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            S.moments.forEach(m => (m.tags = m.tags.filter(t => t !== name)));
            S.tags = S.tags.filter(t => t.name !== name);
            F.tags = F.tags.filter(t => t !== name);
            close();
            emit();
            toast(`已清理标签「${esc(name)}」`);
            after && after();
          };
        },
      }
    );
  }

  /* ============ 标签选择器（多选 · 新建 · 改色 · 清理） ============ */
  function tagPicker(anchor, selected, onChange, opts = {}) {
    let sel = [...selected];
    let q = "";
    let hl = 0;
    let manage = null;
    const rows = () => {
      const list = tagsSorted().filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
      const exact = S.tags.some(t => t.name === q.trim());
      return { list, create: q.trim() && !exact ? q.trim() : null };
    };
    return openPop(
      anchor,
      () => {
        if (manage) {
          const t = tagOf(manage);
          if (!t) return "";
          return `<div class="pop-title"><button class="ibtn sm" data-back>${icon("chev-left")}</button>${tagHTML(manage)}<span class="muted" style="font-weight:400;font-size:12px;margin-left:auto">${tagCount(manage)} 条</span></div>
            <div class="sec" style="margin:4px 0 6px">颜色</div>
            <div class="swatches">${COLORS.map(c => `<button class="swatch${t.color === c ? " on" : ""}" data-c="${c}" data-color="${c}" title="${COLOR_ZH[c]}">${t.color === c ? icon("check") : ""}</button>`).join("")}</div>
            <div class="menu-sep" style="margin:10px -4px 6px"></div>
            <button class="menu-item danger" data-clear style="margin:0 -6px;width:calc(100% + 12px)">${icon("eraser")}清理这个标签…</button>`;
        }
        const { list, create } = rows();
        const items = list.map(
          (
            t,
            i
          ) => `<div class="tp-row hover-host${i === hl ? " hl" : ""}" data-pick="${esc(t.name)}" role="button">
            <span class="ck">${sel.includes(t.name) ? icon("check") : ""}</span>
            <span class="cdot" data-c="${t.color}"></span><span class="nm">${esc(t.name)}</span>
            <span class="ct">${tagCount(t.name)}</span>
            <button class="ibtn sm hover-act" data-manage="${esc(t.name)}" title="颜色与清理">${icon("more")}</button></div>`
        );
        if (create)
          items.push(
            `<div class="tp-row${hl === list.length ? " hl" : ""}" data-create="${esc(create)}" role="button"><span class="ck">${icon("plus")}</span><span class="nm create">创建「${esc(create)}」</span></div>`
          );
        return `<div class="tp-search">${icon("hash")}<input data-q placeholder="${opts.filterMode ? "筛选标签…" : "搜索或新建标签…"}" value="${esc(q)}"></div>
          <div class="tp-list">${items.join("") || '<div class="muted" style="padding:10px 8px;font-size:12.5px">还没有标签，输入名称创建</div>'}</div>
          <div class="tp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> ${opts.filterMode ? "切换" : "添加"}</span>${sel.length ? `<span class="spacer"></span><button class="link" data-none>清空已选</button>` : ""}</div>`;
      },
      {
        width: opts.width || 260,
        placement: opts.placement || "bottom-start",
        bind: (el, close, draw) => {
          const redraw = (keepFocus = true) => {
            draw();
            if (keepFocus) {
              const i = el.querySelector("[data-q]");
              if (i) {
                i.focus();
                i.setSelectionRange(i.value.length, i.value.length);
              }
            }
          };
          const toggle = name => {
            sel = sel.includes(name) ? sel.filter(x => x !== name) : [...sel, name];
            onChange(sel);
            redraw();
          };
          const input = el.querySelector("[data-q]");
          if (input) {
            setTimeout(() => input.focus());
            input.oninput = () => {
              q = input.value;
              hl = 0;
              redraw();
            };
            input.onkeydown = ev => {
              const { list, create } = rows();
              const total = list.length + (create ? 1 : 0);
              if (ev.key === "ArrowDown") {
                hl = Math.min(total - 1, hl + 1);
                redraw();
                ev.preventDefault();
              } else if (ev.key === "ArrowUp") {
                hl = Math.max(0, hl - 1);
                redraw();
                ev.preventDefault();
              } else if (ev.key === "Enter") {
                ev.preventDefault();
                if (hl < list.length) toggle(list[hl].name);
                else if (create) {
                  ensureTag(create);
                  q = "";
                  toggle(create);
                }
              } else if (ev.key === "Backspace" && !input.value && sel.length) {
                sel = sel.slice(0, -1);
                onChange(sel);
                redraw();
              }
            };
          }
          el.querySelectorAll("[data-pick]").forEach(r =>
            r.addEventListener("click", ev => {
              if (ev.target.closest("[data-manage]")) return;
              toggle(r.dataset.pick);
            })
          );
          el.querySelectorAll("[data-manage]").forEach(
            b =>
              (b.onclick = ev => {
                ev.stopPropagation();
                manage = b.dataset.manage;
                redraw(false);
              })
          );
          const c = el.querySelector("[data-create]");
          if (c)
            c.onclick = () => {
              ensureTag(c.dataset.create);
              q = "";
              toggle(c.dataset.create);
            };
          const none = el.querySelector("[data-none]");
          if (none)
            none.onclick = () => {
              sel = [];
              onChange(sel);
              redraw();
            };
          const back = el.querySelector("[data-back]");
          if (back)
            back.onclick = () => {
              manage = null;
              redraw();
            };
          el.querySelectorAll("[data-color]").forEach(
            b =>
              (b.onclick = () => {
                recolor(manage, b.dataset.color);
                redraw(false);
              })
          );
          const clr = el.querySelector("[data-clear]");
          if (clr)
            clr.onclick = () =>
              clearTagDialog(manage, () => {
                sel = sel.filter(x => x !== manage);
                manage = null;
                close();
              });
        },
      }
    );
  }

  /** 单个标签的管理浮层：改色 / 清理（侧栏标签行、频道条右键共用） */
  function tagManage(anchor, name, opts = {}) {
    return openPop(
      anchor,
      () => {
        const t = tagOf(name);
        if (!t) return "";
        return `<div class="pop-title">${tagHTML(name)}<span class="muted" style="font-weight:400;font-size:12px;margin-left:auto">${tagCount(name)} 条</span></div>
          <div class="swatches">${COLORS.map(c => `<button class="swatch${t.color === c ? " on" : ""}" data-c="${c}" data-color="${c}" title="${COLOR_ZH[c]}">${t.color === c ? icon("check") : ""}</button>`).join("")}</div>
          <div class="menu-sep" style="margin:10px -4px 6px"></div>
          <button class="menu-item danger" data-clear style="margin:0 -6px;width:calc(100% + 12px)">${icon("eraser")}清理这个标签…</button>`;
      },
      {
        width: 236,
        placement: opts.placement || "bottom-start",
        bind: (el, close, draw) => {
          el.querySelectorAll("[data-color]").forEach(
            b => (b.onclick = () => (recolor(name, b.dataset.color), draw()))
          );
          el.querySelector("[data-clear]").onclick = () => clearTagDialog(name, close);
        },
      }
    );
  }

  /* ============ 发布框内核 ============ */
  /*
    宿主页面自己决定外形，内核只认这几个钩子：
    [data-cinput] 输入区（contenteditable）· [data-ctags] 已选标签 · [data-cadd] 加标签按钮
    [data-csend] 发布按钮 · [data-ccount] 字数（可选）
    交互：输入 # 弹出标签联想（↑↓ 选择，↵ / Tab 确认，Esc 关闭）；⌘↵ 发布；粘贴只取纯文本。
  */
  function bindComposer(
    root,
    { getDay = () => TODAY, onPosted, onChange, enterSend = false } = {}
  ) {
    const input = root.querySelector("[data-cinput]");
    const tagsEl = root.querySelector("[data-ctags]");
    const addBtn = root.querySelector("[data-cadd]");
    const send = root.querySelector("[data-csend]");
    const count = root.querySelector("[data-ccount]");
    let tags = [];
    let sug = null;

    const renderTags = () => {
      if (tagsEl) {
        tagsEl.innerHTML = tags.map(t => tagHTML(t, { rm: true })).join("");
        tagsEl.querySelectorAll("[data-rm]").forEach(
          x =>
            (x.onclick = ev => {
              ev.stopPropagation();
              tags = tags.filter(t => t !== x.dataset.rm);
              renderTags();
            })
        );
      }
      sync();
    };
    const text = () => input.innerText.replace(/ /g, " ");
    const sync = () => {
      const t = text().trim();
      if (send) send.disabled = !t;
      if (count) count.textContent = t ? `${t.replace(/\s/g, "").length} 字` : "";
      root.classList.toggle("has-text", !!t);
      onChange && onChange(!!t);
    };
    const submit = () => {
      const t = text().trim();
      if (!t) return;
      closeSug();
      const m = create({ text: t, tags, day: getDay() });
      input.innerHTML = "";
      tags = [];
      renderTags();
      onPosted && onPosted(m);
    };

    // # 联想：浮在光标下方，焦点留在输入区
    function caretQuery() {
      const s = getSelection();
      if (!s.rangeCount || !s.isCollapsed) return null;
      const r = s.getRangeAt(0);
      const node = r.startContainer;
      if (node.nodeType !== 3 || !input.contains(node)) return null;
      const before = node.nodeValue.slice(0, r.startOffset);
      const mt = before.match(/(^|\s)#([^\s#]*)$/);
      if (!mt) return null;
      return {
        node,
        end: r.startOffset,
        start: r.startOffset - mt[2].length - 1,
        q: mt[2],
        rect: r.getBoundingClientRect(),
      };
    }
    function closeSug() {
      if (sug) sug.el.remove();
      sug = null;
    }
    function openSug(cq) {
      const list = tagsSorted()
        .filter(t => t.name.toLowerCase().includes(cq.q.toLowerCase()) && !tags.includes(t.name))
        .slice(0, 6);
      const create = cq.q && !S.tags.some(t => t.name === cq.q) ? cq.q : null;
      const items = [
        ...list.map(t => ({ name: t.name, color: t.color })),
        ...(create ? [{ name: create, create: true }] : []),
      ];
      if (!items.length) return closeSug();
      if (!sug) {
        const el = document.createElement("div");
        el.className = "menu open";
        el.style.minWidth = "200px";
        document.body.appendChild(el);
        sug = { el, hl: 0 };
      }
      sug.items = items;
      sug.cq = cq;
      sug.hl = Math.min(sug.hl, items.length - 1);
      sug.el.innerHTML =
        `<div class="menu-label">标签</div>` +
        items
          .map(
            (it, i) =>
              `<button class="menu-item${i === sug.hl ? " hl" : ""}" data-i="${i}" style="${i === sug.hl ? "background:var(--bg-hover)" : ""}">${
                it.create
                  ? `${icon("plus")}<span>创建「${esc(it.name)}」</span>`
                  : `<span class="cdot" data-c="${it.color}" style="margin:0 3px"></span>${esc(it.name)}<span class="k">${tagCount(it.name)}</span>`
              }</button>`
          )
          .join("");
      const rc = cq.rect.width || cq.rect.height ? cq.rect : input.getBoundingClientRect();
      sug.el.style.left = Math.min(rc.left, innerWidth - 220) + "px";
      const h = sug.el.offsetHeight;
      sug.el.style.top = (rc.bottom + h + 12 > innerHeight ? rc.top - h - 6 : rc.bottom + 6) + "px";
      sug.el.querySelectorAll("[data-i]").forEach(b =>
        b.addEventListener("mousedown", ev => {
          ev.preventDefault();
          pick(+b.dataset.i);
        })
      );
    }
    function pick(i) {
      const it = sug.items[i];
      const { node, start, end } = sug.cq;
      node.nodeValue = node.nodeValue.slice(0, start) + node.nodeValue.slice(end);
      const r = document.createRange();
      r.setStart(node, start);
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      if (it.create) ensureTag(it.name);
      if (!tags.includes(it.name)) tags.push(it.name);
      closeSug();
      renderTags();
    }
    input.addEventListener("input", () => {
      sync();
      const cq = caretQuery();
      cq ? openSug(cq) : closeSug();
    });
    input.addEventListener("keydown", ev => {
      if (sug) {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          sug.hl =
            (sug.hl + (ev.key === "ArrowDown" ? 1 : -1) + sug.items.length) % sug.items.length;
          openSug(sug.cq);
          return;
        }
        if (ev.key === "Enter" || ev.key === "Tab") {
          ev.preventDefault();
          pick(sug.hl);
          return;
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          closeSug();
          return;
        }
      }
      if (
        ev.key === "Enter" &&
        !ev.isComposing &&
        (ev.metaKey || ev.ctrlKey || (enterSend && !ev.shiftKey))
      ) {
        ev.preventDefault();
        submit();
      }
    });
    input.addEventListener("blur", () => setTimeout(closeSug, 120));
    input.addEventListener("paste", ev => {
      ev.preventDefault();
      document.execCommand("insertText", false, ev.clipboardData.getData("text/plain"));
    });
    if (addBtn)
      addBtn.onclick = () =>
        tagPicker(
          addBtn,
          tags,
          next => {
            tags = next;
            renderTags();
          },
          { placement: addBtn.dataset.place || "bottom-start" }
        );
    if (send) send.onclick = submit;
    renderTags();
    return {
      focus: () => input.focus(),
      setText: t => {
        input.innerText = t;
        sync();
      },
      addTag: t => {
        if (!tags.includes(t)) tags.push(t);
        renderTags();
      },
      get empty() {
        return !text().trim();
      },
    };
  }

  /* ============ 就地编辑 ============ */
  // 默认阅读态（legacy 每条都是常驻编辑器，误触即改）；点击正文进入编辑，失焦保存，Esc 放弃
  let editingId = null;
  function bindEditable(root) {
    root.querySelectorAll(".m-body[data-id]").forEach(body => {
      body.dataset.editable = "";
      body.addEventListener("mousedown", ev => {
        if (body.isContentEditable || ev.target.closest(".m-imgs")) return;
        body.contentEditable = "true";
        body.classList.add("editing");
        editingId = +body.dataset.id;
        body._orig = body.innerHTML;
      });
      body.addEventListener("keydown", ev => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          body.innerHTML = body._orig;
          body._cancel = true;
          body.blur();
        } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault();
          body.blur();
        }
      });
      body.addEventListener("blur", () => {
        body.contentEditable = "false";
        body.classList.remove("editing");
        editingId = null;
        const cancel = body._cancel;
        body._cancel = false;
        if (!cancel && body.innerHTML !== body._orig) {
          body.querySelectorAll("mark").forEach(mk => mk.replaceWith(...mk.childNodes));
          update(+body.dataset.id, body.innerHTML);
        }
      });
    });
  }
  const isEditing = () => editingId != null;
  function startEdit(id, root = document) {
    const body = root.querySelector(`.m-body[data-id="${id}"]`);
    if (!body) return;
    body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    body.focus();
    const r = document.createRange();
    r.selectNodeContents(body);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /** 单条的「更多」菜单：编辑 / 标签 / 复制 / 删除 */
  function momentMenu(anchor, m, root) {
    openMenu(anchor, [
      { label: "编辑", icon: "pen", run: () => startEdit(m.id, root) },
      {
        label: "编辑标签…",
        icon: "hash",
        run: () =>
          tagPicker(anchor, m.tags, next => setTags(m.id, next), { placement: "bottom-end" }),
      },
      {
        label: "复制文本",
        icon: "copy",
        run: () => {
          navigator.clipboard?.writeText(textOf(m.html)).catch(() => {});
          toast("已复制");
        },
      },
      "-",
      { label: "删除", icon: "trash", danger: true, k: "⌫", run: () => remove(m.id) },
    ]);
  }

  window.Diary = {
    icon,
    esc,
    NOW,
    TODAY,
    WEEK,
    D,
    now,
    dayKey,
    keyDate,
    addDays,
    diffDays,
    fmtTime,
    dayLabel,
    rel,
    COLORS,
    get S() {
      return S;
    },
    F,
    on,
    emit,
    get demoMode() {
      return demoMode;
    },
    setQuery,
    setFilter,
    hasFilter,
    filtered,
    byDay,
    highlight,
    tagOf,
    tagColor,
    tagCount,
    tagsSorted,
    dayStats,
    streak,
    monthCount,
    onThisDay,
    tagHTML,
    tagsHTML,
    backfill,
    textOf,
    mountShell,
    setCrumb,
    openMenu,
    closeMenu,
    openPop,
    closePop,
    toast,
    openDialog,
    create,
    update,
    setTags,
    remove,
    recolor,
    clearTagDialog,
    tagPicker,
    tagManage,
    bindComposer,
    bindEditable,
    isEditing,
    startEdit,
    momentMenu,
    findM,
  };
})();
