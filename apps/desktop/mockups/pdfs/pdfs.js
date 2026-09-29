/* PDF 列表样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "总览与决策"],
  ["a-shelf.html", "方案 A 文档墙 + 列表"],
  ["c-split.html", "方案 C 分栏预览"],
];

/* 字段对应 Pdf 表 + 派生：pages / indexState 来自 pdf-index，annots 来自标注表，opened / at 需新增（最近打开、读到第几页） */
// [id, 文件名, 页数, 标注数, 来源, AI 索引, 添加日期, 最近打开, 读到页, 色相, 文件缺失]
const RAW = [
  [1, "Attention Is All You Need.pdf", 15, 23, "local", "ok", "2026-09-02", "2026-09-28", 9, 18],
  [2, "深入理解计算机系统（第3版）.pdf", 737, 64, "local", "ok", "2026-06-11", "2026-09-26", 212, 200],
  [3, "Designing Data-Intensive Applications.pdf", 613, 41, "remote", "ok", "2026-05-20", "2026-09-21", 188, 30],
  [4, "React 19 RFC - Actions.pdf", 22, 0, "remote", "run", "2026-09-27", null, 0, 260],
  [5, "LLaMA 3 Technical Report.pdf", 92, 12, "local", "ok", "2026-08-14", "2026-09-10", 40, 140],
  [6, "2026 年度体检报告.pdf", 18, 0, "local", "none", "2026-07-03", "2026-07-03", 1, 340],
  [7, "The Rust Programming Language.pdf", 552, 7, "remote", "err", "2026-04-01", "2026-08-02", 96, 20],
  [8, "WebGPU Shading Language 规范草案.pdf", 184, 3, "local", "ok", "2026-03-18", "2026-06-30", 22, 220, true],
  [9, "费曼物理学讲义 第一卷.pdf", 560, 0, "local", "none", "2026-02-10", null, 0, 100],
  [10, "Raft: In Search of an Understandable Consensus Algorithm.pdf", 18, 30, "local", "ok", "2026-01-22", "2026-05-11", 18, 300],
];
export const PDFS = RAW.map(([id, name, pages, annots, source, index, added, opened, at, hue, missing]) => ({
  id, name, title: name.replace(/\.pdf$/i, ""), pages, annots, source, index, added, opened, at, hue, missing: !!missing,
}));
export const byId = id => PDFS.find(p => p.id === +id);

export const fmtDate = d => {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return d >= "2026-09-28" ? "今天" : d === "2026-09-27" ? "昨天" : `${+m}月${+day}日`;
};
const SRC = { local: ["hard-drive", "本地"], remote: ["cloud", "远程"] };
const IDX = { ok: ["ok", "可检索"], run: ["run", "索引中"], none: ["", "未索引"], err: ["err", "索引失败"] };
export const src = p => `<span class="src"><i data-lucide="${SRC[p.source][0]}"></i>${SRC[p.source][1]}</span>`;
export const idx = p => `<span class="idx ${IDX[p.index][0]}">${IDX[p.index][1]}</span>`;

/* 首页缩略图；cover = "text" 时用文件名派生的文字封面 */
export function thumb(p, cls = "", cover = "page") {
  const badge = p.missing
    ? `<span class="badge-r" style="color:var(--danger)"><i data-lucide="file-x"></i>文件丢失</span>`
    : p.source === "remote" && cls === ""
      ? `<span class="badge-r"><i data-lucide="cloud"></i>远程</span>`
      : "";
  if (cover === "text" && cls !== "sm")
    return `<div class="thumb txt ${cls} ${p.missing ? "miss" : ""}" style="--th:hsl(${p.hue} 28% 42%)"><span>${p.title}</span><span class="ext">PDF · ${p.pages} 页</span>${badge}</div>`;
  return `<div class="thumb ${cls} ${p.missing ? "miss" : ""}" style="--th:hsl(${p.hue} 30% 62%)">
    <i class="h"></i><i class="l"></i><i class="l"></i><i class="l s"></i><i class="fig"></i><i class="l"></i><i class="l"></i><i class="l s"></i>${badge}</div>`;
}

export const sortPdfs = (list, key) =>
  [...list].sort((a, b) =>
    key === "name" ? a.title.localeCompare(b.title, "zh") : key === "annots" ? b.annots - a.annots : (b[key] || "0").localeCompare(a[key] || "0")
  );

