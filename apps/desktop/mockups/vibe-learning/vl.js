/* Vibe Learning 样板间 · 共享数据与渲染 */
import { sidebar as baseSidebar, titlebar, anno, icons } from "../chat/shared.js?v=3";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "总览"],
  ["a-columns.html", "方案 A 纸内三栏"],
  ["b-chat.html", "方案 B 对话为主"],
  ["c-desk.html", "方案 C 学习台"],
];

export const STATES = [
  ["default", "默认"],
  ["empty", "空项目"],
  ["preview", "预览资料"],
  ["note", "编辑笔记"],
];

/* ── 数据（字段对应 VLResource / VLNote） ── */
export const RESOURCES = [
  { id: "r1", ic: "file-text", t: "深度学习 · 第 3 章 概率与信息论.pdf", m: "PDF · 38 页" },
  {
    id: "r2",
    ic: "clapperboard",
    t: "3Blue1Brown｜神经网络是什么",
    m: "B 站 · 19:13",
    busy: "转录中",
    p: 42,
  },
  { id: "r3", ic: "audio-lines", t: "周三课堂录音.m4a", m: "音频 · 52:08" },
  { id: "r4", ic: "notebook-pen", t: "反向传播推导", m: "来自卡片库" },
  { id: "r5", ic: "globe", t: "CS231n Notes: Backpropagation", m: "网页", err: "解析失败" },
];

export const APPS = [
  ["list-tree", "学习大纲"],
  ["highlighter", "重点提炼"],
  ["file-text", "文章"],
  ["network", "思维导图"],
  ["presentation", "PPT"],
  ["file-chart-column", "报告"],
  ["circle-help", "测验"],
  ["mic", "播客"],
];

export const OUTPUTS = [
  { id: "n1", ic: "list-tree", t: "第 3 章学习大纲", m: "大纲 · 10:24" },
  { id: "n2", ic: "highlighter", t: "反向传播重点", m: "重点提炼 · 昨天" },
  { id: "q1", ic: "circle-help", t: "第 3 章自测", m: "测验 · 12 题 · 上次 83 分" },
  { id: "n3", ic: "mic", t: "神经网络入门对谈", m: "播客 · 08:40" },
  { id: "n4", ic: "notebook-pen", t: "我的疑问整理", m: "笔记 · 周二" },
];

