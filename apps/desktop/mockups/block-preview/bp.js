/* 块预览样板间 · 共享渲染（控制条 / 统一预览框 / 示例内容 / 对话流）
   窗口骨架复用 ../chat/shared.js（侧栏 / 标题栏 / 输入区） */

import { sidebar, titlebar, composer, icons } from "../chat/shared.js?v=3";
export { sidebar, titlebar, composer, icons };

const PLANS = [
  ["index.html", "总览"],
  ["plan-a-split.html", "A 纸内分栏"],
  ["plan-b-stage.html", "B 预览上正文"],
  ["plan-c-quicklook.html", "C 覆盖大预览"],
  ["frame.html", "统一预览框"],
];

export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>块预览 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${extraHTML}
    <span style="opacity:.7">缩放 <span id="mb-zoom">100%</span></span>
    <label>窗口宽 <select id="mb-width">
      <option value="1280">1280</option><option value="1440" selected>1440</option>
      <option value="1680">1680</option></select></label>
    <button class="mb-btn" id="mb-theme">切换深浅</button>
    <button class="mb-btn" id="mb-note">方案说明</button>`;
  document.body.prepend(bar);

  const saved = localStorage.getItem("chat-mock-theme") || "cream";
  document.documentElement.dataset.theme = saved;
  bar.querySelector("#mb-theme").onclick = () => {
    const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("chat-mock-theme", next);
  };
  document.body.classList.add("no-note");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("chat-mock-width");
  if (savedW && [...sel.options].some(o => o.value === savedW)) sel.value = savedW;
  const fit = () => {
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
    const w = +sel.value;
    const top =
      bar.offsetHeight +
      (document.body.classList.contains("no-note")
        ? 0
        : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18);
    const z = Math.min(
      1,
      (window.innerWidth - 24) / w,
      Math.max(0.35, (window.innerHeight - top - 24) / 820)
    );
    document.querySelectorAll(".win").forEach(el => (el.style.zoom = z));
    const ro = document.getElementById("mb-zoom");
    if (ro) ro.textContent = Math.round(z * 100) + "%";
  };
  const apply = () => {
    localStorage.setItem("chat-mock-width", sel.value);
    document.querySelectorAll(".win").forEach(w => (w.style.width = sel.value + "px"));
    window.dispatchEvent(new CustomEvent("mock-width", { detail: +sel.value }));
    fit();
  };
  sel.onchange = apply;
  window.addEventListener("resize", fit);
  requestAnimationFrame(apply);
}

/* ── 块类型表：图标 / 类型名 / 类型专属工具 / 预览底 ── */
export const TYPES = {
  html: {
    icon: "globe",
    label: "HTML",
    title: "电影感全屏演示超级模板",
    size: "8.4 KB",
    tools: [
      ["smartphone", "移动端预览"],
      ["rotate-cw", "刷新"],
    ],
    more: ["在浏览器中打开", "下载 .html"],
    body: "white",
  },
  "mind-map": {
    icon: "network",
    label: "思维导图",
    title: "煤气灯效应（Gaslighting）",
    size: "1.3 KB",
    tools: [],
    zoom: true,
    more: ["复制到白板", "导出 PNG"],
    body: "plain",
  },
  whiteboard: {
    icon: "presentation",
    label: "白板",
    title: "FSRS 调度流程",
    size: "3.1 KB",
    tools: [],
    zoom: true,
    more: ["复制到白板", "导出 PNG"],
    body: "plain",
  },
  mermaid: {
    icon: "workflow",
    label: "Mermaid",
    title: "复习状态机",
    size: "0.6 KB",
    tools: [],
    zoom: true,
    more: ["导出 SVG", "导出 PNG"],
    body: "plain",
  },
  plantuml: {
    icon: "git-fork",
    label: "PlantUML",
    title: "同步时序图",
    size: "0.9 KB",
    tools: [],
    zoom: true,
    more: ["导出 SVG"],
    body: "plain",
  },
  tikz: {
    icon: "sigma",
    label: "TikZ",
    title: "遗忘曲线",
    size: "1.1 KB",
    tools: [],
    zoom: true,
    more: ["导出 SVG"],
    body: "plain",
  },
};

/* ── 统一预览框 ──
   state: ready | source | generating | error | mobile
   head 固定：图标 · 标题/类型·大小 · [版本 ‹›] · 预览/源码 · 类型工具 · 复制 · 全屏 · 更多 · 关闭 */
export function frame({
  type = "html",
  state = "ready",
  versions = null, // [cur, total]
  closable = true,
  expand = true,
  expandIcon = "maximize-2",
  closeIcon = "x",
  extraClass = "",
} = {}) {
  const t = TYPES[type];
  const isSource = state === "source" || state === "generating";
  const meta =
    state === "generating"
      ? `<span class="gen"><span class="spin"></span>生成中 · 已写入 214 行</span>`
      : `${t.label} · ${t.size}`;
  const tools =
    state === "error" || isSource
      ? ""
      : t.tools
          .map(
            ([ic, tip]) =>
              `<button class="ib ${state === "mobile" && ic === "smartphone" ? "on" : ""}" title="${tip}"><i data-lucide="${ic}"></i></button>`
          )
          .join("");
  return `
  <div class="pv ${extraClass}">
    <div class="pv-head">
      <span class="pv-ic"><i data-lucide="${t.icon}"></i></span>
      <div class="pv-title"><b>${t.title}</b><span>${meta}</span></div>
      <div class="pv-tools">
        ${
          versions
            ? `<span class="ver num"><button class="ib" title="上一版"><i data-lucide="chevron-left"></i></button>v${versions[0]} / ${versions[1]}<button class="ib" title="下一版"><i data-lucide="chevron-right"></i></button></span>`
            : ""
        }
        <span class="seg2"><button class="${isSource ? "" : "on"}">预览</button><button class="${isSource ? "on" : ""}">源码</button></span>
        ${tools}
        <button class="ib" title="复制源码"><i data-lucide="copy"></i></button>
        ${expand ? `<button class="ib" title="全屏"><i data-lucide="${expandIcon}"></i></button>` : ""}
        <button class="ib" title="${t.more.join(" / ")}"><i data-lucide="more-horizontal"></i></button>
        ${closable ? `<span class="pv-sep"></span><button class="ib pv-close" title="关闭 Esc"><i data-lucide="${closeIcon}"></i></button>` : ""}
      </div>
    </div>
    <div class="pv-body ${state === "error" ? "plain" : isSource ? "" : t.body}">
      ${body(type, state)}
      ${t.zoom && state === "ready" ? zoomCtl() : ""}
    </div>
  </div>`;
}

function zoomCtl() {
  return `<div class="pv-zoom"><button class="ib" title="缩小"><i data-lucide="minus"></i></button><span class="num">100%</span><button class="ib" title="放大"><i data-lucide="plus"></i></button><button class="ib" title="适应窗口"><i data-lucide="scan"></i></button></div>`;
}

function body(type, state) {
  if (state === "source") return source(type, false);
  if (state === "generating") return source(type, true);
  if (state === "error") return errorState();
  if (state === "mobile") return `<div class="device"><div class="phone">${htmlDemo()}</div></div>`;
  if (type === "html") return htmlDemo();
  if (type === "mind-map") return `<div class="canvas">${mindmapSVG()}</div>`;
  if (type === "whiteboard" || type === "mermaid" || type === "plantuml")
    return `<div class="canvas">${flowSVG()}</div>`;
  if (type === "tikz") return `<div class="canvas">${curveSVG()}</div>`;
  return "";
}

export function htmlDemo() {
  return `<div class="demo-html">
    <div class="k">CHAPTER 01 · COVER</div>
    <h1>把时间<br/>交给真正重要的事</h1>
    <p>键盘 ← → / 滚轮 / 点击圆点切换章节。琥珀金点缀贯穿始终，所有动画共用同一条时间曲线。</p>
    <div class="dots"><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="prog"></div>
  </div>`;
}

function source(type, streaming) {
  const lines =
    type === "html"
      ? [
          `<span class="t">&lt;!DOCTYPE html&gt;</span>`,
          `<span class="t">&lt;html</span> <span class="a">lang</span>=<span class="s">"zh-CN"</span><span class="t">&gt;</span>`,
          `<span class="t">&lt;head&gt;</span>`,
          `  <span class="t">&lt;meta</span> <span class="a">charset</span>=<span class="s">"utf-8"</span> <span class="t">/&gt;</span>`,
          `  <span class="t">&lt;title&gt;</span>电影感全屏演示超级模板 v3.0<span class="t">&lt;/title&gt;</span>`,
          `  <span class="t">&lt;style&gt;</span>`,
          `    :root { --amber: #d9a55b; --ease: cubic-bezier(.22,1,.36,1); }`,
          `    .slide { position: fixed; inset: 0; display: grid; place-items: center; }`,
          `    .slide.is-active { opacity: 1; transform: none; }`,
          `    <span class="c">/* 圆点导航与进度条自动适配 slide 数量 */</span>`,
          `    .dots i.on { background: var(--amber); }`,
          `  <span class="t">&lt;/style&gt;</span>`,
          `<span class="t">&lt;/head&gt;</span>`,
          `<span class="t">&lt;body&gt;</span>`,
          `  <span class="t">&lt;section</span> <span class="a">class</span>=<span class="s">"slide is-active"</span> <span class="a">data-kind</span>=<span class="s">"cover"</span><span class="t">&gt;</span>`,
          `    <span class="t">&lt;h1&gt;</span>把时间交给真正重要的事<span class="t">&lt;/h1&gt;</span>`,
        ]
      : [
          `- 煤气灯效应（Gaslighting）`,
          `  - 定义`,
          `    - 通过否认、歪曲事实让对方怀疑自身认知`,
          `  - 常见手法`,
          `    - 否认发生过的事`,
          `    - 轻视感受：「你太敏感了」`,
          `    - 孤立：切断外部支持`,
          `  - 识别信号`,
          `    - 频繁自我怀疑`,
          `    - 总在道歉`,
          `  - 应对`,
          `    - 记录事实`,
          `    - 寻求第三方视角`,
        ];
  return `<div class="src">${lines.map((l, i) => `<span class="l">${l}${streaming && i === lines.length - 1 ? `<span class="cursor"></span>` : ""}</span>`).join("")}</div>`;
}