export function listHead(sort) {
  const col = (k, l) =>
    `<span data-sort="${k}" style="cursor:pointer;${sort === k ? "color:var(--ink-1)" : ""}">${l}${sort === k ? '<i data-lucide="arrow-down"></i>' : ""}</span>`;
  return `<div class="p-row hd">${col("name", "名称")}<span>页数</span>${col("annots", "标注")}<span>来源</span><span>AI 检索</span>${col("opened", "最近打开")}<span></span></div>`;
}
export function listRow(p) {
  return `
  <div class="p-row" data-pdf="${p.id}">
    <div class="name">${thumb(p, "sm")}<span class="t">${p.title}</span>${p.missing ? '<span style="color:var(--danger);font-size:11.5px;flex:none">文件丢失</span>' : ""}</div>
    <div class="num">${p.pages}</div>
    <div class="num">${p.annots || "—"}</div>
    <div>${src(p)}</div>
    <div>${idx(p)}</div>
    <div class="num">${fmtDate(p.opened)}</div>
    <button class="ib" data-more="${p.id}"><i data-lucide="more-horizontal"></i></button>
  </div>`;
}

export function itemMenu(p) {
  return `<div class="menu">
    <div class="mi">打开</div>
    <div class="mi">重命名</div>
    ${p.source === "local" ? '<div class="mi">上传到云端</div>' : ""}
    ${p.source === "local" ? '<div class="mi">在文件夹中显示</div>' : '<div class="mi">复制链接</div>'}
    ${p.index === "err" || p.index === "none" ? '<div class="mi">建立 AI 索引</div>' : ""}
    <div class="mi" data-del="${p.id}" style="color:var(--danger)">删除</div>
  </div>`;
}

export function addDialog(tab = "local", upload = false) {
  const body =
    tab === "local"
      ? `<div class="zone"><i data-lucide="file-up"></i><span>拖入 PDF，或 <span style="color:var(--accent-text);cursor:pointer">选择文件</span></span><span style="color:var(--ink-3);font-size:11.5px">可一次选多个</span></div>
       <div class="chk" data-upload><i class="box ${upload ? "on" : ""}"></i>同时上传到云端（按设置里的图床配置）</div>`
      : `<div class="fld">链接<div class="fake">https://arxiv.org/pdf/1706.03762</div></div>
       <div class="fld">名称<div class="fake">1706.03762.pdf<span style="margin-left:auto;color:var(--ink-3);font-size:11.5px">从链接推断，可改</span></div></div>`;
  return `<div class="scrim"></div>
  <div class="dlg">
    <h3>添加 PDF<span class="sp" style="flex:1"></span><button class="ib" data-close><i data-lucide="x"></i></button></h3>
    <div class="tabs"><span class="chip ${tab === "local" ? "on" : ""}" data-tab="local">本地文件</span><span class="chip ${tab === "remote" ? "on" : ""}" data-tab="remote">链接</span></div>
    ${body}
    <div class="foot"><button class="btn" data-close>取消</button><button class="btn primary">添加</button></div>
  </div>`;
}

export function delDialog(p) {
  return `<div class="scrim"></div>
  <div class="dlg" style="width:400px">
    <h3>删除「${p.title}」？</h3>
    <div style="font-size:12.5px;color:var(--ink-2)">会一并删除它的 <b>${p.annots}</b> 条标注、书签和 AI 对话记录；${p.source === "local" ? "工作区 resources 里的文件副本也会删除。" : "远程文件本身不受影响。"}</div>
    <div class="foot"><button class="btn" data-close>取消</button><button class="btn danger">删除</button></div>
  </div>`;
}

/* ── 侧栏：「PDF」挂在学习组 ── */
export function sidebar() {
  const groups = [
    ["工作台", [["flame", "今日"], ["calendar", "日程"], ["list-todo", "待办"], ["timer", "番茄专注"], ["users", "协作"]]],
    ["知识", [["layers", "卡片库"], ["file-text", "文章"], ["pen-line", "日记"], ["presentation", "白板"], ["table", "数据库"]]],
    ["学习", [["folder-kanban", "项目"], ["flask-conical", "Notebook"], ["repeat", "闪卡复习"], ["circle-help", "问题管理"], ["book-open", "微信读书"], ["book-marked", "PDF", true]]],
    ["AI", [["message-circle", "AI 对话"], ["sparkles", "Skill"], ["plug", "MCP 服务器"]]],
    ["工具", [["send", "发布"]]],
  ];
  return `
  <aside class="sb">
    <div class="sb-head"><div class="sb-logo">τ</div><span>Tau</span></div>
    <div class="sb-scroll">
      ${groups
        .map(
          ([g, items]) => `<div class="sb-group"><div class="sb-gt">${g}</div>
          ${items.map(([ic, label, on]) => `<div class="sb-item ${on ? "on" : ""}"><i data-lucide="${ic}"></i><span>${label}</span></div>`).join("")}</div>`
        )
        .join("")}
    </div>
    <div class="sb-item"><i data-lucide="sliders-horizontal"></i><span>设置</span></div>
  </aside>`;
}

export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>PDF · 样板间</b>
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
    const top = bar.offsetHeight + (document.body.classList.contains("no-note") ? 0 : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18);
    const z = Math.min(1, (window.innerWidth - 24) / +sel.value, Math.max(0.35, (window.innerHeight - top - 24) / 820));
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
