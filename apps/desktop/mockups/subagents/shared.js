/* 子 Agent 样板间 · 共享数据与渲染（视觉参考，非实现源） */

export const PLANS = [
  ["index.html", "总览"],
  ["a-inline.html", "A 内联卡片 + 侧抽屉"],
  ["b-dock.html", "B 任务坞 + 分屏"],
  ["c-board.html", "C 子 Agent 看板"],
];

export const SCENES = [
  ["s1", "1 派发"],
  ["s2", "2 并行进行中"],
  ["s3", "3 等你处理"],
  ["s4", "4 完成回传"],
  ["s5", "5 失败/中断/取消"],
  ["s6", "6 续用同一子 Agent"],
  ["s7", "7 查看详情"],
  ["s8", "8 在别的页面"],
  ["s9", "9 同步派发"],
  ["s10", "10 侧边栏"],
  ["s11", "11 顶部常驻入口"],
];

export const STATUS = {
  queued: ["clock", "排队中"],
  running: ["", "执行中"],
  question: ["message-circle-question", "等你回答"],
  approval: ["shield-question", "等你审批"],
  completed: ["check", "已完成"],
  failed: ["x", "失败"],
  cancelled: ["ban", "已取消"],
  interrupted: ["circle-pause", "已中断"],
};
export const needsUser = a => a.status === "question" || a.status === "approval";
export const isActive = a => a.status === "running" || a.status === "queued" || needsUser(a);
export const stClass = a => (needsUser(a) ? "attention" : a.status);

const BASE = {
  ob: { id: "ob", title: "Obsidian 同步调研", c: 2, initial: "O" },
  lg: { id: "lg", title: "Logseq 同步调研", c: 3, initial: "L" },
  no: { id: "no", title: "Notion 离线机制", c: 1, initial: "N" },
  wr: { id: "wr", title: "整理对比表", c: 4, initial: "整" },
};
const TASK = {
  ob: "调研 Obsidian Sync 的同步模型：冲突处理、端到端加密、版本历史，给出要点与来源链接。",
  lg: "调研 Logseq 的同步方案（官方 Sync 与 Git 方案），重点看冲突与离线编辑。",
  no: "调研 Notion 的离线能力与同步机制，确认 2026 年离线模式的限制。",
  wr: "等三份调研回来后，整理成一张对比表（维度：模型 / 冲突 / 加密 / 离线 / 价格）。",
};
const RESULT = {
  ob: "Obsidian Sync 以文件为单位同步，冲突时保留双方版本并在文件内标注；端到端加密默认开启，版本历史保留 1 年（Plus 方案）。",
  lg: "Logseq 官方 Sync 基于文件差异合并，Git 方案依赖用户手动解决冲突；DB 版本改用 SQLite + 操作日志，冲突粒度到块。",
  no: "Notion 2026 年支持按页面离线，需提前标记；离线编辑在重新联网后按块合并，数据库视图离线只读。",
  wr: "已生成对比表（5 维度 × 3 产品），并标注了 2 处来源不一致需要你确认。",
};

const mk = (id, extra) => ({
  ...BASE[id],
  task: TASK[id],
  runs: 1,
  progress: [],
  tools: 0,
  ...extra,
});

