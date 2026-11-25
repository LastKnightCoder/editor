/* Agent 修改工具卡样板间 · 共享渲染（视觉参考，非实现源） */

export const PLANS = [
  ["index.html", "总览"],
  ["a-list.html", "A 紧凑清单"],
  ["b-stepper.html", "B 逐条审阅"],
  ["c-summary.html", "C 摘要卡 + 文档内审"],
];

export const ic = (name, extra = "") => `<i data-lucide="${name}" ${extra}></i>`;

export const agent = { name: "校对", init: "校" };
export const av = () =>
  `<span class="av t2" title="${agent.name}">${agent.init}<span class="bot">${ic("sparkles")}</span></span>`;
export const docTitle = "离线优先的笔记同步";
export const doclink = () =>
  `<button class="doclink">${ic("file-text")}<span>${docTitle}</span></button>`;

// 一次修改提案里的条目：ctx 是前后文，del/ins 是词级差异，where 是所在小节
export const EDITS = [
  {
    where: "为什么用 CRDT",
    pre: "传统做法是",
    del: "最后写入者获胜",
    ins: "「最后写入者获胜」（LWW）",
    post: "，两台设备同时改一段话…",
    reason: "首次出现的术语补上通行缩写",
  },
  {
    where: "为什么用 CRDT",
    pre: "Yjs 的文档在长期编辑后会膨胀到正文的 ",
    del: "3 到 5 倍",
    ins: "3–5 倍",
    post: "，需要定期压缩快照",
    reason: "数字区间统一用连接号",
  },
  {
    where: "现有产品怎么做",
    pre: "Logseq 曾尝试基于文件的同步，后来",
    del: "转向数据库版本",
    ins: "转向基于数据库的版本",
    post: "。",
    reason: "补全修饰语，和前半句对仗",
  },
  {
    where: "现有产品怎么做",
    pre: "Notion 的离线模式到 ",
    del: "2025 年",
    ins: "2025 年 8 月",
    post: "才支持整页离线编辑",
    reason: "给出具体月份，和官方更新日志一致",
  },
];

export const diff = (e, { ctx = true } = {}) =>
  `${ctx ? `<span class="ell">…</span>${e.pre}` : ""}<span class="del">${e.del}</span><span class="ins">${e.ins}</span>${ctx ? e.post : ""}`;

export function chat(card, { before = "", after = "" } = {}) {
  return `<div class="chat">
    <div class="chat-hd">${ic("message-circle")}<b>校对这篇文章</b><span class="sp"></span>${ic("history")}${ic("x")}</div>
    <div class="chat-bd">
      <div class="msg-user">帮我把《${docTitle}》校对一遍，术语和数字统一一下</div>
      <div class="msg-ai"><p>好的，我先通读全文，再按小节给出修改。</p></div>
      ${before}
      ${card}
      ${after}
    </div>
    <div class="chat-ft">回复 ${agent.name}…<span class="sp"></span>${ic("arrow-up")}</div>
  </div>`;
}

export function mount(planKey, scenes) {
  const keys = Object.keys(scenes);
  let cur = new URLSearchParams(location.search).get("s") || keys[0];
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  const stage = document.createElement("div");
  stage.className = "stage";
  document.body.append(bar, stage);
  const render = () => {
    bar.innerHTML = `<b>Agent 修改工具卡</b>
      ${PLANS.map(([h, l]) => `<a href="${h}" class="${h === planKey ? "on" : ""}">${l}</a>`).join("")}
      <span class="sp"></span>
      <div class="scenes">${keys.map((k, i) => `<button data-s="${k}" class="${k === cur ? "on" : ""}">${i + 1} ${scenes[k].label}</button>`).join("")}</div>
      <button class="mb-btn" id="tg-mode">浅/深</button>`;
    const sc = scenes[cur];
    stage.innerHTML = `${sc.view}<div class="cap"><h3>${sc.label}</h3>${sc.cap}</div>`;
    window.lucide?.createIcons();
    history.replaceState(null, "", `?s=${cur}`);
  };
  bar.addEventListener("click", e => {
    const b = e.target.closest("[data-s]");
    if (b) {
      cur = b.dataset.s;
      render();
    }
    if (e.target.closest("#tg-mode")) {
      const h = document.documentElement;
      h.dataset.mode = h.dataset.mode === "dark" ? "light" : "dark";
    }
  });
  addEventListener("keydown", e => {
    const i = keys.indexOf(cur);
    if (e.key === "ArrowRight" && i < keys.length - 1) cur = keys[i + 1];
    else if (e.key === "ArrowLeft" && i > 0) cur = keys[i - 1];
    else return;
    render();
  });
  render();
}