function errorState() {
  return `<div style="height:100%;display:grid;place-items:center;padding:24px">
    <div style="max-width:360px;text-align:center">
      <span style="width:44px;height:44px;border-radius:50%;background:var(--danger-soft);color:var(--danger);display:inline-grid;place-items:center"><i data-lucide="triangle-alert"></i></span>
      <div style="font-weight:600;font-size:15px;margin-top:14px">预览失败</div>
      <div style="color:var(--ink-2);font-size:12.5px;margin-top:4px">第 12 行语法有误：缺少闭合的 <span class="mono">end</span>。已保留上一次成功的渲染。</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
        <button class="btn primary">查看源码</button><button class="btn" style="border:1px solid var(--line-1)">让 AI 修复</button>
      </div>
      <div style="margin-top:18px;font-size:12px;color:var(--ink-3);display:flex;justify-content:space-between"><span>› 技术详情</span><span>复制错误信息</span></div>
    </div></div>`;
}

export function mindmapSVG() {
  const L = [
    ["定义", 70],
    ["常见手法", 150],
    ["识别信号", 230],
  ];
  const R = [
    ["应对", 90],
    ["与 PUA 的区别", 170],
    ["延伸阅读", 250],
  ];
  const leaves = {
    定义: ["否认、歪曲事实"],
    常见手法: ["否认发生过的事", "轻视感受", "孤立"],
    识别信号: ["频繁自我怀疑", "总在道歉"],
    应对: ["记录事实", "寻求第三方视角"],
    "与 PUA 的区别": ["目的不同"],
    延伸阅读: ["《煤气灯下》1944"],
  };
  const node = (x, y, t, w, root = false) =>
    `<g class="mm-node ${root ? "root" : ""}"><rect x="${x - w / 2}" y="${y - 15}" width="${w}" height="30" rx="${root ? 10 : 8}"/><text x="${x}" y="${y + 4.5}" text-anchor="middle">${t}</text></g>`;
  let s = `<svg viewBox="0 0 860 320" xmlns="http://www.w3.org/2000/svg">`;
  const cx = 430,
    cy = 160;
  const side = (arr, dir) =>
    arr
      .map(([t, y]) => {
        const x = cx + dir * 170;
        let g = `<path class="mm-edge" d="M${cx + dir * 80} ${cy} C ${cx + dir * 110} ${cy}, ${x - dir * 90} ${y}, ${x - dir * 50} ${y}"/>`;
        g += node(x, y, t, 100);
        leaves[t].forEach((lt, i) => {
          const ly = y + (i - (leaves[t].length - 1) / 2) * 30;
          const lx = x + dir * 175;
          g += `<path class="mm-edge" d="M${x + dir * 50} ${y} C ${x + dir * 80} ${y}, ${lx - dir * 90} ${ly}, ${lx - dir * 62} ${ly}"/>`;
          g += node(lx, ly, lt, 124);
        });
        return g;
      })
      .join("");
  s += side(L, -1) + side(R, 1) + node(cx, cy, "煤气灯效应", 160, true) + `</svg>`;
  return s;
}

