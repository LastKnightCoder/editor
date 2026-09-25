/* AI 对话样板间 · 共享渲染（控制条 / 侧栏 / 对话流 / 输入区） */

const PLANS = [
  ["index.html", "总览"],
  ["entry-a-dock.html", "入口 A 停靠栏"],
  ["entry-b-float.html", "入口 B 浮窗"],
  ["entry-c-split.html", "入口 C 分屏"],
  ["page-1-nested.html", "页面 1 侧栏嵌套"],
  ["page-2-switcher.html", "页面 2 顶部切换"],
  ["page-3-board.html", "页面 3 板内会话列"],
];

const NAV = [
  [
    "工作台",
    [
      ["flame", "今日", "home"],
      ["calendar", "日程"],
      ["list-todo", "待办"],
      ["timer", "番茄专注"],
      ["users", "协作"],
    ],
  ],
  [
    "知识",
    [
      ["layers", "卡片库"],
      ["file-text", "文章", "articles"],
      ["pen-line", "日记"],
      ["presentation", "白板"],
    ],
  ],
  [
    "学习",
    [
      ["folder-kanban", "项目"],
      ["repeat", "闪卡复习", null, "12"],
      ["circle-help", "问题管理", null, "5"],
      ["book-open", "微信读书"],
    ],
  ],
  [
    "AI",
    [
      ["message-circle", "AI 对话", "chat"],
      ["sparkles", "Skill 管理"],
    ],
  ],
  [
    "工具",
    [
      ["bar-chart-3", "统计"],
      ["send", "发布"],
    ],
  ],
];

export const SESSIONS = {
  pinned: [
    { t: "SM-2 与 FSRS 复习策略对比", m: "Sonnet 5", time: "刚刚", on: true },
    { t: "Electron 打包体积排查", m: "GPT-5", time: "昨天" },
  ],
  recent: [
    { t: "把本周日记整理成周报", m: "Sonnet 5", time: "10:24" },
    { t: "Slate 选区在 IME 下丢失", m: "Opus 5.5", time: "昨天" },
    { t: "《深度工作》读书卡片生成", m: "Sonnet 5", time: "周二" },
    { t: "向量检索 rerank 阈值", m: "Haiku 4.5", time: "周一" },
    { t: "白板导出 SVG 字体丢失", m: "Sonnet 5", time: "9/19" },
  ],
  groups: [
    {
      name: "学习",
      count: 18,
      children: [
        { name: "算法", count: 6 },
        { name: "英语", count: 4 },
      ],
    },
    { name: "开发", count: 31, children: [{ name: "桌面端", count: 12 }] },
    { name: "写作", count: 9 },
  ],
};

