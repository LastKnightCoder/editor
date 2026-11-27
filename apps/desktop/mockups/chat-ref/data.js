/* 聊天引用样板间 · 演示数据与公共片段 */
import { sidebar, titlebar } from "../chat/shared.js?v=3";

export const SESSION = { title: "SM-2 与 FSRS 复习策略对比", time: "11-12 10:32", turns: 6 };

/* 对话：问答轮次。第 2 轮是正文里被引用的那一轮 */
export const TURNS = [
  {
    ask: "SM-2 里答错一次，为什么后面很久都涨不回来？",
    ans: `<p>因为 SM-2 答错时只把<b>重复次数</b>清零，<b>易度因子 EF 不会回升</b>。EF 每次答错都会被扣，下限 1.3；之后即使连续答对，EF 也只按 +0.1 的步子慢慢回来。</p><p>结果是：一张卡错过两三次，间隔就长期卡在很低的增长率上，这就是常说的 ease hell。</p>`,
  },
  {
    ask: "那 FSRS 是怎么避免这个问题的？",
    ans: `<p>FSRS 不用单一的 EF，而是把记忆拆成两个量：</p><ol><li><b>稳定性 S</b>：记忆能保持多久，答对后按当前 S、D 和检索难度增长；</li><li><b>难度 D</b>：卡片本身有多难，答错只是小幅上调，并且会<b>向均值回归</b>。</li></ol><p><span class="hl" id="hit">关键在于难度会均值回归：一次答错不会让卡片永远被判定为「难」，连续答对几次后 D 会回落，间隔增长随之恢复。</span>这就是它没有 ease hell 的原因。</p>`,
  },
  {
    ask: "切换之后已有卡片的历史评分怎么迁移？",
    ans: `<p>直接用已有复习日志重放：按时间顺序把每一次评分喂给 FSRS 的状态机，得到每张卡当前的 S 与 D，再按目标保留率 0.9 算下一次间隔。</p>`,
  },
];

export function win({
  crumb = "文章",
  title = "间隔重复：我的理解",
  dock = "",
  main = "",
  right = "",
} = {}) {
  return `
  ${sidebar("articles")}
  <div class="col">
    ${titlebar(
      `${crumb} <i data-lucide="chevron-right" style="width:13px"></i><b>${title}</b>`,
      `<button class="ib ${dock ? "on" : ""}" title="AI 对话（Ctrl J）"><i data-lucide="message-circle"></i></button>${right}`
    )}
    <div class="main">${main}${dock}</div>
  </div>`;
}

export function thread(turns, { target = -1, actions = -1, sel = false, backref = -1 } = {}) {
  return turns
    .map(
      (t, i) => `
    <div class="msg msg-user"><div class="bubble">${t.ask}</div></div>
    <div class="msg ${i === target ? "target pulse" : ""}" data-turn="${i}">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span class="num">10:3${2 + i}</span>
        ${i === backref ? `<span class="backref" title="引用了这一轮的正文"><i data-lucide="file-text"></i>被 1 篇引用</span>` : ""}</div>
      <div class="md">${sel && i === 1 ? t.ans.replace('class="hl" id="hit"', 'class="sel" id="hit"') : i === target ? t.ans : t.ans.replace('class="hl" id="hit"', "")}</div>
      <div class="msg-actions ${i === actions ? "show" : ""}">
        <button class="ib" title="复制"><i data-lucide="copy"></i></button>
        <button class="ib ${i === actions ? "on" : ""}" title="引用这一轮" data-quote="${i}"><i data-lucide="quote"></i></button>
        <button class="ib" title="重新生成"><i data-lucide="refresh-cw"></i></button>
        <button class="ib" title="从这里创建分支"><i data-lucide="git-branch"></i></button>
        <button class="ib" title="更多"><i data-lucide="more-horizontal"></i></button>
      </div>
    </div>`
    )
    .join("");
}