/** 每个场景的子 Agent 状态与父对话流 */
export function scene(key) {
  const parentAsk = { u: "帮我调研 Obsidian、Logseq、Notion 三家的同步方案，最后整理成对比表。" };
  const plan = {
    a: `<p>我会拆成三路并行调研，最后再由一个子 Agent 汇总成表。</p>`,
  };
  const S = {
    s1: {
      agents: [
        mk("ob", {
          status: "running",
          act: "搜索 “Obsidian Sync conflict”",
          elapsed: "8 秒",
          tools: 1,
        }),
        mk("lg", { status: "running", act: "正在思考…", elapsed: "6 秒" }),
        mk("no", {
          status: "running",
          act: "读取 notion.com/help/offline",
          elapsed: "5 秒",
          tools: 1,
        }),
        mk("wr", { status: "queued", act: "等待空位（同时最多 3 个）" }),
      ],
      flow: [
        parentAsk,
        plan,
        { spawn: ["ob", "lg", "no", "wr"] },
        {
          a: `<p>四个子任务已经派出去了，前三个并行执行，汇总任务会在空位出来后开始。你可以继续聊别的，结果回来我会接着处理。</p>`,
        },
      ],
      parentBusy: false,
    },
    s2: {
      agents: [
        mk("ob", {
          status: "completed",
          elapsed: "1 分 12 秒",
          tools: 6,
          result: RESULT.ob,
          progress: ["找到官方文档与 2 篇社区实测"],
        }),
        mk("lg", {
          status: "running",
          act: "读取 docs.logseq.com/#/page/sync",
          elapsed: "1 分 40 秒",
          tools: 5,
          progress: ["官方 Sync 与 Git 方案行为差异较大，分开整理"],
        }),
        mk("no", {
          status: "running",
          act: "搜索 “Notion offline mode 2026 limits”",
          elapsed: "1 分 38 秒",
          tools: 4,
        }),
        mk("wr", { status: "running", act: "读取 Obsidian 调研结果", elapsed: "12 秒", tools: 1 }),
      ],
      flow: [
        parentAsk,
        plan,
        { spawn: ["ob", "lg", "no", "wr"] },
        { a: `<p>四个子任务已经派出去了。</p>` },
        { inbox: ["ob"] },
        {
          a: `<p>Obsidian 那一路先回来了：以文件为单位同步，冲突保留双方版本。其余两路还在跑，我等齐后一起分析。</p>`,
        },
      ],
      parentBusy: false,
    },
    s3: {
      agents: [
        mk("ob", { status: "completed", elapsed: "1 分 12 秒", tools: 6, result: RESULT.ob }),
        mk("lg", {
          status: "question",
          elapsed: "2 分 05 秒",
          tools: 6,
          act: "等你回答",
          ask: {
            type: "question",
            q: "Logseq 现在有文件版和 DB 版（beta）两套同步实现，要把 DB 版也纳入对比吗？",
            opts: [
              ["只看文件版", "稳定版，用户最多"],
              ["两个都看", "多花约 2 分钟"],
              ["只看 DB 版", "未来方向"],
            ],
          },
        }),
        mk("no", {
          status: "approval",
          elapsed: "1 分 58 秒",
          tools: 4,
          act: "等你审批",
          ask: {
            type: "approval",
            tool: "fetch_url",
            desc: "访问外部网页",
            code: "https://www.notion.com/help/guides/working-offline-in-notion",
          },
        }),
        mk("wr", { status: "queued", act: "等待空位（同时最多 3 个）" }),
      ],
      flow: [
        parentAsk,
        plan,
        { spawn: ["ob", "lg", "no", "wr"] },
        { a: `<p>四个子任务已经派出去了。</p>` },
        { inbox: ["ob"] },
        { a: `<p>Obsidian 已完成。另外两路需要你拍板，处理后它们会自己继续。</p>` },
      ],
      parentBusy: false,
    },
    s4: {
      agents: [
        mk("ob", { status: "completed", elapsed: "1 分 12 秒", tools: 6, result: RESULT.ob }),
        mk("lg", { status: "completed", elapsed: "3 分 20 秒", tools: 9, result: RESULT.lg }),
        mk("no", { status: "completed", elapsed: "2 分 41 秒", tools: 7, result: RESULT.no }),
        mk("wr", { status: "completed", elapsed: "48 秒", tools: 3, result: RESULT.wr }),
      ],
      flow: [
        parentAsk,
        plan,
        { spawn: ["ob", "lg", "no", "wr"] },
        { a: `<p>四个子任务已经派出去了。</p>` },
        { inbox: ["ob", "lg", "no", "wr"] },
        { table: true },
      ],
      parentBusy: true,
    },
    s5: {
      agents: [
        mk("ob", { status: "completed", elapsed: "1 分 12 秒", tools: 6, result: RESULT.ob }),
        mk("lg", {
          status: "failed",
          elapsed: "52 秒",
          tools: 3,
          error: "fetch_url: 429 Too Many Requests（docs.logseq.com）",
        }),
        mk("no", {
          status: "interrupted",
          elapsed: "1 分 10 秒",
          tools: 4,
          error: "应用重启，执行未完成",
        }),
        mk("wr", { status: "cancelled", elapsed: "—", tools: 0 }),
      ],
      flow: [
        parentAsk,
        plan,
        { spawn: ["ob", "lg", "no", "wr"] },
        { a: `<p>四个子任务已经派出去了。</p>` },
        { inbox: ["ob", "lg"] },
        {
          a: `<p>Logseq 那一路被对方站点限流失败了。要我换个来源让它重试吗？Notion 那路因为应用重启被中断，历史还在，可以接着跑。</p>`,
        },
      ],
      parentBusy: false,
    },
    s6: {
      agents: [
        mk("ob", {
          status: "running",
          runs: 2,
          act: "搜索 “Obsidian Sync conflict file”",
          elapsed: "22 秒",
          tools: 2,
          result: RESULT.ob,
          followup: "补充 Obsidian Sync 冲突文件的命名规则和合并策略，附截图来源。",
        }),
        mk("lg", { status: "completed", elapsed: "3 分 20 秒", tools: 9, result: RESULT.lg }),
        mk("no", { status: "completed", elapsed: "2 分 41 秒", tools: 7, result: RESULT.no }),
      ],
      flow: [
        parentAsk,
        { a: `<p>（之前的三路调研已完成，对比表见上文）</p>` },
        { u: "Obsidian 的冲突处理再查细一点。" },
        { send: "ob" },
        {
          a: `<p>已经让之前那个 Obsidian 子 Agent 接着查——它保留着上次的上下文，不用从头再来。</p>`,
        },
      ],
      parentBusy: false,
    },
    s7: null,
    s8: null,
    s9: {
      agents: [
        mk("ob", {
          status: "running",
          act: "读取 help.obsidian.md/sync/conflicts",
          elapsed: "34 秒",
          tools: 3,
          progress: ["官方文档已找到，正在核对版本历史保留期"],
        }),
      ],
      flow: [{ u: "Obsidian Sync 的版本历史保留多久？帮我查准确。" }, { spawnSync: "ob" }],
      parentBusy: true,
    },
  };
  S.s7 = { ...S.s3, detail: "lg" };
  S.s8 = { ...S.s3, page: "cards" };
  S.s10 = { ...S.s3, page: "cards", assist: true, detail: "lg" };
  S.s11 = { ...S.s3, hubOpen: true };
  return S[key];
}

