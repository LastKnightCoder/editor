/* 微信读书样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "总览与决策"],
  ["a-shelf.html", "方案 A 书架 + 整页笔记"],
  ["b-table.html", "方案 B 书目表 + 抽屉"],
  ["c-split.html", "方案 C 分栏速览"],
];

/* ── 书架数据（字段对应 Metadata / ShelfBook：分类 = archiveName，状态由 markedStatus / readingProgress 推导） ── */
export const ARCHIVES = ["经济社科", "个人成长", "小说", "历史"];
// [id, 书名, 作者, 分类, 进度%, 阅读时长(分钟), 划线, 想法, 最近阅读, 读到章节, 出版社]
const RAW = [
  [
    "b01",
    "乡土中国",
    "费孝通",
    "经济社科",
    100,
    402,
    0,
    0,
    "2026-09-25",
    "从欲望到需要",
    "人民出版社",
  ],
  [
    "b02",
    "置身事内",
    "兰小欢",
    "经济社科",
    64,
    318,
    46,
    7,
    "2026-09-24",
    "第五章 城市化与不平衡",
    "上海人民出版社",
  ],
  ["b03", "长安的荔枝", "马伯庸", "小说", 38, 96, 12, 1, "2026-09-22", "第四章", "湖南文艺出版社"],
  [
    "b04",
    "深度工作",
    "卡尔·纽波特",
    "个人成长",
    22,
    64,
    9,
    2,
    "2026-09-18",
    "规则 1 工作要深入",
    "江西人民出版社",
  ],
  ["b05", "人类简史", "尤瓦尔·赫拉利", "历史", 100, 588, 73, 12, "2026-08-30", "", "中信出版社"],
  ["b06", "原则", "瑞·达利欧", "个人成长", 100, 720, 88, 16, "2026-08-11", "", "中信出版社"],
  ["b07", "三体", "刘慈欣", "小说", 100, 540, 21, 3, "2026-07-29", "", "重庆出版社"],
  [
    "b08",
    "被讨厌的勇气",
    "岸见一郎",
    "个人成长",
    100,
    212,
    34,
    5,
    "2026-07-02",
    "",
    "机械工业出版社",
  ],
  [
    "b09",
    "明朝那些事儿",
    "当年明月",
    "历史",
    47,
    830,
    18,
    0,
    "2026-06-20",
    "第三部 太监的崛起",
    "北京联合出版公司",
  ],
  [
    "b10",
    "思考，快与慢",
    "丹尼尔·卡尼曼",
    "经济社科",
    71,
    410,
    52,
    9,
    "2026-06-03",
    "第 24 章 资本主义的引擎",
    "中信出版社",
  ],
  ["b11", "活着", "余华", "小说", 100, 180, 8, 2, "2026-05-16", "", "作家出版社"],
  [
    "b12",
    "黑客与画家",
    "保罗·格雷厄姆",
    "个人成长",
    100,
    260,
    41,
    8,
    "2026-04-27",
    "",
    "人民邮电出版社",
  ],
  [
    "b13",
    "额尔古纳河右岸",
    "迟子建",
    "小说",
    12,
    40,
    3,
    0,
    "2026-04-09",
    "上部 清晨",
    "北京十月文艺出版社",
  ],
  ["b14", "刻意练习", "安德斯·艾利克森", "个人成长", 0, 0, 0, 0, "", "", "机械工业出版社"],
  ["b15", "枪炮、病菌与钢铁", "贾雷德·戴蒙德", "历史", 0, 0, 0, 0, "", "", "上海译文出版社"],
  [
    "b16",
    "纳瓦尔宝典",
    "埃里克·乔根森",
    "个人成长",
    100,
    150,
    29,
    4,
    "2026-03-14",
    "",
    "中信出版社",
  ],
];
const HUES = [
  ["#8b6f5a", "#6f5646"],
  ["#5f7d8c", "#48626f"],
  ["#7c8a63", "#5f6c4b"],
  ["#9a6b5c", "#7d5447"],
  ["#6e6a8f", "#555173"],
  ["#a3844f", "#86693b"],
  ["#4f7a72", "#3c5f58"],
  ["#8d5f6e", "#714a58"],
];
export const BOOKS = RAW.map(
  ([id, title, author, archive, progress, minutes, notes, reviews, last, at, publisher], i) => ({
    id,
    title,
    author,
    archive,
    progress,
    minutes,
    notes,
    reviews,
    last,
    at,
    publisher,
    status: progress >= 100 ? "finished" : progress > 0 ? "reading" : "unread",
    hue: HUES[(i * 5 + 3) % HUES.length],
  })
);
export const byId = id => BOOKS.find(b => b.id === id);