/* ── 控制条 ── */
export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>AI 对话 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${extraHTML}
    <span style="opacity:.7">缩放 <span id="mb-zoom">100%</span></span>
    <label>窗口宽 <select id="mb-width">
      <option value="1280">1280</option><option value="1440" selected>1440</option>
      <option value="1680">1680</option><option value="1920">1920</option></select></label>
    <button class="mb-btn" id="mb-theme">切换深浅</button>
    <button class="mb-btn" id="mb-note">方案说明</button>
    <button class="mb-btn" id="mb-anno">标注</button>`;
  document.body.prepend(bar);

  const saved = localStorage.getItem("chat-mock-theme") || "cream";
  document.documentElement.dataset.theme = saved;
  bar.querySelector("#mb-theme").onclick = () => {
    const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("chat-mock-theme", next);
  };
  // 默认只看界面：说明与标注收起，按需打开
  document.body.classList.add("no-anno", "no-note");
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("chat-mock-width");
  if (savedW) sel.value = savedW;
  // 模拟窗口按逻辑宽度排版，再整体缩放到预览区可见范围内（不出现横向滚动、不裁切）
  const fit = () => {
    if (window.innerWidth < 100 || window.innerHeight < 100) return; // 预览区隐藏时跳过，显示后由 resize 重算
    const w = +sel.value,
      h = 820;
    const top =
      bar.offsetHeight +
      (document.body.classList.contains("no-note")
        ? 0
        : (document.querySelector(".mock-note")?.offsetHeight || 0) + 18);
    const z = Math.min(
      1,
      (window.innerWidth - 24) / w,
      Math.max(0.35, (window.innerHeight - top - 24) / h)
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

/* ── 侧栏 ── */
export function sidebar(active, { chatChildren = "" } = {}) {
  return `
  <aside class="sb">
    <div class="sb-head"><div class="sb-logo">τ</div><span>Tau</span></div>
    <div class="sb-scroll">
      ${NAV.map(
        ([g, items]) => `
        <div class="sb-group">
          <div class="sb-gt">${g}</div>
          ${items
            .map(
              ([ic, label, key, badge]) => `
            <div class="sb-item ${key && key === active ? "on" : ""}" title="${label}">
              <i data-lucide="${ic}"></i><span>${label}</span>${badge ? `<em class="badge num">${badge}</em>` : ""}
            </div>
            ${key === "chat" && chatChildren ? `<div class="sb-sub">${chatChildren}</div>` : ""}`
            )
            .join("")}
        </div>`
      ).join("")}
    </div>
    <div class="sb-item" title="设置"><i data-lucide="sliders-horizontal"></i><span>设置</span></div>
  </aside>`;
}

/* ── 标题栏 ── */
export function titlebar(crumbHTML, rightHTML = "") {
  return `
  <div class="tb">
    <button class="ib"><i data-lucide="arrow-left"></i></button>
    <button class="ib"><i data-lucide="arrow-right"></i></button>
    <div class="crumb">${crumbHTML}</div>
    <span class="sp"></span>
    <div class="search"><i data-lucide="search"></i>搜索或输入命令<span class="sp" style="flex:1"></span><span class="kbd">Ctrl K</span></div>
    ${rightHTML}
    <button class="ib"><i data-lucide="sun-moon"></i></button>
    <div class="win-ctl"><span><i data-lucide="minus"></i></span><span><i data-lucide="square"></i></span><span><i data-lucide="x"></i></span></div>
  </div>`;
}

/* ── 对话流 ── */
export function thread({ maxW = 760, streaming = true, compact = false } = {}) {
  const pad = compact ? "padding:16px 16px 8px" : "";
  return `
  <div class="thread-inner" style="max-width:${maxW}px;${pad}">
    <div class="msg msg-user"><div class="bubble">
      结合 <span class="mention"><i data-lucide="layers"></i>遗忘曲线与间隔效应</span> 和
      <span class="mention"><i data-lucide="file-text"></i>SM-2 算法笔记</span>，帮我比较 SM-2 和 FSRS，给一个适合我现在卡片库的复习策略。
    </div></div>

    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span class="num">10:32</span></div>
      <div class="fold"><i data-lucide="brain"></i>思考了 14 秒<i data-lucide="chevron-right"></i></div>
      <div class="tools">
        <div class="fold"><i data-lucide="check" class="ok"></i>search_cards<span style="color:var(--ink-3)">· 找到 8 张相关卡片</span></div>
        <div class="fold"><i data-lucide="check" class="ok"></i>read_article<span style="color:var(--ink-3)">· SM-2 算法笔记</span></div>
      </div>
      <div class="md">
        <p>你的卡片库目前以<b>概念卡</b>为主（约 70%），复习间隔集中在 1–14 天。两种算法的核心差异：</p>
        <ol>
          <li><b>SM-2</b> 用固定的易度因子 <code>EF</code> 放大间隔，对「答错后重新学习」的惩罚偏重；</li>
          <li><b>FSRS</b> 显式建模稳定性 S 与难度 D，能按目标保留率反推下一次间隔。</li>
        </ol>
        ${
          compact
            ? ""
            : `<div class="codeblock"><div class="ch"><span>python</span><button class="ib" style="width:24px;height:24px"><i data-lucide="copy"></i></button></div><pre><span class="c"># FSRS：由稳定性与目标保留率求间隔</span>
<span class="k">def</span> next_interval(stability, retention=<span class="s">0.9</span>):
    <span class="k">return</span> stability / FACTOR * (retention ** (<span class="s">1</span> / DECAY) - <span class="s">1</span>)</pre></div>`
        }
        <div class="blockcard"><span class="bi"><i data-lucide="layers"></i></span><div><div class="bt">遗忘曲线与间隔效应</div><div class="bd">卡片 · 被引用 3 次 · 点击在旁侧预览</div></div></div>
        <h4>建议</h4>
        <p>新卡沿用 SM-2 过渡两周，积累足够的评分记录后切换 FSRS，目标保留率设为 0.9。</p>
      </div>
      <div class="msg-actions show">
        <button class="ib" title="复制"><i data-lucide="copy"></i></button>
        <button class="ib" title="重新生成"><i data-lucide="refresh-cw"></i></button>
        <button class="ib" title="从这里创建分支"><i data-lucide="git-branch"></i></button>
        <button class="ib" title="删除"><i data-lucide="trash-2"></i></button>
      </div>
    </div>

    <div class="msg msg-user"><div class="bubble">切换之后已有卡片的历史评分怎么迁移？</div></div>

    <div class="msg">
      <div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span>生成中</span></div>
      <div class="md"><p>可以直接用已有的复习日志重放：按时间顺序把每一次评分喂给 FSRS 的状态机，得到每张卡当前的 S 与 D${streaming ? `<span class="caret"></span>` : "。"}</p></div>
    </div>
  </div>`;
}

/* ── 输入区 ── */
export function composer({
  maxW = 760,
  compact = false,
  ctx = true,
  focus = false,
  placeholder = "输入消息，@ 引用卡片 / 文章 / 项目内容，Enter 发送",
} = {}) {
  return `
  <div class="composer-wrap" ${compact ? 'style="padding:0 12px 12px"' : ""}>
    <div class="composer ${focus ? "focus" : ""}" style="max-width:${maxW}px">
      ${ctx ? `<div class="ctx"><span class="chip"><i data-lucide="file-text"></i>SM-2 算法笔记<i data-lucide="x"></i></span></div>` : ""}
      <textarea rows="${compact ? 1 : 2}" placeholder="${placeholder}"></textarea>
      <div class="row">
        <button class="ib" title="附件（图片 / PDF）"><i data-lucide="paperclip"></i></button>
        <button class="ib" title="@ 引用"><i data-lucide="at-sign"></i></button>
        ${compact ? "" : `<button class="ib" title="MCP"><i data-lucide="plug"></i></button>`}
        <button class="model">Sonnet 5<i data-lucide="chevron-down"></i></button>
        ${compact ? "" : `<button class="model"><i data-lucide="brain"></i>思考 · 中</button><button class="model"><i data-lucide="cpu"></i>本地</button>`}
        <span class="sp"></span>
        <span class="ring" title="上下文 38%"></span>
        <button class="send"><i data-lucide="arrow-up"></i></button>
      </div>
    </div>
  </div>`;
}

export function anno(n, text, style) {
  return `<div class="anno" data-n="${n}" style="${style}">${text}</div>`;
}

export function icons() {
  window.lucide && window.lucide.createIcons();
}

/* ── 对话页主体：一整张纸（对话列居中 + 底部输入） ── */
export function chatPaper({ head = "", maxW = 760, extra = "" } = {}) {
  return `
  <section class="paper chat-paper" style="flex:1;display:flex;flex-direction:column">
    ${head}
    <div class="thread" style="flex:1">${thread({ maxW })}</div>
    ${composer({ maxW })}
    ${extra}
  </section>`;
}

/* 纸面右上角的对话工具（分支切换 / 块预览 / 更多） */
export function paperTools() {
  return `
  <div class="paper-tools">
    <span class="branch num"><i data-lucide="git-branch"></i>分支 <button class="ib"><i data-lucide="chevron-left"></i></button>2 / 3<button class="ib"><i data-lucide="chevron-right"></i></button></span>
    <button class="ib" title="块预览"><i data-lucide="panel-right"></i></button>
    <button class="ib" title="更多：重命名 / 移动到分组 / 系统提示词 / 归档 / 删除"><i data-lucide="more-horizontal"></i></button>
  </div>`;
}

/* ── 会话库：分组树 + 会话列表（legacy ChatManagementSidebar 的全部管理能力收拢于此） ── */
export function library({ asDialog = true } = {}) {
  const rows = [...SESSIONS.pinned.map(s => ({ ...s, pin: true })), ...SESSIONS.recent];
  return `
  <div class="lib ${asDialog ? "lib-dialog" : ""}">
    <div class="lib-head">
      <b>全部会话</b><span class="num" style="color:var(--ink-3);font-size:12px">58</span>
      <span style="flex:1"></span>
      <div class="lib-search"><i data-lucide="search"></i>搜索标题</div>
      <button class="ib" title="新建分组"><i data-lucide="folder-plus"></i></button>
      ${asDialog ? `<button class="ib lib-close" title="关闭 Esc"><i data-lucide="x"></i></button>` : ""}
    </div>
    <div class="lib-body">
      <nav class="lib-tree">
        <div class="lt on"><i data-lucide="inbox"></i>全部<span class="num">58</span></div>
        <div class="lt"><i data-lucide="pin"></i>置顶<span class="num">2</span></div>
        ${SESSIONS.groups
          .map(
            g => `
          <div class="lt"><i data-lucide="folder"></i>${g.name}<span class="num">${g.count}</span></div>
          ${(g.children || []).map(c => `<div class="lt sub"><i data-lucide="folder"></i>${c.name}<span class="num">${c.count}</span></div>`).join("")}`
          )
          .join("")}
        <div class="lt"><i data-lucide="folder-open"></i>未分组<span class="num">12</span></div>
        <div class="lt"><i data-lucide="archive"></i>已归档<span class="num">7</span></div>
      </nav>
      <div class="lib-list">
        ${rows
          .map(
            (s, i) => `
          <div class="lr ${s.on ? "on" : ""}">
            <i data-lucide="grip-vertical" class="grip"></i>
            <div class="lr-main"><div class="lr-t">${s.pin ? `<i data-lucide="pin" style="width:12px;height:12px;color:var(--accent-text)"></i>` : ""}${s.t}</div>
              <div class="lr-m">${s.m} · ${s.time}${i === 0 ? " · 3 个分支" : ""}</div></div>
            <div class="lr-act"><button class="ib"><i data-lucide="pin"></i></button><button class="ib"><i data-lucide="folder-input"></i></button><button class="ib"><i data-lucide="more-horizontal"></i></button></div>
          </div>`
          )
          .join("")}
      </div>
    </div>
  </div>`;
}