export const agentById = (sc, id) => sc.agents.find(a => a.id === id);

/* ── 外壳 ── */
export const ic = (n, cls = "") => `<i data-lucide="${n}" class="${cls}"></i>`;

export function statusTag(a) {
  if (a.status === "running")
    return `<span class="stt running"><span class="spin"></span>执行中</span>`;
  const [icon, label] = STATUS[a.status];
  return `<span class="stt ${stClass(a)}">${icon ? ic(icon) : ""}${label}</span>`;
}
export const avatar = (a, size = "") =>
  `<span class="av ${size}" data-c="${a.c}">${a.initial}<span class="st ${stClass(a)}"></span></span>`;

export function mockBar(plan, sceneKey, sceneList = SCENES) {
  const plans = PLANS.map(
    ([f, t]) =>
      `<a href="${f}${f === "index.html" ? "" : "#" + sceneKey}" class="${f === plan ? "on" : ""}">${t}</a>`
  ).join("");
  const scenes = `<div class="seg" id="scenes">${sceneList.map(([k, t]) => `<button data-s="${k}" class="${k === sceneKey ? "on" : ""}">${t}</button>`).join("")}</div>`;
  return `<div class="mock-bar"><b>子 Agent</b>${plans}<span class="sp"></span>${scenes}
    <button class="mb-btn" id="tg-mode">浅/深</button><button class="mb-btn" id="tg-anno">标注 A</button><button class="mb-btn" id="tg-note">方案说明 N</button></div>`;
}