export function dockPanel({ inner, top = "" }) {
  return `
  <section class="paper dock">
    <div class="dock-head">
      <div class="dock-title"><span>${SESSION.title}</span><i data-lucide="chevron-down" style="width:14px"></i></div>
      <button class="ib" title="新对话"><i data-lucide="square-pen"></i></button>
      <button class="ib" title="在对话页打开"><i data-lucide="maximize-2"></i></button>
      <button class="ib" title="关闭"><i data-lucide="panel-right-close"></i></button>
    </div>
    ${top}
    <div class="thread"><div class="thread-inner">${inner}</div></div>
    <div class="composer-wrap" style="padding:0 12px 12px"><div class="composer"><textarea rows="1" placeholder="问点什么，@ 引用内容"></textarea>
      <div class="row"><button class="ib"><i data-lucide="paperclip"></i></button><button class="ib"><i data-lucide="at-sign"></i></button><span class="sp"></span><button class="send"><i data-lucide="arrow-up"></i></button></div></div></div>
  </section>`;
}

/* 行内引用 */
export const cref = (label = SESSION.title, turn = "第 2 轮", cls = "") =>
  `<span class="cref ${cls}" data-cref><i data-lucide="message-square-quote"></i>${label}${turn ? `<span class="turn">· ${turn}</span>` : ""}</span>`;

/* 摘录块 */
export const cquote = ({ text, ask = "", stale = false, cls = "" } = {}) => `
  <div class="cquote ${ask ? "qa" : ""} ${stale ? "stale" : ""} ${cls}" data-cquote>
    ${ask ? `<div class="q-ask"><b>问</b>${ask}</div>` : ""}
    <div class="qt">${text}</div>
    <div class="qs"><i data-lucide="message-square-quote"></i><span class="src">${SESSION.title}</span><span>· 第 2 轮 · Claude Sonnet 5 · 11-12</span>
      ${stale ? `<span class="warn"><i data-lucide="alert-triangle"></i>对话已删除，保留摘录文本</span>` : ""}
      <span class="sp"></span>
      <button class="ib" title="在侧栏打开"><i data-lucide="panel-right-open"></i></button>
      <button class="ib" title="转为行内引用"><i data-lucide="minimize-2"></i></button>
      <button class="ib" title="更多"><i data-lucide="more-horizontal"></i></button></div>
  </div>`;

/* 控制条：页面切换 + 场景切换 + 深浅 + 标注；窗口按 1440 排版后整体缩放 */
const PAGES = [
  ["index.html", "设计稿"],
  ["insert.html", "插入引用"],
  ["read.html", "阅读与跳转"],
  ["rename.html", "自定义名称"],
];
export function mockBar(current, scenes, render) {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `<b>聊天引用 · 样板间</b>${PAGES.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="scenes">${scenes.map(([k, n], i) => `<button data-k="${k}" class="${i === 0 ? "on" : ""}">${n}</button>`).join("")}</span>
    <span class="sp"></span>
    <button class="mb-btn" id="mb-theme">切换深浅</button><button class="mb-btn" id="mb-anno">标注</button>`;
  document.body.prepend(bar);
  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem("chat-mock-theme") || "cream";
  bar.querySelector("#mb-theme").onclick = () => {
    root.dataset.theme = root.dataset.theme === "cream" ? "cocoa" : "cream";
    localStorage.setItem("chat-mock-theme", root.dataset.theme);
  };
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  const fit = () => {
    const z = Math.min(
      1,
      (window.innerWidth - 24) / 1440,
      Math.max(0.4, (window.innerHeight - bar.offsetHeight - 120) / 820)
    );
    document.querySelectorAll(".win").forEach(el => {
      el.style.width = "1440px";
      el.style.zoom = z;
    });
  };
  const go = k => {
    bar
      .querySelectorAll(".scenes button")
      .forEach(b => b.classList.toggle("on", b.dataset.k === k));
    location.hash = k;
    render(k);
    window.lucide && window.lucide.createIcons();
    fit();
  };
  bar.querySelectorAll(".scenes button").forEach(b => (b.onclick = () => go(b.dataset.k)));
  window.addEventListener("resize", fit);
  go(scenes.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : scenes[0][0]);
}

export const anno = (n, text, style) =>
  `<div class="anno" data-n="${n}" style="${style}">${text}</div>`;

export const QUOTE_TEXT =
  "关键在于难度会均值回归：一次答错不会让卡片永远被判定为「难」，连续答对几次后 D 会回落，间隔增长随之恢复。";
