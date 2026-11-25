import { mockBar, sidebar, titlebar, thread, composer, icons } from "../chat/shared.js?v=3";

/* ── 模拟站点 ── */
const SITES = {
  "https://supermemo.guru/wiki/SM-2": {
    title: "SuperMemo 2 Algorithm",
    domain: "supermemo.guru",
    nav: "SuperMemo Guru",
    body: `<h1>SuperMemo 2 Algorithm</h1>
      <p class="lead">The SM-2 algorithm was developed in 1987 and is still used by many spaced repetition apps.</p>
      <h2>Formula</h2>
      <pre>EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))</pre>
      <p>If the quality response was lower than 3, start repetitions for the item from the beginning without changing the E-Factor.</p>
      <p>See also: <a data-go="https://github.com/open-spaced-repetition/fsrs4anki">FSRS for Anki</a></p>
      <h2>Discussion</h2>
      <p>Leave a note for the editors:</p>
      <div class="site-form"><input placeholder="Your comment…" /><button>Send</button></div>
      <p>The algorithm has been criticised for the so-called "ease hell", where cards answered incorrectly multiple times stay at a low E-Factor.</p>
      <p>Later versions (SM-17, SM-18) model memory stability and retrievability directly.</p>`,
  },
  "https://github.com/open-spaced-repetition/fsrs4anki": {
    title: "open-spaced-repetition/fsrs4anki",
    domain: "github.com",
    nav: "GitHub",
    body: `<h1>fsrs4anki</h1>
      <p class="lead">A modern Anki custom scheduling based on the Free Spaced Repetition Scheduler algorithm.</p>
      <h2>Introduction</h2>
      <p>FSRS is based on the DSR (Difficulty, Stability, Retrievability) model of memory.</p>
      <pre>def next_interval(s, r=0.9):
    return s / FACTOR * (r ** (1 / DECAY) - 1)</pre>
      <p>Back to <a data-go="https://supermemo.guru/wiki/SM-2">SM-2</a>.</p>`,
  },
  "https://www.gwern.net/Spaced-repetition": {
    title: "Spaced Repetition for Efficient Learning",
    domain: "www.gwern.net",
    nav: "Gwern.net",
    body: `<h1>Spaced Repetition for Efficient Learning</h1>
      <p class="lead">Efficient memorization using the spacing effect: literature review of widespread applicability.</p>
      <p>Spaced repetition is a centuries-old psychological technique for efficient memorization &amp; practice of skills.</p>`,
  },
  "https://ncase.me/remember/": { fail: true, domain: "ncase.me" },
};
const URLS = Object.keys(SITES);

/* ── 状态 ── */
let scene = "doc";
let winW = 1440;
let dock = null; // 当前在右栏的视图
let covered = null; // 被临时网页盖住的视图（最多一个）
let expanded = false; // 网页放大为完整页
let toastTimer = 0;
const site = { history: [], idx: -1, status: "ok", scroll: 0 };

const win = document.getElementById("win");

mockBar(
  "",
  `<span class="seg" id="scenes">
  ${[
    ["doc", "正文链接"],
    ["chat", "聊天来源"],
    ["db", "数据表格"],
    ["plugin", "插件视图"],
  ]
    .map(([k, n]) => `<button class="mb-btn" data-scene="${k}">${n}</button>`)
    .join("")}</span>`
);
document.querySelectorAll(".mock-bar > a").forEach(a => a.remove());
document.querySelector(".mock-bar > b").textContent = "网页右栏 · 样板间";
document.querySelector("#mb-anno").remove();
document.getElementById("scenes").onclick = e => {
  const k = e.target.dataset?.scene;
  if (k) setScene(k);
};

function setScene(k) {
  scene = k;
  expanded = false;
  covered = null;
  site.history = [];
  site.idx = -1;
  dock = k === "chat" ? { kind: "chat" } : k === "plugin" ? { kind: "plugin" } : null;
  render();
}