export function rail(page = "chat") {
  const items = [
    ["flame"],
    ["calendar"],
    ["list-todo"],
    ["layers", "cards"],
    ["file-text"],
    ["presentation"],
    ["folder-kanban"],
    ["message-circle", "chat"],
    ["sparkles"],
  ];
  return `<aside class="rail"><span class="logo">τ</span>${items.map(([n, k]) => `<span class="ri ${k === page ? "on" : ""}">${ic(n)}</span>`).join("")}</aside>`;
}

export function titlebar({ crumb, attention = [], running = 0, popOpen = false, popHtml = "" }) {
  const att = attention.length
    ? `<button class="att-pill" data-act="att-pop">${ic("bell-ring")}待你处理<span class="n num">${attention.length}</span></button>`
    : "";
  const run = running
    ? `<button class="run-pill"><span class="spin"></span><span class="num">${running}</span> 个子任务进行中</button>`
    : "";
  return `<header class="tb">
    <span class="ib">${ic("arrow-left")}</span><span class="ib" style="color:var(--ink-3)">${ic("arrow-right")}</span>
    <span class="crumb">${crumb}</span><span class="sp"></span>
    <span class="search">${ic("search")}搜索或跳转…<kbd>Ctrl K</kbd></span><span class="sp"></span>
    ${run}${att}
    <span class="ib">${ic("sun-moon")}</span>
    <span class="wc"><span>${ic("minus")}</span><span>${ic("square")}</span><span>${ic("x")}</span></span>
    ${popOpen ? popHtml : ""}
  </header>`;
}
/** 问题 / 审批卡：所有方案共用同一交互组件（PiSessionInteractions 快照） */
export function askCard(a, { compact = false } = {}) {
  const k = a.ask;
  if (k.type === "question")
    return `<div class="ask">
      <div class="q">${ic("message-circle-question")}<span>${k.q}</span></div>
      <div class="opts">${k.opts.map(([t, d], i) => `<button class="opt"><span class="k">${i + 1}</span>${t}${compact ? "" : `<small>${d}</small>`}</button>`).join("")}</div>
      <div class="acts"><button class="btn ghost sm">${ic("pencil")}自己写</button><span class="sp"></span><button class="btn ghost sm">跳过</button></div>
    </div>`;
  return `<div class="ask">
    <div class="q">${ic("shield-question")}<span>允许 <b class="mono" style="font-weight:500">${k.tool}</b>（${k.desc}）？</span></div>
    <div class="code">${k.code}</div>
    <div class="acts"><button class="btn primary sm">允许一次</button><button class="btn line sm">本会话都允许</button><span class="sp"></span><button class="btn danger-ghost sm">拒绝</button></div>
  </div>`;
}

/** 标题栏待处理弹层：任何页面都能就地答完 */
export function attentionPop(sc) {
  const list = sc.agents.filter(needsUser);
  return `<div class="pop att-pop">
    <div class="hd">${list.length} 项等你处理 · 来自「三家同步方案调研」<span class="sp"></span><a class="btn ghost sm">${ic("message-circle")}回到对话</a></div>
    ${list.map(a => `<div class="att-item"><div class="who">${avatar(a, "xs")}<b>${a.title}</b><span class="sp"></span><a>${a.ask.type === "question" ? "提问" : "工具审批"} · ${a.elapsed}</a></div>${askCard(a, { compact: true })}</div>`).join("")}
  </div>`;
}

