/* 视频笔记样板间 · 共享渲染（控制条 / 外壳 / 播放器 / 转录 / 笔记 / 对话） */
import { sidebar as baseSidebar, titlebar, icons } from "../chat/shared.js?v=3";
import {
  VIDEO,
  CHAPTERS,
  SUMMARY,
  SEGMENTS,
  NOW_INDEX,
  QUOTED_INDEX,
  MARKS,
  NOTES,
  TREE,
  fmt,
} from "./vn-data.js";
export { icons, fmt, VIDEO, CHAPTERS, SEGMENTS, NOW_INDEX };

const PLANS = [
  ["index.html", "总览"],
  ["a-theater.html", "A 剧场"],
  ["b-transcript.html", "B 文稿"],
  ["c-notebook.html", "C 笔记本"],
];

/* 模拟窗口：宽度 + 项目文档树是否展开 */
export const view = {
  width: +(localStorage.getItem("chat-mock-width") || 1440),
  tree: localStorage.getItem("vn-mock-tree") !== "0",
};

/* 条目区宽度 = 窗口 − 全局侧栏 218 − 纸外边距 22 − 文档树 252 */
export const itemWidth = tree => view.width - 218 - 22 - (tree ? 252 : 0);

/* 文档树展开但条目区放不下时自动收起（一次性提示，可再展开） */
export function frameLayout(minItem) {
  const collapsed = view.tree && itemWidth(true) < minItem;
  const tree = view.tree && !collapsed;
  return { tree, collapsed, w: itemWidth(tree) };
}

/* ── 控制条 + 挂载 ── */
export function mount(file, states, render) {
  const win = document.getElementById("win");
  let state = states[0][0];
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>视频笔记 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === file ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${states.map(([k, l]) => `<button class="mb-btn" data-s="${k}">${l}</button>`).join("")}
    <label><input type="checkbox" id="mb-tree" ${view.tree ? "checked" : ""} /> 文档树</label>
    <label>窗口宽 <select id="mb-width">${[1280, 1440, 1680, 1920].map(w => `<option ${w === view.width ? "selected" : ""}>${w}</option>`).join("")}</select></label>
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

  const fit = () => {
    if (window.innerWidth < 100) return;
    const note = document.body.classList.contains("no-note")
      ? 0
      : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18;
    const z = Math.min(
      1,
      (window.innerWidth - 24) / view.width,
      Math.max(0.35, (window.innerHeight - bar.offsetHeight - note - 24) / 820)
    );
    win.style.width = view.width + "px";
    win.style.zoom = z;
  };
  const draw = () => {
    win.innerHTML = render(state);
    icons();
    fit();
    autoScroll(win);
    bar
      .querySelectorAll("[data-s]")
      .forEach(b => (b.style.borderColor = b.dataset.s === state ? "#e8b598" : ""));
  };
  bar
    .querySelectorAll("[data-s]")
    .forEach(b => (b.onclick = () => ((state = b.dataset.s), draw())));
  bar.querySelector("#mb-note").onclick = () => (document.body.classList.toggle("no-note"), fit());
  bar.querySelector("#mb-tree").onchange = e => {
    view.tree = e.target.checked;
    localStorage.setItem("vn-mock-tree", view.tree ? "1" : "0");
    draw();
  };
  bar.querySelector("#mb-width").onchange = e => {
    view.width = +e.target.value;
    localStorage.setItem("chat-mock-width", e.target.value);
    draw();
  };
  window.addEventListener("resize", fit);
  draw();
}

/* 当前句 / 选区滚到所在滚动区的上三分之一 */
function autoScroll(root) {
  root.querySelectorAll("[data-scroll-to]").forEach(el => {
    const box = el.closest(".vn-scroll");
    if (!box) return;
    let top = 0;
    for (let n = el; n && n !== box; n = n.offsetParent) top += n.offsetTop;
    box.scrollTop = Math.max(0, top - box.clientHeight * +(el.dataset.scrollTo || 0.33));
  });
}

/* ── 外壳：全局侧栏 + 标题栏 + 一整张纸（文档树 + 条目） ── */
const crumb = `<button class="ib on" title="文档树（自动收起时可再展开）"><i data-lucide="panel-left"></i></button><span>项目</span><i data-lucide="chevron-right" style="width:13px;color:var(--ink-3)"></i><span>深度学习入门</span><i data-lucide="chevron-right" style="width:13px;color:var(--ink-3)"></i><b>反向传播到底在做什么</b>`;