/* ── 打开与切换 ── */
function openWeb(url) {
  if (dock?.kind === "web" && !expanded) {
    // 连续换网址：只替换网页，不再叠一层来源
    pushSite(url);
  } else if (expanded) {
    pushSite(url);
  } else {
    covered = dock && dock.kind !== "web" ? dock : null;
    dock = { kind: "web" };
    site.history = [];
    site.idx = -1;
    pushSite(url);
  }
  render();
}
function pushSite(url) {
  site.history = site.history.slice(0, site.idx + 1).concat(url);
  site.idx = site.history.length - 1;
  load();
}
function load() {
  site.status = "loading";
  site.scroll = 0;
  setTimeout(() => {
    site.status = SITES[site.history[site.idx]].fail ? "fail" : "ok";
    render();
  }, 650);
}
function closeDock() {
  if (expanded) return;
  if (dock?.kind === "web" && covered) {
    dock = covered;
    covered = null;
    toast(`回到${dock.kind === "chat" ? "刚才的对话" : "文档大纲"}`);
  } else {
    dock = null;
    covered = null;
  }
  render();
}
function expand() {
  rememberScroll();
  if (dock.kind === "web") expanded = true;
  else if (dock.kind === "chat") toast("对话进入完整对话页（沿用现有形变过渡）");
  else toast("插件视图进入插件完整页");
  render();
}
function retract() {
  rememberScroll();
  expanded = false;
  render();
}
function rememberScroll() {
  const el = win.querySelector(".site");
  if (el) site.scroll = el.scrollTop;
}
function toast(text) {
  clearTimeout(toastTimer);
  win.querySelector(".toast")?.remove();
  win.insertAdjacentHTML("beforeend", `<div class="toast">${text}</div>`);
  toastTimer = setTimeout(() => win.querySelector(".toast")?.remove(), 1800);
}

/* ── 渲染：主内容区 ── */
function mainContent() {
  if (expanded) return webFull();
  if (scene === "db") return dbPage();
  return docPage();
}

function docPage() {
  const L = (i, text) => `<span class="wl" data-open="${URLS[i]}">${text}</span>`;
  return `<div class="paper doc"><div class="doc-inner">
    <h1>SM-2 算法笔记</h1>
    <div class="dm num">2026-09-12 · 2,340 字 · 学习 / 算法</div>
    <p>SuperMemo 2（SM-2）是最早被广泛使用的间隔重复算法之一，原始说明见 ${L(0, "SuperMemo 官方 wiki")}。它为每张卡片维护一个易度因子 EF，初始值为 2.5，每次复习后根据回忆质量 q（0–5）更新。</p>
    <p>当 q &lt; 3 时，卡片的重复次数被重置，间隔回到 1 天，但 EF 并不会被重置——这导致一张多次答错的卡片会长期停留在低 EF 区间，这就是常说的「ease hell」。</p>
    <h2>和 FSRS 的差异</h2>
    <p>FSRS 把记忆状态拆成稳定性 S 与难度 D 两个量，可以根据目标保留率直接求出下一次间隔。Anki 上的实现见 ${L(1, "fsrs4anki")}。</p>
    <p>更完整的综述可以读 ${L(2, "Gwern 的 Spaced Repetition")}，交互式的入门介绍在 ${L(3, "How To Remember Anything Forever-ish")}（这个链接模拟加载失败）。</p>
  </div></div>`;
}

function dbPage() {
  const rows = [
    ["SM-2 原始说明", URLS[0], "算法"],
    ["FSRS for Anki", URLS[1], "实现"],
    ["Spaced Repetition 综述", URLS[2], "综述"],
    ["遗忘曲线互动讲解", URLS[3], "入门"],
  ];
  return `<div class="paper db">
    <h1>间隔重复资料库</h1>
    <div class="dm">数据表格 · 4 行</div>
    <table class="grid-t">
      <thead><tr><th><i data-lucide="type"></i>名称</th><th><i data-lucide="link"></i>链接</th><th><i data-lucide="tag"></i>类型</th></tr></thead>
      <tbody>${rows
        .map(
          ([
            n,
            u,
            t,
          ]) => `<tr><td>${n}</td><td class="link"><span class="wl">${u.replace("https://", "")}</span>
          <span class="cell-ops">
            <button class="ib" title="在浏览器中打开" data-toast="交给系统浏览器"><i data-lucide="external-link"></i></button>
            <button class="ib" title="在应用内打开" data-open="${u}"><i data-lucide="panel-right"></i></button>
          </span></td><td><span class="tagc">${t}</span></td></tr>`
        )
        .join("")}</tbody>
    </table>
  </div>`;
}