/* ── 控制条 ── */
export function mockBar(current, onState) {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>Vibe Learning · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${onState ? `<span class="seg">${STATES.map(([k, l]) => `<button class="mb-btn" data-s="${k}">${l}</button>`).join(" ")}</span>` : ""}
    <label>窗口宽 <select id="mb-width">
      <option value="1280">1280</option><option value="1440" selected>1440</option>
      <option value="1680">1680</option><option value="1920">1920</option></select></label>
    <button class="mb-btn" id="mb-theme">切换深浅</button>
    <button class="mb-btn" id="mb-note">方案说明</button>`;
  document.body.prepend(bar);

  document.documentElement.dataset.theme = localStorage.getItem("chat-mock-theme") || "cream";
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
  bar.querySelectorAll("[data-s]").forEach(b => {
    b.onclick = () => {
      bar.querySelectorAll("[data-s]").forEach(x => (x.style.borderColor = ""));
      b.style.borderColor = "#e8b598";
      onState(b.dataset.s);
    };
  });
  bar.querySelector('[data-s="default"]')?.style.setProperty("border-color", "#e8b598");

  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("chat-mock-width");
  if (savedW) sel.value = savedW;
  const fit = () => {
    if (window.innerWidth < 100) return;
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

/* 侧栏：「项目」高亮 */
export function sidebar() {
  return baseSidebar().replace(
    '<div class="sb-item " title="项目">',
    '<div class="sb-item on" title="项目">'
  );
}

export const crumb = `<span>项目</span><i data-lucide="chevron-right" style="width:13px;color:var(--ink-3)"></i><b>Vibe Learning 测试</b>`;

/* ── 行 ── */
export function resRow(r, { on = false, compact = false } = {}) {
  const meta = r.err
    ? `<span class="err">${r.err}</span><span>·</span><span>${r.m}</span>`
    : r.busy
      ? `<span class="busy">${r.busy}</span><span class="bar"><i style="width:${r.p}%"></i></span><span class="num">${r.p}%</span>`
      : `<span>${r.m}</span>`;
  return `
  <div class="vl-row ${on ? "on" : ""} ${compact ? "compact" : ""}" data-res="${r.id}">
    <span class="ic"><i data-lucide="${r.ic}"></i></span>
    <div class="tx"><div class="t">${r.t}</div>${compact ? "" : `<div class="m">${meta}</div>`}</div>${compact && r.busy ? `<span class="flag num">${r.p}%</span>` : ""}${compact && r.err ? `<span class="flag err">失败</span>` : ""}
    <span class="act">${r.err ? `<button class="ib" title="重试"><i data-lucide="rotate-cw"></i></button>` : ""}<button class="ib" title="更多"><i data-lucide="more-horizontal"></i></button></span>
  </div>`;
}

export function outRow(o, { on = false, compact = false } = {}) {
  return `
  <div class="vl-row ${on ? "on" : ""} ${compact ? "compact" : ""}" data-out="${o.id}">
    <span class="ic"><i data-lucide="${o.ic}"></i></span>
    <div class="tx"><div class="t">${o.t}</div>${compact ? "" : `<div class="m"><span>${o.m}</span></div>`}</div>
    <span class="act"><button class="ib" title="更多"><i data-lucide="more-horizontal"></i></button></span>
  </div>`;
}

export function apps(list = false) {
  return `<div class="vl-apps ${list ? "list" : ""}">${APPS.map(([ic, l]) => `<div class="vl-app" title="${l}"><i data-lucide="${ic}"></i>${l}</div>`).join("")}</div>`;
}

export function resEmpty() {
  return `<div class="vl-empty"><b>还没有资料</b>PDF、Office、音视频、网页、B 站 / YouTube 链接，或从卡片库、文章里挑已有笔记<br><button class="btn"><i data-lucide="plus"></i>添加资料</button></div>`;
}
export function outEmpty() {
  return `<div class="vl-empty" style="padding:18px 22px">生成的大纲、测验、播客和手写笔记都会放在这里</div>`;
}

/* ── 对话 ── */
export function chatHead(extra = "") {
  return `
  <div class="vl-chat-h">
    <span class="sess">第 3 章梯度下降答疑<i data-lucide="chevron-down"></i></span>
    <span class="sp"></span>
    ${extra}
    <button class="ib" title="新对话"><i data-lucide="square-pen"></i></button>
  </div>`;
}

export function thread({ maxW = 700, compact = false } = {}) {
  return `
  <div class="vl-thread" style="max-width:${maxW}px;${compact ? "padding:8px 16px 12px" : ""}">
    <div class="msg msg-user"><div class="bubble">视频里和课本里对梯度下降的解释有什么不一样？</div></div>
    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>deepseek-v4-flash<span>·</span><span class="num">10:32</span></div>
      <div class="fold"><i data-lucide="check" class="ok"></i>检索资料<span style="color:var(--ink-3)">· 命中 6 段</span></div>
      <div class="md">
        <p>两者讲的是同一件事，切入角度不同：</p>
        <ol>
          <li><b>课本</b>从方向导数出发，证明负梯度是函数下降最快的方向，并给出学习率过大导致发散的条件<span class="cite">1</span>；</li>
          <li><b>视频</b>把损失函数画成山谷地形，强调「每一步只看脚下的坡度」，并直观演示了小批量带来的抖动<span class="cite">2</span>。</li>
        </ol>
        ${compact ? "" : `<p>课堂录音里老师补充了一点：实际训练中更关心的是<b>鞍点</b>而不是局部极小值<span class="cite">3</span>。</p>`}
      </div>
      <div class="vl-src-line">
        <span class="chip"><i data-lucide="file-text"></i>第 3 章 · p.21</span>
        <span class="chip"><i data-lucide="clapperboard"></i>神经网络是什么 · 07:42</span>
        ${compact ? "" : `<span class="chip"><i data-lucide="audio-lines"></i>周三课堂录音 · 31:05</span>`}
      </div>
    </div>
    <div class="msg msg-user"><div class="bubble">帮我把鞍点这块整理成一张卡片</div></div>
  </div>`;
}

export function hero({ hasRes = false, maxW = 640 } = {}) {
  const sug = ["总结这些资料的核心观点", "列出我可能没弄懂的概念", "按难度给我排一条学习路径"];
  return `
  <div class="vl-hero" style="max-width:${maxW}px">
    <h2>${hasRes ? "从哪里开始？" : "先放点资料进来"}</h2>
    <p>${hasRes ? "回答会引用资料原文，点引用可以跳到对应页码或时间点" : "添加资料后，就可以围绕它们提问、生成大纲和测验"}</p>
    <div class="sug">${sug.map(s => `<span class="chip ${hasRes ? "" : "dis"}">${s}</span>`).join("")}</div>
  </div>`;
}

export function composer({ maxW = 700, compact = false } = {}) {
  return `
  <div class="composer-wrap" ${compact ? 'style="padding:0 12px 12px"' : ""}>
    <div class="composer vl-composer" style="max-width:${maxW}px">
      <textarea rows="${compact ? 1 : 2}" placeholder="向资料提问，⌘ Enter 发送"></textarea>
      <div class="row">
        <button class="ib" title="附件 / @ 引用资料 / MCP"><i data-lucide="plus"></i></button>
        <button class="model" title="工具执行确认"><i data-lucide="shield-check"></i>${compact ? "" : "手动确认"}<i data-lucide="chevron-down"></i></button>
        <span class="sp"></span>
        <button class="model"><b>deepseek-v4-flash</b><i data-lucide="chevron-down"></i></button>
        ${compact ? "" : `<button class="model"><i data-lucide="brain"></i>立答如流<i data-lucide="chevron-down"></i></button>`}
        <button class="send"><i data-lucide="arrow-up"></i></button>
      </div>
    </div>
  </div>`;
}

/* ── 大画面：资料阅读 / 笔记编辑 ── */
export function stageHead(kind, { close = true, extra = "" } = {}) {
  const isNote = kind === "note";
  return `
  <div class="vl-stage-h">
    <span class="ic"><i data-lucide="${isNote ? "list-tree" : "file-text"}"></i></span>
    <span class="t">${isNote ? "第 3 章学习大纲" : "深度学习 · 第 3 章 概率与信息论.pdf"}</span>
    <span class="m">${isNote ? "大纲 · 已保存" : "PDF · 38 页"}</span>
    <span class="sp"></span>
    ${extra}
    <button class="btn"><i data-lucide="message-square-quote"></i>在对话中引用</button>
    ${isNote ? `<button class="ib" title="导出"><i data-lucide="share"></i></button>` : `<button class="ib" title="原文件"><i data-lucide="external-link"></i></button>`}
    <button class="ib" title="更多"><i data-lucide="more-horizontal"></i></button>
    ${close ? `<button class="ib" title="关闭（Esc）"><i data-lucide="x"></i></button>` : ""}
  </div>`;
}

export function stageBody(kind) {
  if (kind === "note")
    return `
    <div class="vl-doc">
      <h1>第 3 章学习大纲</h1>
      <div class="sub">由「学习大纲」基于 3 份资料生成，可直接编辑</div>
      <h2>一、为什么需要概率</h2>
      <ul><li>不确定性的三个来源：系统内在随机性、不完全观测、不完全建模</li><li>频率派概率与贝叶斯概率</li></ul>
      <h2>二、随机变量与分布</h2>
      <ul><li>离散型：概率质量函数 PMF</li><li>连续型：概率密度函数 PDF<span class="caret-line"></span></li></ul>
      <h2>三、信息论</h2>
      <ul><li>自信息与香农熵</li><li>KL 散度：非对称，衡量两个分布的差异</li><li>交叉熵与最大似然的等价关系</li></ul>
    </div>`;
  return `
  <div class="vl-doc">
    <div class="sub">p.21 / 38</div>
    <h2>3.1 为什么要使用概率？</h2>
    <p>计算机科学的许多分支处理的实体大部分都是完全确定且必然的。程序员通常可以安全地假定 CPU 将完美地执行每一条机器指令。然而，机器学习通常必须处理不确定量，有时也可能需要处理随机（非确定性的）量。</p>
    <p><mark>不确定性有三种可能的来源：被建模系统内在的随机性、不完全观测，以及不完全建模。</mark>在很多情况下，使用一些简单而不确定的规则要比复杂而确定的规则更为实用。</p>
    <h2>3.2 随机变量</h2>
    <p>随机变量是可以随机地取不同值的变量。我们通常用无格式字体中的小写字母来表示随机变量本身，而用手写体中的小写字母来表示随机变量能够取到的值。</p>
    <p>就其本身而言，一个随机变量只是对可能的状态的描述；它必须伴随着一个概率分布来指定每个状态的可能性。</p>
  </div>`;
}