function flowSVG() {
  const n = (x, y, t, w = 120) =>
    `<g class="mm-node"><rect x="${x - w / 2}" y="${y - 17}" width="${w}" height="34" rx="9"/><text x="${x}" y="${y + 4.5}" text-anchor="middle">${t}</text></g>`;
  const e = (x1, y1, x2, y2) =>
    `<path class="mm-edge" d="M${x1} ${y1} L${x2} ${y2}" marker-end="url(#ar)"/>`;
  return `<svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--ink-3)"/></marker></defs>
    ${e(170, 60, 262, 60)}${e(380, 60, 470, 60)}${e(320, 78, 320, 132)}${e(320, 168, 320, 222)}${e(380, 150, 470, 150)}
    ${n(110, 60, "新卡片")}${n(320, 60, "学习中")}${n(530, 60, "复习中")}${n(320, 150, "评分")}${n(530, 150, "重新学习")}${n(320, 240, "计算 S / D")}
  </svg>`;
}

function curveSVG() {
  return `<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 250 H490 M50 250 V30" stroke="var(--ink-2)" stroke-width="1.4" fill="none"/>
    <path d="M50 40 C 90 170, 150 205, 490 228" stroke="var(--accent)" stroke-width="2.2" fill="none"/>
    <path d="M50 40 C 70 120, 100 150, 130 160 L130 60 C 160 140, 200 150, 250 155 L250 70 C 300 120, 380 130, 490 135" stroke="var(--info)" stroke-width="1.6" fill="none" stroke-dasharray="4 4"/>
    <text x="495" y="254" font-size="12" fill="var(--ink-2)">t</text><text x="30" y="34" font-size="12" fill="var(--ink-2)">R</text>
  </svg>`;
}