export function shell(layout, itemHTML) {
  const sb = baseSidebar().replace(
    '<div class="sb-item " title="项目">',
    '<div class="sb-item on" title="项目">'
  );
  const c = layout.tree ? crumb : crumb.replace('class="ib on"', 'class="ib"');
  return `
    ${sb}
    <div class="col">
      ${titlebar(c)}
      <div class="main"><section class="paper vn-paper">
        ${layout.tree ? treeCol() : ""}
        <div class="vn-item">${layout.collapsed ? toast() : ""}${itemHTML}</div>
      </section></div>
    </div>`;
}

function treeCol() {
  return `<div class="vn-tree">${TREE.map(n => `<div class="n ${n.folder ? "f" : ""} ${n.on ? "on" : ""} ${n.lv ? "lv1" : ""}"><i data-lucide="${n.ic}"></i><span>${n.t}</span></div>`).join("")}</div>`;
}

const toast = () =>
  `<div class="vn-toast"><i data-lucide="panel-left-close" style="width:14px"></i>窗口较窄，已收起文档树<button>展开</button></div>`;

/* 条目头：标题 + 来源 · 时长 · 转录状态，右侧开关 */
export function head({ state = "ok", right = "" } = {}) {
  const st = state === "none" ? "未转录" : state === "busy" ? "转录中 42%" : "已转录";
  return `
  <div class="vn-head">
    <i data-lucide="clapperboard"></i>
    <span class="t">${VIDEO.title}</span>
    <span class="m">${VIDEO.source} · ${fmt(VIDEO.dur)} · ${st}</span>
    <span class="sp"></span>
    ${right}
    <button class="ib" title="更多：指定语言重新转录 / AI 优化断句 / 挂载字幕 / AI 导出电子书"><i data-lucide="more-horizontal"></i></button>
  </div>`;
}

export const toggle = (ic, label, on, kb = "") =>
  `<button class="ib ${on ? "on" : ""}" title="${label}${kb ? `（${kb}）` : ""}"><i data-lucide="${ic}"></i></button>`;

/* ── 演示画面：三层网络 + 手写「2」 ── */
function net({ formula = false } = {}) {
  if (formula)
    return `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#14161c"/>
      <text x="160" y="70" fill="#e9e4d8" font-size="17" text-anchor="middle" font-family="serif" font-style="italic">∂C/∂w = ∂z/∂w · ∂a/∂z · ∂C/∂a</text>
      <text x="160" y="104" fill="#f2b38e" font-size="11" text-anchor="middle" font-family="sans-serif">a(L−1) · σ′(z) · 2(a − y)</text>
      <line x1="70" y1="82" x2="250" y2="82" stroke="#3a3f4b"/></svg>`;
  const lx = [62, 160, 258];
  const ys = n => Array.from({ length: n }, (_, i) => 18 + (i * 144) / (n - 1));
  const layers = [ys(8), ys(6), ys(10)];
  const lit = (l, i) => (l === 2 ? (i === 2 ? 1 : 0.12) : ((i * 37 + l * 11) % 10) / 10);
  let s = `<svg viewBox="0 0 320 180"><rect width="320" height="180" fill="#14161c"/>`;
  for (let l = 0; l < 2; l++)
    layers[l].forEach((y1, i) =>
      layers[l + 1].forEach((y2, j) => {
        if ((i + j) % 2)
          s += `<line x1="${lx[l]}" y1="${y1}" x2="${lx[l + 1]}" y2="${y2}" stroke="${l === 1 && j === 2 ? "#f2b38e" : "#3a3f4b"}" stroke-width="${l === 1 && j === 2 ? 0.9 : 0.5}" opacity="${l === 1 && j === 2 ? 0.8 : 0.6}"/>`;
      })
    );
  layers.forEach((col, l) =>
    col.forEach(
      (y, i) =>
        (s += `<circle cx="${lx[l]}" cy="${y}" r="${l === 2 ? 5.5 : 6}" fill="rgba(255,255,255,${lit(l, i)})" stroke="#8b91a0" stroke-width="0.7"/>`)
    )
  );
  layers[2].forEach(
    (y, i) =>
      (s += `<text x="${lx[2] + 12}" y="${y + 3.5}" fill="${i === 2 ? "#f2b38e" : "#6b7180"}" font-size="9" font-family="monospace">${i}</text>`)
  );
  s += `<rect x="8" y="62" width="34" height="34" rx="3" fill="#000" stroke="#3a3f4b"/><text x="25" y="88" fill="#fff" font-size="26" text-anchor="middle" font-family="cursive">2</text>`;
  return s + `</svg>`;
}
export const frameSvg = net;