export function composer({ busy = false, extra = "" } = {}) {
  return `<div class="composer">${extra}
    <div class="ph">${busy ? "主 Agent 正在回复，可以继续输入…" : "继续提问，或让主 Agent 调整子任务…"}</div>
    <div class="row"><span class="chip">${ic("paperclip")}</span><span class="chip">Opus 5.5</span><span class="chip">${ic("wrench")}12 个工具</span><span class="sp"></span>
    <span class="send ${busy ? "stop" : ""}">${ic(busy ? "square" : "arrow-up")}</span></div>
  </div>`;
}

export function chatHead(extra = "") {
  return `<div class="chat-head"><span class="t">三家同步方案调研</span><span class="m">Opus 5.5 · 今天 14:02</span><span class="sp"></span>${extra}<span class="ib sm">${ic("git-branch")}</span><span class="ib sm">${ic("more-horizontal")}</span></div>`;
}

/** 其他页面（卡片库）占位内容，用于场景 8 */
export function otherPage() {
  const cards = Array.from(
    { length: 9 },
    (
      _,
      i
    ) => `<div style="background:var(--surface);border-radius:12px;box-shadow:var(--shadow-card);padding:14px 16px;height:132px">
    <div style="height:10px;width:${50 + ((i * 17) % 40)}%;background:var(--sunken);border-radius:4px;margin-bottom:10px"></div>
    <div style="height:8px;width:90%;background:var(--hover);border-radius:4px;margin-bottom:7px"></div>
    <div style="height:8px;width:76%;background:var(--hover);border-radius:4px;margin-bottom:7px"></div>
    <div style="height:8px;width:60%;background:var(--hover);border-radius:4px"></div></div>`
  ).join("");
  return `<div style="flex:1;overflow:auto;padding:6px 18px 18px 6px"><div style="font-size:18px;font-weight:600;margin:4px 0 14px">卡片库</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${cards}</div></div>`;
}
/** 回传结果表（场景 4 主 Agent 汇总） */
export function resultTable() {
  const rows = [
    ["同步粒度", "文件", "文件 / 块（DB 版）", "块"],
    ["冲突处理", "保留双方版本", "Git 手动 / 块级合并", "块级合并"],
    ["端到端加密", "默认开启", "官方 Sync 支持", "不支持"],
    ["离线编辑", "完整", "完整", "需提前标记页面"],
  ];
  const th = h =>
    `<th style="text-align:left;padding:6px 10px;color:var(--ink-3);font-weight:500;border-bottom:1px solid var(--line-1)">${h}</th>`;
  const td = (c, i) =>
    `<td style="padding:6px 10px;border-bottom:1px solid var(--line-2);${i ? "" : "color:var(--ink-2)"}">${c}</td>`;
  return `<p>三路调研和汇总都回来了，对比如下：</p>
  <table style="border-collapse:collapse;font-size:13px;width:100%"><tr>${["维度", "Obsidian", "Logseq", "Notion"].map(th).join("")}</tr>
  ${rows.map(r => `<tr>${r.map(td).join("")}</tr>`).join("")}</table>
  <p style="margin-top:6px">有 2 处来源不一致（Logseq DB 版发布时间、Notion 离线配额），我在表下标注了出处<span class="typing" style="margin-left:6px"><i></i><i style="animation-delay:.2s"></i><i style="animation-delay:.4s"></i></span></p>`;
}

/** 对话流：普通消息共用，子 Agent 相关条目交给方案自己渲染 */
export function renderFlow(sc, special) {
  return sc.flow
    .map(item => {
      if (item.u) return `<div class="msg-u">${item.u}</div>`;
      if (item.a) return `<div class="msg-a">${item.a}</div>`;
      if (item.table) return `<div class="msg-a">${resultTable()}</div>`;
      return special(item);
    })
    .join("");
}

