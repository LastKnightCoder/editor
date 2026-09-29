/* PDF 阅读页样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
import { sidebar as pdfSidebar } from "../pdfs/pdfs.js?v=1";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "总览与决策"],
  ["a-reader.html", "方案 A 沉浸阅读"],
  ["b-margin.html", "方案 B 边注"],
  ["c-desk.html", "方案 C 学习台"],
];

/* 进入阅读页收起全局侧栏（同 Notebook / 项目详情），给页面让宽 */
export const sidebar = () => pdfSidebar();

export const COLORS = [
  ["yellow", "黄"],
  ["red", "红"],
  ["green", "绿"],
  ["blue", "蓝"],
  ["purple", "紫"],
];

/* 标注：id → 颜色 / 样式 / 页 / 原文 / 笔记 */
export const ANNS = [
  {
    id: "m1",
    color: "yellow",
    page: 1,
    text: "based solely on attention mechanisms, dispensing with recurrence and convolutions entirely",
    note: "",
  },
  {
    id: "m2",
    color: "green",
    page: 1,
    text: "precludes parallelization within training examples",
    note: "RNN 必须按时间步串行，这是 Transformer 想解决的核心瓶颈——对比 CNN 的 O(log n) 路径长度。",
  },
  {
    id: "m3",
    color: "blue",
    style: "ul",
    page: 2,
    text: 'We call our particular attention "Scaled Dot-Product Attention"',
    note: "",
  },
  {
    id: "m4",
    color: "red",
    page: 2,
    text: "we scale the dot products by 1/√dk",
    note: "为什么要除以 √dk：点积方差随维度增大，softmax 会进入梯度很小的饱和区。",
  },
  {
    id: "a1",
    area: true,
    color: "blue",
    page: 2,
    text: "图 2 · Scaled Dot-Product Attention 结构图",
    note: "",
  },
];
export const annById = id => ANNS.find(a => a.id === id);

const mk = (id, extra = "") => {
  const a = annById(id);
  const cls = [a.color, a.style || "", extra].join(" ");
  const nt = a.note ? `<span class="nt"><i data-lucide="message-square-text"></i></span>` : "";
  return `<mark class="${cls}" data-ann="${id}">${a.text}${nt}</mark>`;
};