/* ── 播放器：画面 + 纸色底栏；进度条按章节分段，笔记刻度钉在底栏上沿 ── */
const pct = t => (t / VIDEO.dur) * 100;
const curChapter = () => CHAPTERS.filter(c => c.t <= VIDEO.now).length - 1;

function seek() {
  const bounds = [...CHAPTERS.map(c => c.t), VIDEO.dur];
  return `<div class="vn-seek">${CHAPTERS.map((c, i) => {
    const a = bounds[i],
      b = bounds[i + 1];
    const cls = b <= VIDEO.now ? "done" : a < VIDEO.now ? "part" : "";
    const p = cls === "part" ? `--p:${((VIDEO.now - a) / (b - a)) * 100}%;` : "";
    return `<i class="seg ${cls}" style="left:calc(${pct(a)}% + ${i ? 1 : 0}px);width:calc(${pct(b - a)}% - ${i ? 1 : 0}px);${p}" title="${c.title}"></i>`;
  }).join("")}<i class="knob" style="left:${pct(VIDEO.now)}%"></i></div>`;
}

function marks(showIndex = -1) {
  const ic = { ts: "clock-3", shot: "camera", quote: "quote" };
  return MARKS.map(
    (m, i) => `
    <span class="vn-mark ${m.kind} ${i === showIndex ? "show" : ""}" style="left:${pct(m.t)}%">
      <span class="tip"><b>${fmt(m.t)}</b>${m.label}<span class="src"><i data-lucide="${ic[m.kind]}" style="width:11px;height:11px;vertical-align:-1px"></i> 反向传播笔记 · 点击跳到这里</span></span>
    </span>`
  ).join("");
}

export function player({ sub = true, showMark = -1, frame = "net" } = {}) {
  return `
  <div class="vn-player">
    <div class="vn-frame">${net({ formula: frame === "formula" })}${sub ? `<span class="sub">${SEGMENTS[NOW_INDEX].text}</span>` : ""}</div>
    <div class="vn-bar">
      ${seek()}${marks(showMark)}
      <button class="play" title="播放 / 暂停（空格）"><i data-lucide="pause"></i></button>
      <span class="tc num">${fmt(VIDEO.now)} <em>/ ${fmt(VIDEO.dur)}</em></span>
      <span class="chap">${CHAPTERS[curChapter()].title}</span><span class="sp2"></span>
      <button class="rate">1.25×</button>
      <button class="ib opt" title="字幕"><i data-lucide="captions"></i></button>
      <button class="ib opt" title="音量"><i data-lucide="volume-2"></i></button>
      <button class="ib opt" title="画中画"><i data-lucide="picture-in-picture-2"></i></button>
      <button class="ib" title="全屏"><i data-lucide="maximize"></i></button>
    </div>
  </div>`;
}

export function mini() {
  return `
  <div class="vn-mini">
    <span class="th">${net()}</span>
    <button class="ib" title="播放 / 暂停"><i data-lucide="pause"></i></button>
    <div class="tx"><div>${CHAPTERS[curChapter()].title}</div><div class="s num">${fmt(VIDEO.now)} / ${fmt(VIDEO.dur)} · 1.25×</div></div>
    <button class="ib" title="回到大画面"><i data-lucide="maximize-2"></i></button>
    <span class="line"><i style="width:${pct(VIDEO.now)}%"></i></span>
  </div>`;
}

export function pill() {
  return `
  <div class="vn-pill">
    <button class="play"><i data-lucide="pause"></i></button>
    <span class="num" style="font-family:var(--mono)">${fmt(VIDEO.now)}</span>
    <span style="color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${CHAPTERS[curChapter()].title}</span>
    <button class="ib" title="展开画面"><i data-lucide="maximize-2"></i></button>
  </div>`;
}

/* ── 转录 ── */
export const selPop = () => `
  <span class="vn-pop">
    <button class="pri"><i data-lucide="notebook-pen"></i>摘到笔记<span class="k">⌘⇧E</span></button>
    <button><i data-lucide="sparkles"></i>问 AI</button>
    <i class="dv"></i>
    <button title="从这句播放"><i data-lucide="play"></i></button>
    <button title="复制"><i data-lucide="copy"></i></button>
  </span>`;