/* ── 《乡土中国》笔记（章节 = 真实目录；style 0 下划线 / 1 马克笔 / 2 波浪线，color 1 红 2 紫 3 蓝 4 绿 5 黄） ── */
export const CHAPTERS = [
  [
    "乡土本色",
    [
      ["从基层上看去，中国社会是乡土性的。", 1, 5, "", "09-12"],
      [
        "土气是因为不流动而发生的。",
        0,
        3,
        "“土”不是贬义，是一种与土地绑定的生存方式——不流动本身塑造了熟人社会的一切规则。",
        "09-12",
      ],
      ["这是一个“熟悉”的社会，没有陌生人的社会。", 1, 5, "", "09-12"],
      [
        "乡土社会的信用并不是对契约的重视，而是发生于对一种行为的规矩熟悉到不假思索时的可靠性。",
        2,
        1,
        "现代社会靠契约和法律建立信任，乡土社会靠的是「可预期」。",
        "09-12",
      ],
    ],
  ],
  [
    "文字下乡",
    [
      ["文字是间接的说话，而且是个不太完善的工具。", 0, 4, "", "09-13"],
      [
        "在面对面的亲密接触中，不明白的地方还可用反复的详细说明来补充，但是写的文字就无法如此。",
        1,
        5,
        "",
        "09-13",
      ],
    ],
  ],
  ["再论文字下乡", []],
  [
    "差序格局",
    [
      [
        "我们的格局不是一捆一捆扎清楚的柴，而是好像把一块石头丢在水面上所发生的一圈圈推出去的波纹。每个人都是他社会影响所推出去的圈子的中心。",
        1,
        5,
        "这个比喻太准了：每个人都是自己圈子的中心，圈子的大小随势力伸缩。对照西方的「团体格局」一起看。",
        "09-15",
      ],
      [
        "在差序格局中，社会关系是逐渐从一个一个人推出去的，是私人联系的增加，社会范围是一根根私人联系所构成的网络。",
        0,
        3,
        "",
        "09-15",
      ],
      ["伦是有差等的次序。", 2, 2, "", "09-15"],
    ],
  ],
  [
    "系维着私人的道德",
    [["在这种富于伸缩性的网络里，随时随地是有一个“己”作中心的。", 0, 3, "", "09-16"]],
  ],
  ["家族", []],
  ["男女有别", []],
  [
    "礼治秩序",
    [
      ["礼是社会公认合式的行为规范。", 1, 4, "", "09-19"],
      [
        "礼治的可能必须以传统可以有效地应付生活问题为前提。",
        0,
        1,
        "反过来说，当社会变迁加速、传统失效，礼治就会失灵——这正是「法治下乡」的背景。",
        "09-19",
      ],
    ],
  ],
  ["无讼", [["在乡土社会里，一说起“讼师”，大家会联想到“挑拨是非”之类的恶行。", 1, 5, "", "09-20"]]],
  ["无为政治", []],
  [
    "长老统治",
    [["教化性的权力虽则在亲子关系里表现得最明显，但并不限于亲子关系。", 0, 2, "", "09-22"]],
  ],
  ["血缘和地缘", []],
  ["名实的分离", [["名实之间的距离跟着社会变迁速率而增加。", 2, 1, "", "09-24"]]],
  ["从欲望到需要", []],
].map(([title, hls], ci) => ({
  idx: ci + 1,
  title,
  hls: hls.map(([q, style, color, review, date], hi) => ({
    id: `h${ci}-${hi}`,
    q,
    style,
    color,
    review,
    date,
  })),
}));
export const BOOK_REVIEW =
  "十四篇短文勾勒出乡土社会的底层逻辑。最有启发的是「差序格局」与「礼治秩序」两章：它们解释了人情为什么在中国社会里这么重要，也解释了现代化进程中规则失效的那种阵痛。";

const XT = BOOKS[0];
XT.notes = CHAPTERS.reduce((n, c) => n + c.hls.length, 0);
XT.reviews = CHAPTERS.reduce((n, c) => n + c.hls.filter(h => h.review).length, 0);