/** 通用：挂载、场景切换、主题、标注、缩放 */
export function mount(plan, render, { scenes = SCENES } = {}) {
  let key = (location.hash || "#s1").slice(1);
  const ui = { pop: false, drawer: null, expanded: {} };
  const reset = () => Object.assign(ui, { pop: false, drawer: null, expanded: {} });
  const fit = () => {
    const s = document.getElementById("scaler");
    if (!s || !s.querySelector(".win")) return;
    const win = s.querySelector(".win");
    s.style.height = "";
    const w = win.offsetWidth;
    const h = s.scrollHeight;
    const bar = document.querySelector(".mock-bar").offsetHeight;
    const k = Math.min(1, (window.innerWidth - 24) / w, (window.innerHeight - bar - 30) / h);
    s.style.transform = `scale(${k})`;
    s.style.height = h * k + "px";
    s.style.width = w * k + "px";
  };
  const draw = () => {
    const out = render(key, ui);
    document.getElementById("app").innerHTML =
      mockBar(plan, key, scenes) +
      `<div class="stage"><div class="scaler" id="scaler">${out.html}</div></div><div class="mock-note">${out.note || ""}</div>`;
    window.lucide && window.lucide.createIcons();
    fit();
  };
  document.addEventListener("click", e => {
    const sb = e.target.closest("#scenes button");
    if (sb) {
      key = sb.dataset.s;
      history.replaceState(null, "", "#" + key);
      reset();
      return draw();
    }
    if (e.target.closest("#tg-mode")) {
      const h = document.documentElement;
      h.dataset.mode = h.dataset.mode === "dark" ? "light" : "dark";
      return;
    }
    if (e.target.closest("#tg-anno")) return document.body.classList.toggle("show-anno");
    if (e.target.closest("#tg-note")) return document.body.classList.toggle("show-note");
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const [name, arg] = act.dataset.act.split(":");
    if (name === "att-pop") ui.pop = !ui.pop;
    else if (name === "open") {
      ui.drawer = arg;
      ui.pop = false;
      ui.hub = false;
    } else if (name === "hub") ui.hub = !ui.hub;
    else if (name === "close") ui.drawer = null;
    else if (name === "toggle") ui.expanded[arg] = !ui.expanded[arg];
    else ui[name] = arg ?? !ui[name];
    draw();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "n" || e.key === "N") document.body.classList.toggle("show-note");
    if (e.key === "a" || e.key === "A") document.body.classList.toggle("show-anno");
    if (e.key === "Escape" && (ui.pop || ui.hub || ui.drawer)) {
      if (ui.pop) ui.pop = false;
      else if (ui.hub) ui.hub = false;
      else ui.drawer = null;
      draw();
    }
  });
  window.addEventListener("resize", fit);
  draw();
}