/* ── 对话流（真实场景：演示模板 v3 + 思维导图生成中） ── */
export function blockCard({ type, title, meta, on = false, generating = false, ver = "" }) {
  const t = TYPES[type];
  return `<div class="bc ${on ? "on" : ""}" data-block="${type}">
    <span class="bi">${generating ? `<span class="spin"></span>` : `<i data-lucide="${t.icon}"></i>`}</span>
    <div style="min-width:0;flex:1"><div class="bt">${title ?? t.title}</div>
    <div class="bm"><span class="mono">${t.label}</span><span>·</span><span>${meta ?? t.size}</span>${ver ? `<span>·</span><span class="num">${ver}</span>` : ""}<span>·</span><span>${generating ? "生成中…" : on ? "预览中" : "点击预览"}</span></div></div>
  </div>`;
}

export function thread({ maxW = 760, active = null, generating = false, compact = false } = {}) {
  const pad = compact ? "padding:16px 16px 8px" : "";
  return `
  <div class="thread-inner" style="max-width:${maxW}px;${pad}">
    <div class="msg msg-user"><div class="bubble">再改一版演示模板：加上金句页和对比页，所有动画统一时间曲线。</div></div>
    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>deepseek-v4-flash<span>·</span><span class="num">21:08</span></div>
      <div class="md">
        <p>这是最终版本，包含 6 种页面类型：封面、章节、要点、金句、对比、结束。</p>
        ${blockCard({ type: "html", title: "电影感全屏演示超级模板", on: active === "html", ver: "v3" })}
        <p>如果你想增加一页，只需在 HTML 中复制一个 <code>slide</code> 块，圆点和进度条会自动适配。</p>
      </div>
    </div>
    <div class="msg msg-user"><div class="bubble">生成思维导图</div></div>
    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>deepseek-v4-flash<span>·</span><span>${generating ? "生成中" : '<span class="num">21:11</span>'}</span></div>
      <div class="md">
        <p>好的，我先按「煤气灯效应」主题生成一版思维导图示例；需要改层级深度请告诉我。</p>
        ${blockCard({ type: "mind-map", on: active === "mind-map", generating, meta: generating ? "已写入 13 行" : undefined })}
      </div>
    </div>
  </div>`;
}