export const fmtMin = m =>
  m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ""}` : `${m} 分钟`;
export const fmtDate = d => {
  if (!d) return "—";
  const diff = Math.round((new Date("2026-09-26") - new Date(d)) / 864e5);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  return d.slice(0, 4) === "2026" ? d.slice(5).replace("-", "/") : d.replace(/-/g, "/");
};
export const STATUS_TEXT = { reading: "在读", finished: "读完", unread: "未开始" };

/* ── 原子 ── */
export const cover = (b, cls = "", extra = "") =>
  `<div class="cover ${cls}" style="background:linear-gradient(160deg, ${b.hue[0]}, ${b.hue[1]})"><div class="ct">${b.title}</div><div class="ca">${b.author}</div>${extra}</div>`;
export const prog = b =>
  `<div class="prog ${b.status === "finished" ? "done" : ""}"><i style="width:${b.progress}%"></i></div>`;
export const statusDot = b => `<span class="status ${b.status}">${STATUS_TEXT[b.status]}</span>`;

/* sync: "idle" | "syncing" | "offline" */
export function syncState(sync) {
  if (sync === "syncing")
    return `<span class="sync"><i data-lucide="loader" class="spin" style="width:14px;height:14px"></i>同步中 <span class="num">52 / 128</span><span class="bar"><i style="width:41%"></i></span></span>`;
  if (sync === "offline")
    return `<span class="sync" style="color:var(--warn)"><i data-lucide="cloud-off" style="width:14px;height:14px"></i>未连接 · 显示本地缓存</span>`;
  return `<span class="sync"><i data-lucide="check" style="width:14px;height:14px;color:var(--ok)"></i>3 分钟前同步</span>`;
}
export const syncBtn = sync =>
  sync === "offline"
    ? `<button class="btn line"><i data-lucide="key-round"></i>连接微信读书</button>`
    : `<button class="btn line" ${sync === "syncing" ? 'style="opacity:.5;pointer-events:none"' : ""}><i data-lucide="refresh-cw"></i>同步</button>`;
export const offlineBanner = () =>
  `<div class="w-banner"><i data-lucide="key-round"></i><span>API Key 已失效，当前显示的是上次同步的本地缓存，不能拉取新笔记。</span><span class="sp"></span><span class="x-link">重新填写</span></div>`;

/* ── 首次使用：未填 API Key ── */
export function emptyConnect() {
  return `
  <div class="empty">
    <div class="shelf"><span style="height:58px"></span><span style="height:72px"></span><span style="height:64px;background:var(--accent-soft)"></span><span style="height:50px"></span></div>
    <h2>把微信读书的书架和笔记带进来</h2>
    <p>连接后同步书架，打开一本书时按需拉取划线、想法和章节。数据只存在本机工作区。</p>
    <div class="steps">
      <div><b>1</b>在微信读书「AI 技能」页获取 API Key <span class="x-link" style="color:var(--accent-text);cursor:pointer">打开获取页 ↗</span></div>
      <div><b>2</b>粘贴到下方，校验通过后自动开始首次同步</div>
    </div>
    <div class="input"><div class="fake">粘贴 API Key</div><button class="btn primary">保存并同步</button></div>
  </div>`;
}

/* ── 侧栏：archives = 在「微信读书」下展开书架分类子项 ── */
export function sidebar({ archives = false, activeArchive = "全部" } = {}) {
  const groups = [
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
        ["pen-line", "日记"],
        ["presentation", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["circle-help", "问题管理"],
        ["book-open", "微信读书", true],
      ],
    ],
    [
      "AI",
      [
        ["message-circle", "AI 对话"],
        ["sparkles", "Skill 管理"],
        ["plug", "MCP 服务器"],
      ],
    ],
    [
      "工具",
      [
        ["bar-chart-3", "统计"],
        ["send", "发布"],
      ],
    ],
  ];
  const counts = { 全部: BOOKS.length };
  ARCHIVES.forEach(a => (counts[a] = BOOKS.filter(b => b.archive === a).length));
  const sub = archives
    ? `<div class="sb-sub">${["全部", ...ARCHIVES]
        .map(
          a =>
            `<div class="sb-subitem ${a === activeArchive ? "on" : ""}" data-archive="${a}"><span class="t">${a}</span><span class="meta num">${counts[a]}</span></div>`
        )
        .join("")}</div>`
    : "";
  return `
  <aside class="sb">
    <div class="sb-head"><div class="sb-logo">τ</div><span>Tau</span></div>
    <div class="sb-scroll">
      ${groups
        .map(
          ([g, items]) => `
        <div class="sb-group"><div class="sb-gt">${g}</div>
          ${items.map(([ic, label, on]) => `<div class="sb-item ${on ? "on" : ""}"><i data-lucide="${ic}"></i><span>${label}</span></div>${on ? sub : ""}`).join("")}
        </div>`
        )
        .join("")}
    </div>
    <div class="sb-item"><i data-lucide="sliders-horizontal"></i><span>设置</span></div>
  </aside>`;
}

/* ── 控制条 ── */
export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>微信读书 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${extraHTML}
    <span style="opacity:.7">缩放 <span id="mb-zoom">100%</span></span>
    <label>窗口宽 <select id="mb-width">
      <option value="1280">1280</option><option value="1440" selected>1440</option>
      <option value="1680">1680</option></select></label>
    <button class="mb-btn" id="mb-hl" title="笔记里的划线怎么呈现">划线：还原</button>
    <button class="mb-btn" id="mb-theme">切换深浅</button>
    <button class="mb-btn" id="mb-note">方案说明</button>
    <button class="mb-btn" id="mb-anno">标注</button>`;
  document.body.prepend(bar);
  document.documentElement.dataset.theme = localStorage.getItem("chat-mock-theme") || "cream";
  bar.querySelector("#mb-theme").onclick = () => {
    const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("chat-mock-theme", next);
  };
  const hlBtn = bar.querySelector("#mb-hl");
  const applyHl = () => {
    const q = localStorage.getItem("weread-mock-hl") === "quote";
    document.body.classList.toggle("hl-quote", q);
    hlBtn.textContent = q ? "划线：引文" : "划线：还原";
  };
  hlBtn.onclick = () => {
    localStorage.setItem(
      "weread-mock-hl",
      localStorage.getItem("weread-mock-hl") === "quote" ? "restore" : "quote"
    );
    applyHl();
  };
  applyHl();
  document.body.classList.add("no-anno");
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("weread-mock-width");
  if (savedW) sel.value = savedW;
  const fit = () => {
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
    const w = +sel.value,
      h = 820;
    const top =
      bar.offsetHeight +
      (document.body.classList.contains("no-note")
        ? 0
        : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18);
    const z = Math.min(
      1,
      (window.innerWidth - 24) / w,
      Math.max(0.35, (window.innerHeight - top - 24) / h)
    );
    document.querySelectorAll(".win").forEach(el => (el.style.zoom = z));
    bar.querySelector("#mb-zoom").textContent = Math.round(z * 100) + "%";
  };
  const apply = () => {
    localStorage.setItem("weread-mock-width", sel.value);
    document.querySelectorAll(".win").forEach(w => (w.style.width = sel.value + "px"));
    fit();
  };
  sel.onchange = apply;
  window.addEventListener("resize", fit);
  requestAnimationFrame(apply);
}