function webFull() {
  const url = site.history[site.idx];
  const s = SITES[url];
  return `<section class="paper web-full">
    <div class="web-bar">
      ${webNav()}
      <div class="addr"><i data-lucide="lock"></i><b>${s.domain}</b>${url.replace("https://" + s.domain, "") || "/"}</div>
      <button class="ib" title="在浏览器中打开" data-toast="交给系统浏览器"><i data-lucide="external-link"></i></button>
      <button class="ib" title="收回右栏" data-act="retract"><i data-lucide="minimize-2"></i></button>
    </div>
    <div class="dock-body">${webBody()}</div>
  </section>`;
}

/* ── 渲染：右栏 ── */
function dockPanel() {
  if (!dock || expanded) return `<section class="paper dock closed" id="dock"></section>`;
  let head, body;
  if (dock.kind === "web") {
    const url = site.history[site.idx];
    const s = SITES[url];
    head = `${webNav()}
      <div class="dock-title"><b>${site.status === "loading" ? "正在打开…" : s.fail ? s.domain : s.title}</b>
        <small><i data-lucide="${s.fail ? "globe" : "lock"}"></i>${s.domain}</small></div>
      <button class="ib" title="在浏览器中打开" data-toast="交给系统浏览器"><i data-lucide="external-link"></i></button>`;
    body = webBody();
  } else if (dock.kind === "chat") {
    head = `<div class="dock-title"><b>SM-2 与 FSRS 复习策略对比</b><small>AI 对话</small></div>
      <button class="ib" title="新对话"><i data-lucide="square-pen"></i></button>`;
    body = `<div class="thread" style="flex:1">${thread({ maxW: 9999, compact: true })}
      <div class="sources"><span class="h">来源</span>
        ${URLS.slice(0, 3)
          .map(
            u =>
              `<div class="src" data-open="${u}"><i data-lucide="globe"></i>${SITES[u].title}<em>${SITES[u].domain}</em></div>`
          )
          .join("")}
      </div></div>
      ${composer({ compact: true, ctx: true, placeholder: "问点什么，@ 引用内容" })}`;
  } else {
    head = `<div class="dock-title"><b>文档大纲</b><small><i data-lucide="plug"></i>大纲插件</small></div>`;
    body = `<div class="outline">
      <div class="oi on"><i data-lucide="hash"></i>SM-2 算法笔记</div>
      <div class="oi l2">间隔计算</div>
      <div class="oi l2">和 FSRS 的差异</div>
      <div class="oi l2">参考链接</div>
    </div>
    <div class="from">插件只提供内容；栏头、放大、关闭、宽度和 Esc 由 Tau 统一提供。</div>`;
  }
  const coveredNote =
    dock.kind === "web" && covered
      ? `title="关闭网页，回到${covered.kind === "chat" ? "对话" : "文档大纲"}"`
      : `title="关闭"`;
  return `<section class="paper dock" id="dock">
    <div class="dock-head">${head}
      <button class="ib" title="放大" data-act="expand"><i data-lucide="maximize-2"></i></button>
      <button class="ib" ${coveredNote} data-act="close"><i data-lucide="${dock.kind === "web" && covered ? "undo-2" : "x"}"></i></button>
    </div>
    <div class="dock-body">${body}</div>
  </section>`;
}

function webNav() {
  return `<button class="ib" title="网页后退" data-act="wback" ${site.idx > 0 ? "" : "disabled"}><i data-lucide="chevron-left"></i></button>
    <button class="ib" title="网页前进" data-act="wfwd" ${site.idx < site.history.length - 1 ? "" : "disabled"}><i data-lucide="chevron-right"></i></button>`;
}