/* 纸面：三页《Attention Is All You Need》节选；state 控制选区 / 激活标注 / 搜索命中 / 闪烁 */
export function pagesHTML({
  sel = false,
  active = null,
  hits = false,
  flash = false,
  marquee = null,
  bookmarked = [2],
} = {}) {
  const act = id => (active === id ? "active" : "");
  const hit = (w, cur) => (hits ? `<span class="hit ${cur ? "cur" : ""}">${w}</span>` : w);
  const bm = n =>
    `<span class="bm ${bookmarked.includes(n) ? "on" : ""}" title="${bookmarked.includes(n) ? "移除书签" : "加书签"}"><i data-lucide="bookmark"></i></span>`;
  const selText =
    "The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality";
  return `
  <div class="pages" id="pages" style="position:relative">
    <div class="page" data-page="1">${bm(1)}
      <h1>Attention Is All You Need</h1>
      <div class="authors">Ashish Vaswani · Noam Shazeer · Niki Parmar · Jakob Uszkoreit · Llion Jones · Aidan N. Gomez · Łukasz Kaiser · Illia Polosukhin</div>
      <h2 style="text-align:center">Abstract</h2>
      <p class="abs">The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an ${hit("attention", true)} mechanism. We propose a new simple network architecture, the Transformer, ${mk("m1", act("m1"))}. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.</p>
      <h2>1 Introduction</h2>
      <p>Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation.</p>
      <p>Recurrent models typically factor computation along the symbol positions of the input and output sequences. This inherently sequential nature ${mk("m2", act("m2"))}, which becomes critical at longer sequence lengths, as memory constraints limit batching across examples.</p>
      <p>${hit("Attention")} mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks. ${sel ? `<span class="selx" id="selx">${selText}</span>` : selText} after being trained for as little as twelve hours on eight P100 GPUs.</p>
      <span class="pno">1</span>
    </div>
    <div class="page" data-page="2">${bm(2)}
      <h2>3.2 ${hit("Attention")}</h2>
      <p>An ${hit("attention")} function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values.</p>
      <div class="fig" id="fig">${marquee === "saved" ? `<div class="marquee saved" style="inset:10px 150px"></div>` : ""}${marquee === "drawing" ? `<div class="marquee" id="mq" style="inset:10px 150px"></div>` : ""}</div>
      <div class="cap">Figure 2: (left) Scaled Dot-Product Attention. (right) Multi-Head Attention.</div>
      <h2>3.2.1 Scaled Dot-Product ${hit("Attention")}</h2>
      <p>${mk("m3", act("m3"))} (Figure 2). The input consists of queries and keys of dimension dk, and values of dimension dv. We compute the dot products of the query with all keys, divide each by √dk, and apply a softmax function to obtain the weights on the values.</p>
      <p>While for small values of dk the two mechanisms perform similarly, additive attention outperforms dot product attention without scaling for larger values of dk. We suspect that for large values of dk, the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients. To counteract this effect, <span class="${flash ? "flash" : ""}" id="cited">${mk("m4", act("m4"))}</span>.</p>
      <span class="pno">4</span>
    </div>
    <div class="page" data-page="3">${bm(3)}
      <h2>3.2.2 Multi-Head ${hit("Attention")}</h2>
      <p>Instead of performing a single attention function with dmodel-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to dk, dk and dv dimensions, respectively.</p>
      <p>Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. With a single attention head, averaging inhibits this.</p>
      <div class="fig" style="height:110px"></div>
      <span class="pno">5</span>
    </div>
  </div>`;
}

/* 页边图钉：有笔记的标注在页面右页边内放图钉，悬停浮出笔记卡，点击钉住；A / B 共用 */
export function mountPins(root, { pinned = null, flash = null } = {}) {
  const pages = root.querySelector("#pages");
  if (!pages) return;
  const topOf = el => {
    let t = 0;
    for (let n = el; n && n !== pages; n = n.offsetParent) t += n.offsetTop;
    return t;
  };
  let current = pinned;
  const pop = () => pages.querySelector("#mpop");
  const showPop = (a, top, pinLeft) => {
    pop()?.remove();
    const card = document.createElement("div");
    card.className = "mnote pop";
    card.id = "mpop";
    card.style.setProperty("--c", `var(--hl-${a.color}-solid)`);
    card.innerHTML = `<div class="mn-q">${a.text}</div><div class="mn-body">${a.note}</div><div class="mn-ft"><span class="num">第 ${a.page === 2 ? 4 : 1} 页</span><span class="sp"></span><span>编辑</span><span>删除</span></div>`;
    card.onclick = e => e.stopPropagation();
    pages.appendChild(card);
    card.style.top = `${top - 4}px`;
    card.style.left = `${pinLeft - 262}px`;
  };
  let lastBottom = -Infinity;
  const pins = [];
  ANNS.filter(a => a.note).forEach(a => {
    const mark = pages.querySelector(`mark[data-ann="${a.id}"]`);
    if (!mark) return;
    const page = mark.closest(".page");
    const top = Math.max(topOf(mark) - 1, lastBottom + 4);
    lastBottom = top + 22;
    const left = page.offsetLeft + page.offsetWidth - 38;
    const pin = document.createElement("button");
    pin.className = `mpin ${pinned === a.id ? "on" : ""} ${flash === a.id ? "flash" : ""}`;
    pin.style.setProperty("--c", `var(--hl-${a.color}-solid)`);
    pin.style.top = `${top}px`;
    pin.style.left = `${left}px`;
    pin.title = "悬停查看笔记，点击钉住";
    pin.innerHTML = `<i data-lucide="message-square-text"></i>`;
    pin.onmouseenter = () => {
      if (!current) showPop(a, top, left);
    };
    pin.onmouseleave = () => {
      if (!current) pop()?.remove();
    };
    pin.onclick = e => {
      e.stopPropagation();
      current = current === a.id ? null : a.id;
      pins.forEach(p => p.classList.toggle("on", p === pin && !!current));
      current ? showPop(a, top, left) : pop()?.remove();
    };
    pages.appendChild(pin);
    pins.push(pin);
    if (pinned === a.id) showPop(a, top, left);
  });
  pages.addEventListener("click", () => {
    if (!current) return;
    current = null;
    pins.forEach(p => p.classList.remove("on"));
    pop()?.remove();
  });
  icons();
}