/* ── 笔记：书头 ── */
export function bookHead(b, { compact = false } = {}) {
  const finished = b.status === "finished";
  return `
  <div class="bh">
    ${cover(b)}
    <div class="info">
      <h2>${b.title}</h2>
      <div class="au">${b.author} · ${b.publisher}</div>
      <div class="pr">${prog(b)}<span class="num">${finished ? "读完" : b.progress + "%"}</span></div>
      <div class="meta">
        <span>阅读 <b class="num">${fmtMin(b.minutes)}</b></span>
        <span>划线 <b class="num">${b.notes}</b></span>
        <span>想法 <b class="num">${b.reviews}</b></span>
        <span>最近阅读 <b class="num">${fmtDate(b.last)}</b></span>
      </div>
      ${
        compact
          ? ""
          : `<div class="acts">
        <button class="btn"><i data-lucide="book-open"></i>在微信读书中打开</button>
        <button class="btn"><i data-lucide="refresh-cw"></i>重新拉取笔记</button>
        <button class="btn"><i data-lucide="copy"></i>复制为 Markdown</button>
      </div>`
      }
    </div>
  </div>`;
}

export const COLOR_NAME = { 1: "红", 2: "紫", 3: "蓝", 4: "绿", 5: "黄" };
function hlItem(h, { on = false } = {}) {
  const rv = h.review
    ? `<div class="rv"><i data-lucide="message-square-quote"></i><div>${h.review}</div></div>`
    : "";
  return `
  <div class="hl ${on ? "on" : ""}" style="--hlc:var(--hl-${h.color})" data-hl="${h.id}">
    <div class="bar"><button class="ib" title="复制"><i data-lucide="copy"></i></button></div>
    <div class="q"><mark class="s${h.style} c${h.color}">${h.q}</mark></div>
    ${rv}
    <div class="ft"><span class="num">2026/${h.date.replace("-", "/")}</span></div>
  </div>`;
}