export function transcriptList({ sel = -1 } = {}) {
  let ch = -1,
    out = "";
  SEGMENTS.forEach((s, i) => {
    if (s.ch !== ch) {
      ch = s.ch;
      out += `<div class="vn-ch"><span class="tm">${fmt(CHAPTERS[ch].t)}</span>${CHAPTERS[ch].title}</div>`;
    }
    const on = i === NOW_INDEX;
    let text = s.text;
    if (i === QUOTED_INDEX)
      text = `<span class="q">${text}</span><span class="qi" title="已摘到「反向传播笔记」"><i data-lucide="notebook-pen"></i></span>`;
    if (i === sel)
      text = `<span class="vn-sel">${text.slice(0, 22)}${selPop()}</span>${text.slice(22)}`;
    out += `<div class="vn-seg ${on ? "on" : ""}" ${on || i === sel ? 'data-scroll-to="0.3"' : ""}><span class="tm num">${fmt(s.t)}</span><span>${text}</span></div>`;
  });
  return `<div class="vn-tr">${out}</div>`;
}

/* B：转录排成文章——按章节成节、句子连成段落，时间在左页边，已摘录处在右页边留标记 */
const PARAS = [
  [0, [[0, 1, 2]]],
  [1, [[3, 4]]],
  [
    2,
    [
      [5, 6],
      [7, 8, 9],
      [10, 11],
    ],
  ],
  [3, [[12, 13]]],
];

export function article({ sel = -1 } = {}) {
  return PARAS.map(
    ([ch, paras]) => `
    <h2><span class="tm num">${fmt(CHAPTERS[ch].t)}</span>${CHAPTERS[ch].title}</h2>
    ${SUMMARY[ch] ? `<div class="sum"><i data-lucide="sparkles"></i><span>${SUMMARY[ch]}</span></div>` : ""}
    ${paras
      .map(
        ids =>
          `<p><span class="tm num">${fmt(SEGMENTS[ids[0]].t)}</span>${ids
            .map(i => {
              const s = SEGMENTS[i];
              if (i === sel)
                return `<span class="s vn-sel" data-scroll-to="0.45">${s.text.slice(0, 21)}${selPop()}</span><span class="s">${s.text.slice(21)}</span>`;
              const cls = i === NOW_INDEX ? "on" : i === QUOTED_INDEX ? "q" : "";
              return `<span class="s ${cls}" ${i === NOW_INDEX && sel < 0 ? 'data-scroll-to="0.35"' : ""}>${s.text}</span>`;
            })
            .join(
              ""
            )}${ids.includes(QUOTED_INDEX) ? `<span class="pin" title="已摘到「反向传播笔记」"><i data-lucide="notebook-pen"></i></span>` : ""}</p>`
      )
      .join("")}`
  ).join("");
}

/* ── 笔记 ── */
export function notesHead({ compact = false } = {}) {
  return `
  <div class="vn-nhead">
    ${NOTES.map((n, i) => `<button class="vn-tab ${i === 0 ? "on" : ""}">${n.title}</button>`).join("")}
    <button class="vn-tab add" title="新建笔记"><i data-lucide="plus"></i></button>
    <span class="sp"></span>
    <button class="tool" title="插入当前时间戳"><i data-lucide="clock-3"></i><span class="lb">时间戳</span><span class="k">⌘⇧T</span></button>
    <button class="tool" title="截取当前帧"><i data-lucide="camera"></i><span class="lb">截帧</span><span class="k">⌘⇧S</span></button>
    ${compact ? "" : `<button class="ib" title="笔记操作：重命名 / 删除"><i data-lucide="more-horizontal"></i></button>`}
  </div>`;
}