/** 子 Agent 会话正文：任务说明 → 工具/思考 → send_parent 进度 → 结果/错误/交互 */
export function transcript(a) {
  const tools = [
    ["search", "web_search", "Logseq sync conflict", "1.4 秒"],
    ["globe", "fetch_url", "docs.logseq.com/#/page/sync", "2.1 秒"],
    ["globe", "fetch_url", "discuss.logseq.com/t/db-version-sync", "1.8 秒"],
  ];
  const fold = ([icon, name, arg, t]) =>
    `<span class="fold">${ic("check")}<span>${name}</span><span class="meta">${arg}</span><span class="meta">${t}</span>${ic("chevron-right", "chev")}</span>`;
  const first = a.runs > 1 ? `<div class="run-sep">第 1 次 · 已完成</div>` : "";
  const prior =
    a.runs > 1
      ? `<div class="brief"><div class="lb">${ic("corner-down-right")}主 Agent 的任务</div>${a.task}</div><div class="result"><div class="lb">${ic("check")}结果已回传</div>${a.result}</div><div class="run-sep">第 2 次 · ${STATUS[a.status][1]}</div>`
      : "";
  const brief = `<div class="brief"><div class="lb">${ic("corner-down-right")}主 Agent 的任务</div>${a.followup || a.task}</div>`;
  let tail = "";
  if (needsUser(a)) tail = askCard(a);
  else if (a.status === "running")
    tail = `<div class="act live">${ic("loader")}<span>${a.act}</span></div>`;
  else if (a.status === "completed")
    tail = `<div class="result"><div class="lb">${ic("check")}结果已回传给主 Agent</div>${a.result}</div>`;
  else if (a.status === "failed")
    tail = `<div class="err">${ic("circle-x")}<div><b>执行失败</b><div class="m">${a.error}</div></div></div>`;
  else if (a.status === "interrupted")
    tail = `<div class="err warn">${ic("circle-pause")}<div><b>已中断</b><div class="m">${a.error}。会话历史保留，主 Agent 再次发送即可继续。</div></div></div>`;
  else if (a.status === "cancelled")
    tail = `<div class="err warn">${ic("ban")}<div><b>已取消</b><div class="m">会话和历史仍保留。</div></div></div>`;
  else if (a.status === "queued")
    tail = `<div class="act">${ic("clock")}<span>${a.act}</span></div>`;
  const body =
    a.status === "queued"
      ? ""
      : `<div class="msg-a" style="font-size:13.5px"><p>先查官方文档，再看社区里关于冲突的讨论。</p></div>
    <div style="display:flex;flex-direction:column;gap:2px">${tools
      .slice(0, a.status === "failed" ? 2 : 3)
      .map(fold)
      .join("")}</div>
    <div class="report">${ic("arrow-up-right")}<span><b style="font-weight:500">报告给主 Agent：</b>官方 Sync 与 Git 方案行为差异较大，分开整理</span></div>`;
  return first + prior + brief + body + tail;
}

export function runsList(a) {
  const rows = [];
  if (a.runs > 1) rows.push([1, "completed", a.task, "1 分 12 秒", "async"]);
  rows.push([
    a.runs,
    a.status,
    a.followup || a.task,
    a.elapsed || "—",
    a.id === "ob" && a.runs === 1 ? "sync" : "async",
  ]);
  return `<div class="runs">${rows
    .reverse()
    .map(
      ([n, s, t, e, m]) =>
        `<div class="r"><span class="n num">#${n}</span><span>${statusTag({ status: s })}</span><span class="n">${m === "sync" ? "同步" : "异步"} · ${e}</span><span class="in">${t}</span></div>`
    )
    .join("")}</div>`;
}

/** 详情头 + tabs + 正文 + 底栏，容器（抽屉/分屏/展开列）由方案决定 */
export function detailInner(a, { closeAct = "close", headExtra = "", tab = "talk" } = {}) {
  const active = isActive(a);
  return `<div class="dt-head">${avatar(a, "lg")}<div class="tt"><b>${a.title}</b><div class="sub">${statusTag(a)}<span>第 ${a.runs} 次任务</span><span>${a.tools} 次工具</span><span>${a.elapsed || ""}</span></div></div>${headExtra}<button class="ib sm" data-act="${closeAct}">${ic("x")}</button></div>
  <div class="dt-tabs"><button class="${tab === "talk" ? "on" : ""}">对话</button><button class="${tab === "runs" ? "on" : ""}">执行记录 ${a.runs}</button></div>
  <div class="dt-body">${tab === "talk" ? transcript(a) : runsList(a)}</div>
  <div class="dt-foot">${ic("info")}<span>子 Agent 只接收主 Agent 的指令</span><span class="sp"></span>${active ? `<button class="btn danger-ghost sm">${ic("square")}${a.status === "queued" ? "取消排队" : "停止执行"}</button>` : `<button class="btn ghost sm">${ic("at-sign")}让主 Agent 追问</button>`}</div>`;
}