/* 列表排布的行（书架「列表」与方案 B 共用） */
export function listHead(sort = "last") {
  const col = (k, l) =>
    `<span data-sort="${k}" style="cursor:pointer;${sort === k ? "color:var(--ink-1)" : ""}">${l}${sort === k ? '<i data-lucide="arrow-down"></i>' : ""}</span>`;
  return `<div class="b-row hd"><span>书名 / 作者</span><span>分类</span><span>状态</span>${col("progress", "进度")}${col("minutes", "阅读时长")}${col("notes", "笔记")}${col("last", "最近阅读")}</div>`;
}
export function listRow(b, on = false) {
  return `
  <div class="b-row ${on ? "on" : ""}" data-book="${b.id}">
    <div class="title">${cover(b, "sm")}<div style="min-width:0"><div class="t">${b.title}</div><div class="au">${b.author}</div></div></div>
    <div class="c"><span class="tagc">${b.archive}</span></div>
    <div>${statusDot(b)}</div>
    <div class="pc">${prog(b)}<span class="num" style="width:32px;text-align:right">${b.progress}%</span></div>
    <div class="c num">${b.minutes ? fmtMin(b.minutes) : "—"}</div>
    <div class="c num">${b.notes ? `${b.notes} 划线${b.reviews ? ` · ${b.reviews} 想法` : ""}` : "—"}</div>
    <div class="c num">${fmtDate(b.last)}</div>
  </div>`;
}
export const sortBooks = (list, key = "last") =>
  [...list].sort((a, b) =>
    key === "last" ? (b.last || "0").localeCompare(a.last || "0") : b[key] - a[key]
  );

/* 过滤条：全部 / 有想法 / 按颜色 */
export function noteTools(filter = "all") {
  return `
  <div class="n-tools">
    <span class="chip ${filter === "all" ? "on" : ""}" data-nf="all">全部</span>
    <span class="chip ${filter === "review" ? "on" : ""}" data-nf="review"><i data-lucide="message-square-quote"></i>有想法</span>
    <span style="width:6px"></span>
    ${[1, 2, 3, 4, 5].map(c => `<span class="swatch ${filter === "c" + c ? "on" : ""}" data-nf="c${c}" title="${COLOR_NAME[c]}色划线"><i style="background:var(--hl-${c})"></i></span>`).join("")}
    <span class="sp"></span>
    <button class="btn" style="height:26px;font-size:12px"><i data-lucide="arrow-down-up"></i>按章节</button>
  </div>`;
}

export function chapters({ filter = "all", activeHl = null, withEmpty = false } = {}) {
  const pass = h =>
    filter === "all" || (filter === "review" ? !!h.review : filter === "c" + h.color);
  return CHAPTERS.filter(c => withEmpty || c.hls.some(pass))
    .map(c => {
      const hls = c.hls.filter(pass);
      return `
      <section class="ch" id="ch-${c.idx}">
        <h3><span class="idx">${String(c.idx).padStart(2, "0")}</span>${c.title}<span class="c num">${hls.length}</span></h3>
        ${hls.map(h => hlItem(h, { on: h.id === activeHl })).join("")}
      </section>`;
    })
    .join("");
}

export function bookReview() {
  return `<div class="bookreview"><div class="lb"><i data-lucide="pen-line" style="width:14px;height:14px"></i>我的书评</div>${BOOK_REVIEW}</div>`;
}

export function toc(activeIdx = 4, off = false) {
  return `
  <nav class="n-toc ${off ? "off" : ""}">
    <div class="tt"><span>目录</span><span class="num">${CHAPTERS.length} 章</span></div>
    ${CHAPTERS.map(c => `<div class="it ${c.idx === activeIdx ? "on" : ""} ${c.hls.length ? "" : "none"}" data-toc="${c.idx}"><span class="t">${c.title}</span>${c.hls.length ? `<em class="num">${c.hls.length}</em>` : ""}</div>`).join("")}
  </nav>`;
}

/* 通用：笔记区交互（过滤 / 目录跳转 / 点选划线） */
export function bindNotes(root, state, render) {
  root.querySelectorAll("[data-nf]").forEach(
    el =>
      (el.onclick = () => {
        state.filter = state.filter === el.dataset.nf ? "all" : el.dataset.nf;
        render();
      })
  );
  root.querySelectorAll("[data-toc]").forEach(
    el =>
      (el.onclick = () => {
        state.toc = +el.dataset.toc;
        root.querySelectorAll("[data-toc]").forEach(t => t.classList.toggle("on", t === el));
        root
          .querySelector(`#ch-${el.dataset.toc}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      })
  );
  root.querySelectorAll("[data-hl]").forEach(
    el =>
      (el.onclick = e => {
        if (e.target.closest(".bar")) return;
        state.hl = state.hl === el.dataset.hl ? null : el.dataset.hl;
        root
          .querySelectorAll("[data-hl]")
          .forEach(x => x.classList.toggle("on", x.dataset.hl === state.hl));
      })
  );
}