function webBody() {
  const url = site.history[site.idx];
  const s = SITES[url];
  if (site.status === "loading") return `<div class="progress"></div><div class="site"></div>`;
  if (s.fail)
    return `<div class="fail"><span class="icon"><i data-lucide="wifi-off"></i></span>
      <b>无法打开 ${s.domain}</b><span>连接超时，检查网络后重试</span>
      <div class="row"><button class="btn line" data-act="retry"><i data-lucide="rotate-cw"></i>重试</button>
      <button class="btn" data-toast="交给系统浏览器"><i data-lucide="external-link"></i>在浏览器中打开</button></div></div>`;
  return `<div class="site"><div class="site-nav"><b>${s.nav}</b><span>Docs</span><span>About</span></div>
    <div class="site-main">${s.body}</div></div>`;
}

/* ── 渲染：整体 ── */
function crumb() {
  if (expanded)
    return `网页 <i data-lucide="chevron-right" style="width:13px"></i><b>${SITES[site.history[site.idx]].title ?? "网页"}</b>`;
  if (scene === "db")
    return `项目 <i data-lucide="chevron-right" style="width:13px"></i><b>间隔重复资料库</b>`;
  return `文章 <i data-lucide="chevron-right" style="width:13px"></i><b>SM-2 算法笔记</b>`;
}

function render() {
  const form = win.querySelector(".site-form input")?.value ?? "";
  win.innerHTML = `
    ${sidebar(scene === "db" ? "" : "articles")}
    <div class="col">
      ${titlebar(crumb(), `<button class="ib ${dock?.kind === "chat" ? "on" : ""}" title="AI 对话（Ctrl J）" data-act="chat"><i data-lucide="message-circle"></i></button>`)}
      <div class="main" id="main">${mainContent()}${dockPanel()}</div>
    </div>`;
  icons();
  const siteEl = win.querySelector(".site");
  if (siteEl) siteEl.scrollTop = site.scroll;
  const input = win.querySelector(".site-form input");
  if (input) input.value = form;
  document
    .querySelectorAll("#scenes button")
    .forEach(b => b.classList.toggle("on", b.dataset.scene === scene));
  // 标题栏后退：放大时等同「收回右栏」
  win.querySelector(".tb .ib").onclick = () => expanded && retract();
  layout();
}

function layout() {
  const SB = 218,
    SBC = 58,
    DOCK = 420,
    GAP = 18;
  const d = win.querySelector("#dock");
  const open = dock && !expanded;
  let collapsed = false,
    overlay = false;
  if (open) {
    let main = winW - SB - DOCK - GAP;
    if (main < 720) {
      collapsed = true;
      main = winW - SBC - DOCK - GAP;
    }
    if (main < 560) overlay = true;
  }
  win.classList.toggle("sb-c", collapsed);
  d.classList.toggle("overlay", overlay);
}

/* ── 事件 ── */
win.addEventListener("click", e => {
  const t = e.target.closest("[data-open],[data-go],[data-act],[data-toast]");
  if (!t) return;
  if (t.dataset.open) return openWeb(t.dataset.open);
  if (t.dataset.go) {
    rememberScroll();
    pushSite(t.dataset.go);
    return render();
  }
  if (t.dataset.toast) return toast(t.dataset.toast);
  const act = t.dataset.act;
  if (act === "close") closeDock();
  else if (act === "expand") expand();
  else if (act === "retract") retract();
  else if (act === "retry") {
    load();
    render();
  } else if (act === "wback" && site.idx > 0) {
    site.idx--;
    load();
    render();
  } else if (act === "wfwd" && site.idx < site.history.length - 1) {
    site.idx++;
    load();
    render();
  } else if (act === "chat") {
    if (expanded) retract();
    covered = null;
    dock = dock?.kind === "chat" ? null : { kind: "chat" };
    render();
  }
});
window.addEventListener("keydown", e => {
  if (e.key === "Escape" && dock && !expanded && win.querySelector("#dock.overlay")) closeDock();
});
window.addEventListener("mock-width", e => {
  winW = e.detail;
  layout();
});

setScene("doc");