/* 对话页纸（标题行 + 对话流 + 输入区） */
export function chatPaper({
  maxW = 760,
  active = null,
  generating = false,
  style = "flex:1",
  titleTools = "",
} = {}) {
  return `
  <section class="paper" style="${style};display:flex;flex-direction:column;min-width:0">
    <div style="display:flex;align-items:center;height:44px;padding:0 10px 0 20px;flex:none">
      <b style="font-weight:500">煤气灯效应思维导图</b><i data-lucide="chevron-down" style="width:14px;margin-left:4px;color:var(--ink-3)"></i>
      <span style="flex:1"></span>${titleTools}
      <button class="ib"><i data-lucide="more-horizontal"></i></button>
    </div>
    <div class="thread" style="flex:1">${thread({ maxW, active, generating })}</div>
    ${composer({ maxW, ctx: false, placeholder: "输入消息，Command + Enter 进行发送" })}
  </section>`;
}

/* 右侧停靠栏里的对话（400px） */
export function dockPaper({ active = null, generating = false, extraClass = "" } = {}) {
  return `
  <section class="paper dock ${extraClass}">
    <div class="dock-head">
      <div class="dock-title"><span>煤气灯效应思维导图</span><i data-lucide="chevron-down" style="width:14px"></i></div>
      <button class="ib" title="在对话页打开"><i data-lucide="maximize-2"></i></button>
      <button class="ib" title="关闭"><i data-lucide="x"></i></button>
    </div>
    <div class="thread">${thread({ maxW: 400, active, generating, compact: true })}</div>
    ${composer({ compact: true, ctx: false, placeholder: "继续追问…" })}
  </section>`;
}

export function docPaper() {
  return `
  <section class="paper doc" style="flex:1">
    <div class="doc-inner">
      <h1>认知偏差与自我觉察</h1>
      <div class="dm">文章 · 更新于 9 月 24 日 · 2,480 字</div>
      <p>我们对世界的判断，远比自以为的更容易被他人影响。操纵者往往并不需要说谎，只需要反复质疑你的记忆与感受，时间一长，人就会开始怀疑自己。</p>
      <p>这种现象在心理学上有一个名字——煤气灯效应。识别它的第一步，是把「感觉不对」落到可以核对的事实上。</p>
    </div>
  </section>`;
}
