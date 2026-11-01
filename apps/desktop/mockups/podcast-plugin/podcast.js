/* 播客插件样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "结论与方案"],
  ["library.html", "插件页：播客库"],
  ["generate.html", "生成流程"],
];

/* 来源类型：与插件 app.open / data.* 支持的三类一致 */
export const KIND = {
  card: ["layers", "卡片"],
  article: ["file-text", "文章"],
  document: ["folder-kanban", "项目文档"],
};

export const SPEAKERS = {
  lin: { name: "林舟", tone: 2, voice: "温润男声", tag: "系统" },
  xia: { name: "夏禾", tone: 5, voice: "明亮女声", tag: "系统" },
  me: { name: "我", tone: 1, voice: "我的声音", tag: "克隆" },
  chen: { name: "陈老师", tone: 3, voice: "沉稳男声", tag: "系统" },
};

/* 一期一行：标题 / 来源 / 说话人 / 时长（秒）/ 生成日期 / 来源是否已删除 */
// [id, 标题, 来源类型, 来源标题, 来源所属, 说话人, 时长, 日期, 来源已删]
const RAW = [
  [
    1,
    "KV Cache 为什么能让推理快十倍",
    "article",
    "大模型推理优化笔记",
    "",
    ["lin", "xia"],
    412,
    "2026-10-08",
  ],
  [
    2,
    "间隔重复：和遗忘曲线讨价还价",
    "card",
    "遗忘曲线与间隔效应",
    "",
    ["lin", "xia"],
    268,
    "2026-10-06",
  ],
  [
    3,
    "Raft 选主的三个关键时刻",
    "document",
    "第 3 章 · 一致性算法",
    "分布式系统读书会",
    ["chen", "xia"],
    536,
    "2026-10-02",
  ],
  [
    4,
    "费曼学习法到底在练什么",
    "article",
    "费曼学习法实践记录",
    "",
    ["me", "xia"],
    305,
    "2026-09-27",
  ],
  [
    5,
    "React 19 Actions 一次讲清",
    "document",
    "Actions 与表单状态",
    "前端知识库",
    ["lin", "xia", "chen"],
    624,
    "2026-09-21",
  ],
  [6, "SM-2 和 FSRS 的分歧", "card", "SM-2 算法笔记", "", ["lin", "xia"], 233, "2026-09-12"],
  [
    7,
    "一次失败的周计划复盘",
    "article",
    "第 37 周复盘",
    "",
    ["me", "lin"],
    198,
    "2026-09-03",
    true,
  ],
];
export const PODS = RAW.map(([id, title, kind, src, scope, speakers, dur, date, gone]) => ({
  id,
  title,
  kind,
  src,
  scope,
  speakers,
  dur,
  date,
  gone: !!gone,
}));
export const byId = id => PODS.find(p => p.id === +id);

export const fmtDur = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const fmtMin = s => `${Math.round(s / 60)} 分钟`;
export const fmtDate = d => {
  const [, m, day] = d.split("-");
  return `${+m} 月 ${+day} 日`;
};

export const av = (key, cls = "") => {
  const s = SPEAKERS[key];
  return `<span class="av t${s.tone} ${cls}" title="${s.name} · ${s.voice}">${s.name.slice(0, 1)}</span>`;
};
export const avs = keys => `<span class="avs">${keys.map(k => av(k)).join("")}</span>`;

export const srcLink = p =>
  p.gone
    ? `<span class="srcl gone" title="原文已删除"><i data-lucide="${KIND[p.kind][0]}"></i><span class="tx">${p.src}</span></span>`
    : `<span class="srcl" title="打开原文"><i data-lucide="${KIND[p.kind][0]}"></i><span class="tx">${p.scope ? `${p.scope} / ` : ""}${p.src}</span></span>`;

/* 脚本样例：说话人分色、带时间戳 */
export const SCRIPT = [
  ["lin", 0, "今天聊一个听起来很底层、但几乎决定了大模型体验的东西：KV Cache。"],
  ["xia", 9, "我先承认，我一直以为它就是个普通缓存，存点中间结果而已。"],
  ["lin", 16, "方向没错。模型每生成一个字，都要回头看前面所有的字，这一步叫注意力。"],
  ["xia", 25, "那如果前面已经有两千个字，每次都要从头算一遍？"],
  [
    "lin",
    31,
    "不缓存的话就是这样。KV Cache 把前面每个字算好的 Key 和 Value 存下来，新字只算自己那一份。",
  ],
  ["xia", 44, "所以生成越往后，省下来的计算越多。"],
  ["lin", 49, "对，代价是显存。上下文越长，这块缓存就越大，这也是长上下文贵的原因之一。"],
  ["xia", 60, "那现在那些分页、量化的做法，都是在跟这块显存较劲？"],
  ["lin", 67, "可以这么理解。我们一个个看，先从 PagedAttention 说起。"],
];