/* ruler：块以时间戳开头时，时间移到页边刻度（C） */
export function noteDoc({ ruler = false, typing = true } = {}) {
  const ts = t => `<span class="ts"><i data-lucide="play"></i>${fmt(t)}</span>`;
  const blk = (t, html, now = false) =>
    ruler
      ? `<div class="rb ${now ? "now" : ""}"><span class="rt"><i data-lucide="play"></i>${fmt(t)}</span>${html}</div>`
      : html.replace(/^<(p|blockquote)>/, `<$1>${ts(t)}`);
  return `
  <div class="vn-doc ${ruler ? "ruler" : ""}">
    <h1>反向传播笔记</h1>
    <h3>核心直觉</h3>
    ${blk(268, `<p>梯度下降就是沿着<b>负梯度</b>方向走；梯度每一项的大小 = 代价对这个参数有多敏感。</p>`)}
    ${blk(462, `<p>让一个神经元变亮，只有三条路：</p>`, true)}
    <ul><li>加偏置 b</li><li>加权重 w——效果和上一层那个神经元<b>有多亮</b>成正比</li><li>改上一层的激活值 a（这一步就是「往回传」）</li></ul>
    ${blk(504, `<blockquote>把所有输出神经元的期望加在一起，就得到了我们对倒数第二层的「期望改变」。</blockquote>`)}
    <h3>链式法则</h3>
    ${blk(772, `<div class="shot"><div class="vn-frame">${net({ formula: true })}</div>${ruler ? "" : `<span class="ts"><i data-lucide="camera"></i>${fmt(772)}</span>`}</div>`)}
    <p>${typing ? `疑问：为什么是把期望<b>加总</b>，而不是取平均？<span class="caret"></span>` : `<span class="ph">边看边记…</span>`}</p>
  </div>`;
}

/* ── 对话：跟视频走的会话；引用转录句子带时间，点击跳播 ── */
export function chatThread() {
  return `
  <div class="thread-inner" style="max-width:none">
    <div class="msg msg-user"><div class="bubble">
      <div class="vn-quote"><span class="vn-cite">07:42</span>要让一个神经元的激活值变大，只有三条路：增大偏置、增大权重，或者改变上一层的激活值。</div>
      这三条路在实际训练里哪条影响最大？
    </div></div>
    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span class="num">10:32</span></div>
      <div class="md">
        <p>三条路不是挑一条走，而是<b>同时</b>按各自的敏感度调整：梯度里每一项的大小，就是那条路的「性价比」<span class="vn-cite">04:36</span>。</p>
        <p>视频里有个关键点：加权重的效果和上一层神经元有多亮成正比 <span class="vn-cite">07:56</span>——所以越亮的连接，权重改得越多。</p>
        <p>第三条路不能直接改，只能把「期望改变」传给上一层，这就是反向传播<span class="vn-cite">09:34</span>。</p>
      </div>
      <div class="msg-actions show">
        <button class="ib" title="复制"><i data-lucide="copy"></i></button>
        <button class="ib" title="插入到笔记"><i data-lucide="notebook-pen"></i></button>
        <button class="ib" title="重新生成"><i data-lucide="refresh-cw"></i></button>
      </div>
    </div>
  </div>`;
}

export function chatComposer() {
  return `
  <div class="composer-wrap" style="padding:0 12px 12px">
    <div class="composer">
      <textarea rows="1" placeholder="问问这个视频…（划选转录可带上原句）"></textarea>
      <div class="row">
        <button class="ib" title="@ 引用"><i data-lucide="at-sign"></i></button>
        <button class="model">Sonnet 5<i data-lucide="chevron-down"></i></button>
        <span class="sp"></span>
        <span class="ring" title="上下文 22%"></span>
        <button class="send"><i data-lucide="arrow-up"></i></button>
      </div>
    </div>
  </div>`;
}

export function chatCol({ closable = true, header = true } = {}) {
  return `
    ${
      header
        ? `<div class="vn-sec"><b>对话</b><span>· 基于本视频</span><span class="sp"></span>
      <button class="ib" title="新会话"><i data-lucide="square-pen"></i></button>
      ${closable ? `<button class="ib" title="收起（⌘J）"><i data-lucide="x"></i></button>` : ""}
    </div>`
        : ""
    }
    <div class="vn-scroll vn-chat thread">${chatThread()}</div>
    ${chatComposer()}`;
}

/* ── 空态 / 转录中 ── */
export function trEmpty() {
  return `
  <div class="vn-empty">
    <i data-lucide="captions"></i>
    <div>还没有转录。转录后能跟着字幕读、划句子摘到笔记，<br />也能让 AI 基于视频内容回答</div>
    <button class="btn primary">开始转录</button>
    <div class="s">有平台字幕时直接读取；否则自动识别语言，指定语言在右上角 ⋯</div>
  </div>`;
}

export function trBusy() {
  return `
  <div class="vn-empty">
    <i data-lucide="audio-lines"></i>
    <div>正在识别语音 · 42%</div>
    <span class="vn-prog"><i style="width:42%"></i></span>
    <div class="s">可以先开始记笔记，时间戳和截帧不依赖转录</div>
    <button class="btn" style="height:26px">取消</button>
  </div>`;
}