/* 浮动工具条：mode = selection（新选区）/ annotation（点已有标注）/ area（框选） */
export function floatToolbar(mode, { color = "yellow", style = "hl" } = {}) {
  const sw = COLORS.map(
    ([c, l]) =>
      `<button class="sw ${mode === "annotation" && c === color ? "on" : ""}" data-color="${c}" title="${mode === "selection" ? "高亮 · " : ""}${l}" style="background:var(--hl-${c}-solid)">${mode === "annotation" && c === color ? '<i data-lucide="check"></i>' : ""}</button>`
  ).join("");
  if (mode === "area")
    return `<div class="ftb" id="ftb">
      <button class="tb" data-act="save-area"><i data-lucide="square-dashed"></i>存为区域标注</button>
      <button class="tb ai" data-act="ask"><i data-lucide="sparkles"></i>问 AI</button>
      <button class="tb" data-act="copy"><i data-lucide="image"></i>复制图片</button>
    </div>`;
  const styleBtn = `<button class="tb ${style === "ul" ? "on" : ""}" data-act="style" title="高亮 / 下划线"><i data-lucide="${style === "ul" ? "underline" : "highlighter"}"></i></button>`;
  const common = `<span class="div"></span>
      <button class="tb" data-act="note"><i data-lucide="message-square-plus"></i>${mode === "annotation" ? "笔记" : "写笔记"}</button>
      <button class="tb ai" data-act="ask"><i data-lucide="sparkles"></i>问 AI</button>
      <button class="tb" data-act="copy" title="复制原文"><i data-lucide="copy"></i></button>`;
  return `<div class="ftb" id="ftb">${sw}${styleBtn}${common}${mode === "annotation" ? `<span class="div"></span><button class="tb danger" data-act="delete" title="删除标注"><i data-lucide="trash-2"></i></button>` : ""}</div>`;
}

export function noteCard(ann, { typed = false } = {}) {
  const text = ann.note || (typed ? "RNN 按时间步串行计算，无法在一个样本内部并行" : "");
  return `<div class="note-card" id="note">
    <div class="q" style="border-left-color:var(--hl-${ann.color}-solid)">${ann.text}</div>
    <div class="ed">${text ? `${text}<span class="caret"></span>` : `<span class="ph">写下你的想法…（支持 Markdown）</span>`}</div>
    <div class="ft"><span>第 ${ann.page === 2 ? 4 : 1} 页</span><span class="sp"></span><span class="kbd-k">Esc</span>取消<button class="btn primary" style="height:26px;padding:0 10px;margin-left:6px">保存 <span style="opacity:.75;font-size:11px">⌘↵</span></button></div>
  </div>`;
}

/* 把浮层定位到目标元素上方 / 下方（在 #pages 坐标系里，随纸面滚动） */
export function place(el, target, { below = false, gap = 8 } = {}) {
  if (!el || !target) return;
  let top = 0;
  let left = 0;
  let n = target;
  const pages = document.getElementById("pages");
  while (n && n !== pages) {
    top += n.offsetTop;
    left += n.offsetLeft;
    n = n.offsetParent;
  }
  const t = below ? top + target.offsetHeight + gap : top - el.offsetHeight - gap;
  const l = Math.max(8, Math.min(left, pages.offsetWidth - el.offsetWidth - 8));
  el.style.top = `${t}px`;
  el.style.left = `${l}px`;
}