/* 波形：按脚本说话人分段着色，进度前的柱子实色 */
export function wave(total, played = 0, { bars = 120, cls = "" } = {}) {
  const lines = SCRIPT;
  const out = [];
  for (let i = 0; i < bars; i++) {
    const t = (i / bars) * 70;
    let who = lines[0][0];
    for (const [w, st] of lines) if (st <= t) who = w;
    const h = 22 + Math.abs(Math.sin(i * 1.7) * 48 + Math.sin(i * 0.37) * 26);
    out.push(
      `<i class="t${SPEAKERS[who].tone} ${i / bars < played ? "on" : ""}" style="height:${Math.min(100, h)}%"></i>`
    );
  }
  return `<div class="wave ${cls}">${out.join("")}</div>`;
}

export function legend(keys) {
  return `<div class="legend">${keys.map(k => `<span class="t${SPEAKERS[k].tone}"><i></i>${SPEAKERS[k].name}</span>`).join("")}</div>`;
}

/* 侧栏：「播客」由插件注册在学习组（sidebar.registerItem，group = learning） */
export function sidebar({ on = true, busy = false } = {}) {
  const groups = [
    [
      "日常",
      [
        ["flame", "今日"],
        ["calendar", "日程"],
        ["list-todo", "待办"],
        ["pen-line", "日记"],
        ["timer", "番茄专注"],
      ],
    ],
    [
      "知识",
      [
        ["layers", "卡片库"],
        ["file-text", "文章", !on],
        ["folder-kanban", "项目"],
        ["presentation", "白板"],
        ["table", "数据库"],
      ],
    ],
    [
      "学习",
      [
        ["flask-conical", "Notebook"],
        ["book-marked", "PDF"],
        ["repeat", "闪卡复习"],
        ["book-open", "微信读书"],
        ["podcast", "播客", on, busy],
      ],
    ],
    [
      "AI",
      [
        ["message-circle", "AI 对话"],
        ["sparkles", "Skill"],
        ["plug", "MCP 服务器"],
      ],
    ],
  ];
  return `
  <aside class="sb">
    <div class="sb-head"><div class="sb-logo">τ</div><span>Tau</span></div>
    <div class="sb-scroll">
      ${groups
        .map(
          ([g, items]) => `<div class="sb-group"><div class="sb-gt">${g}</div>
          ${items.map(([ic, label, active, spin]) => `<div class="sb-item ${active ? "on" : ""}"><i data-lucide="${ic}"></i><span>${label}</span>${spin ? '<i data-lucide="loader-circle" class="spin-b spin"></i>' : ""}</div>`).join("")}</div>`
        )
        .join("")}
    </div>
    <div class="sb-item"><i data-lucide="blocks"></i><span>插件</span></div>
    <div class="sb-item"><i data-lucide="sliders-horizontal"></i><span>设置</span></div>
  </aside>`;
}

export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>播客插件 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${extraHTML}
    <span style="opacity:.7">缩放 <span id="mb-zoom">100%</span></span>
    <label>窗口宽 <select id="mb-width"><option value="1280">1280</option><option value="1440" selected>1440</option><option value="1680">1680</option></select></label>
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
  document.body.classList.add("no-anno");
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("chat-mock-width");
  if (savedW && [...sel.options].some(o => o.value === savedW)) sel.value = savedW;
  const fit = () => {
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
    const top =
      bar.offsetHeight +
      (document.body.classList.contains("no-note")
        ? 0
        : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18);
    const z = Math.min(
      1,
      (window.innerWidth - 24) / +sel.value,
      Math.max(0.35, (window.innerHeight - top - 24) / 820)
    );
    document.querySelectorAll(".win").forEach(el => (el.style.zoom = z));
    bar.querySelector("#mb-zoom").textContent = Math.round(z * 100) + "%";
  };
  const apply = () => {
    localStorage.setItem("chat-mock-width", sel.value);
    document.querySelectorAll(".win").forEach(w => (w.style.width = sel.value + "px"));
    fit();
  };
  sel.onchange = apply;
  window.addEventListener("resize", fit);
  requestAnimationFrame(apply);
}

/* 状态切换按钮组（样板间顶栏） */
export const seg = states =>
  `<span class="seg">${states.map(([k, l]) => `<button data-m="${k}">${l}</button>`).join("")}</span>`;