/* ── 左侧面板 ── */
export const LEFT_TABS = [
  ["toc", "目录"],
  ["thumbs", "页面"],
  ["anns", "标注"],
  ["marks", "书签"],
];
const TOC = [
  ["Abstract", 1],
  ["1 Introduction", 1],
  ["2 Background", 2],
  ["3 Model Architecture", 2],
  ["3.1 Encoder and Decoder Stacks", 3, 2],
  ["3.2 Attention", 4, 2],
  ["3.3 Position-wise Feed-Forward", 5, 2],
  ["4 Why Self-Attention", 6],
  ["5 Training", 7],
  ["6 Results", 8],
  ["7 Conclusion", 10],
];

export function leftPanel(tab, { annFilter = "all", activeAnn = null, off = false } = {}) {
  let body = "";
  if (tab === "toc")
    body = TOC.map(
      ([t, p, l]) =>
        `<div class="toc-i ${l ? "l2" : ""} ${t === "3.2 Attention" ? "on" : ""}" data-goto="${p}"><span class="t">${t}</span><span class="n num">${p}</span></div>`
    ).join("");
  if (tab === "thumbs")
    body = `<div class="thumbs">${Array.from({ length: 10 }, (_, i) => `<div class="thumb-i ${i === 3 ? "on" : ""}"><div class="pg"><i class="h"></i><i></i><i></i><i class="${i === 0 || i === 3 ? "m" : ""}"></i><i></i><i></i><i></i></div>${i + 1}${[1, 3].includes(i) ? ' <i data-lucide="bookmark" style="width:10px;height:10px;vertical-align:-1px;color:var(--accent)"></i>' : ""}</div>`).join("")}</div>`;
  if (tab === "anns") {
    const list = ANNS.filter(
      a => annFilter === "all" || (annFilter === "notes" ? a.note : a.color === annFilter)
    );
    body = `<div class="ann-filter">
        <span class="chip ${annFilter === "all" ? "on" : ""}" data-af="all" style="height:22px;font-size:11.5px">全部 <span class="num" style="opacity:.6">${ANNS.length}</span></span>
        <span class="chip ${annFilter === "notes" ? "on" : ""}" data-af="notes" style="height:22px;font-size:11.5px">有笔记</span>
        <span class="sp"></span>
        ${COLORS.map(([c]) => `<span class="dot ${annFilter === c ? "on" : ""}" data-af="${c}" style="background:var(--hl-${c}-solid)"></span>`).join("")}
      </div>
      ${
        list
          .map(
            a => `<div class="ann-i ${activeAnn === a.id ? "on" : ""}" data-jump="${a.id}">
          ${a.area ? `<div class="area-thumb"></div><div class="meta">区域 · ${a.text}</div>` : `<div class="q" style="--c:var(--hl-${a.color}-solid)">${a.text}</div>`}
          ${a.note ? `<div class="note"><i data-lucide="message-square-text"></i><span>${a.note}</span></div>` : ""}
          <div class="meta num">第 ${a.page === 2 ? 4 : 1} 页${a.style === "ul" ? " · 下划线" : ""}</div></div>`
          )
          .join("") || `<div class="empty-t">没有符合条件的标注</div>`
      }
      <div class="empty-t" style="padding:14px 8px">选中文字即可高亮或写笔记<br />按住 <span class="kbd-k">Alt</span> 拖动可框选区域</div>`;
  }
  if (tab === "marks")
    body =
      [
        ["第 2 页", "2 Background", "9 月 20 日"],
        ["第 4 页", "3.2 Attention", "今天"],
      ]
        .map(
          ([p, t, d]) =>
            `<div class="toc-i"><i data-lucide="bookmark" style="width:13px;height:13px;color:var(--accent);flex:none;align-self:center"></i><span class="t">${t}</span><span class="n">${p}</span></div>`
        )
        .join("") +
      `<div class="empty-t" style="padding:14px 8px">悬停页面右上角点书签图标，或按 <span class="kbd-k">B</span></div>`;
  return `<aside class="lp ${off ? "off" : ""}" id="lp">
    <div class="seg">${LEFT_TABS.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-lt="${k}">${l}</button>`).join("")}</div>
    <div class="body">${body}</div>
  </aside>`;
}

/* ── 底部 HUD ── */
export function hud({ page = 4, total = 15, zoom = "适宽", menu = false, chatOff = false } = {}) {
  return `<div class="hud" id="hud">
    <button class="ib" title="上一页 ←"><i data-lucide="chevron-up"></i></button>
    <span class="pg"><b class="num">${page}</b><span class="num">/ ${total}</span></span>
    <button class="ib" title="下一页 →"><i data-lucide="chevron-down"></i></button>
    <span class="div"></span>
    <button class="ib" title="缩小 ⌘-"><i data-lucide="minus"></i></button>
    <span class="zm num" title="点击切换 适宽 / 适页 / 100%">${zoom}</span>
    <button class="ib" title="放大 ⌘+"><i data-lucide="plus"></i></button>
    <span class="div"></span>
    <button class="ib" title="查找 ⌘F" data-act="find"><i data-lucide="search"></i></button>
    <div class="dd" style="position:relative"><button class="ib ${menu ? "on" : ""}" title="更多" data-act="more"><i data-lucide="more-horizontal"></i></button>${
      menu
        ? `<div class="menu" style="min-width:190px">
        <div class="mi">双页显示<span class="kbd-k">D</span></div>
        <div class="mi">向右旋转<span class="kbd-k">R</span></div>
        <div class="mi">夜间页面（反色）</div>
        <div class="mi">全屏阅读<span class="kbd-k">F11</span></div>
        <div class="mi">在文件夹中显示</div>
        <div class="mi">重建 AI 索引</div>
      </div>`
        : ""
    }</div>
    ${chatOff ? `<span class="div"></span><button class="ib" title="打开对话" data-act="chat" style="color:var(--accent-text)"><i data-lucide="message-circle"></i></button>` : ""}
  </div>`;
}

/* ── 查找条：关键词 / 按意思（AI 索引） ── */
export function findBar(mode = "kw") {
  const res =
    mode === "kw"
      ? `<div class="res">
        <div><span class="p num">第 1 页</span>…through an <b>attention</b> mechanism. We propose…</div>
        <div><span class="p num">第 1 页</span><b>Attention</b> mechanisms have become an integral…</div>
        <div><span class="p num">第 4 页</span>3.2 <b>Attention</b> · An attention function can be…</div>
        <div><span class="p num">第 5 页</span>3.2.2 Multi-Head <b>Attention</b></div>
      </div>`
      : `<div class="res">
        <div><span class="p num">第 4 页 · 0.82</span>…the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients…</div>
        <div><span class="p num">第 6 页 · 0.71</span>…self-attention layers are faster than recurrent layers when the sequence length n is smaller than…</div>
      </div>`;
  return `<div class="find" id="find">
    <div class="row">
      <div class="inp"><i data-lucide="search"></i>${mode === "kw" ? "attention" : "为什么要缩放点积"}<span class="sp"></span><span class="cnt num">${mode === "kw" ? "1 / 23" : ""}</span></div>
      <button class="ib" title="上一个 ⇧↵"><i data-lucide="chevron-up"></i></button>
      <button class="ib" title="下一个 ↵"><i data-lucide="chevron-down"></i></button>
      <button class="ib" title="关闭 Esc" data-act="find-close"><i data-lucide="x"></i></button>
    </div>
    <div class="mode">
      <span class="chip ${mode === "kw" ? "on" : ""}" data-fm="kw" style="height:22px;font-size:11.5px">关键词</span>
      <span class="chip ${mode === "sem" ? "on" : ""}" data-fm="sem" style="height:22px;font-size:11.5px"><i data-lucide="sparkles" style="width:12px;height:12px"></i>按意思找</span>
    </div>
    ${res}
  </div>`;
}

/* ── 对话栏（PDF 专属会话） ── */
export function chatPanel({
  quote = null,
  typed = false,
  indexing = false,
  empty = false,
  head = true,
} = {}) {
  const banner = indexing
    ? `<div class="idx-banner"><div style="display:flex;gap:6px;align-items:center"><i data-lucide="loader" style="width:14px;height:14px"></i>正在建立 AI 索引 · 向量化 38 / 61 段<span class="sp"></span><span class="num" style="color:var(--ink-3)">62%</span></div><div class="bar"><i style="width:62%"></i></div><div style="margin-top:6px;font-size:11.5px;color:var(--ink-3)">完成前也能提问，只是不能按页引用</div></div>`
    : "";
  const thread = empty
    ? `${banner}<div class="st" style="padding:40px 10px"><div class="ic"><i data-lucide="sparkles"></i></div><h2>问问这份 PDF</h2><p>回答会标注出处页码，点页码直接跳到原文。也可以在正文里选中文字后点「问 AI」。</p>
      <div class="quick" style="justify-content:center;margin-top:8px"><span>总结全文</span><span>列出核心贡献</span><span>解释第 4 页的公式</span></div></div>`
    : `${banner}
      <div class="msg msg-user"><div class="bubble"><div class="quote-chip" style="margin:0 0 6px;background:rgba(0,0,0,.04)"><div class="body"><span class="src">第 1 页 · 选区</span>This inherently sequential nature precludes parallelization within training examples</div></div>为什么 RNN 不能并行？Transformer 是怎么解决的？</div></div>
      <div class="msg">
        <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span class="num">10:32</span></div>
        <div class="fold"><i data-lucide="check" class="ok"></i>search_pdf<span style="color:var(--ink-3)">· 命中 4 段</span></div>
        <div class="md">
          <p>RNN 在第 t 步要用到第 t−1 步的隐状态，所以同一个样本内部只能按顺序算<span class="cite" data-cite="1">1</span>，序列一长，显存又限制了跨样本的批量。</p>
          <p>Transformer 去掉了循环，用自注意力让任意两个位置直接交互：每层的计算是一次矩阵乘法，整条序列可以同时算<span class="cite" data-cite="4">4</span>。为避免维度大时 softmax 饱和，点积要除以 √dk<span class="cite" data-cite="4b">4</span>。</p>
        </div>
      </div>`;
  const q = quote
    ? `<div class="quote-chip"><div class="body"><span class="src">${quote.src}</span>${quote.text}</div><button class="ib" title="移除"><i data-lucide="x"></i></button></div>
       <div class="quick"><span>解释</span><span>翻译</span><span>举个例子</span><span>找相关段落</span></div>`
    : "";
  return `<aside class="rp" id="rp">
    ${
      head
        ? `<div class="rp-head"><span class="t">AI 对话</span><span class="s">· 这份 PDF</span><span class="sp"></span>
      <button class="ib" title="历史对话"><i data-lucide="history"></i></button>
      <button class="ib" title="新对话"><i data-lucide="square-pen"></i></button>
      <button class="ib" title="收起 ⌘J" data-act="chat"><i data-lucide="panel-right-close"></i></button></div>`
        : ""
    }
    <div class="rp-body">${thread}</div>
    <div class="rp-foot">${q}
      <div class="cmp ${quote ? "focus" : ""}"><div class="ta ${typed ? "typed" : ""}">${typed ? "为什么要除以 √dk 而不是 dk？" : quote ? "针对引用提问…" : "问这份 PDF，Enter 发送"}</div>
        <div class="row"><button class="ib" style="width:26px;height:26px"><i data-lucide="paperclip"></i></button><span>Claude Sonnet 5</span><span class="sp"></span><span class="send"><i data-lucide="arrow-up"></i></span></div></div>
    </div>
  </aside>`;
}

export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>PDF 阅读 · 样板间</b>
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
  document.body.classList.add("no-anno", "no-note");
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
