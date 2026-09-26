/* Skill 管理页样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
import { sidebar as mcpSidebar, ic, tg } from "../mcp/mcp.js?v=1";
export { titlebar, anno, icons, ic, tg };

const PLANS = [
  ["index.html", "总览与决策"],
  ["a-split.html", "方案 A 列表 + 工作区"],
  ["b-gallery.html", "方案 B 卡片库 + 编辑页"],
  ["c-rows.html", "方案 C 设置式单列"],
];

export const sidebar = () => mcpSidebar("own", "Skill 管理");

/* ── 数据：内置 = src/constants/internal-skills 的真实清单；我的 = userData/skills；关联 = 其它工具的 skills 目录（只读） ── */
export const SKILLS = [
  {
    id: "weekly-report",
    ic: "calendar-range",
    c: "c1",
    title: "周报整理",
    desc: "把一周的日记、已完成待办和日程整理成周报。用户提到「周报」「本周总结」「这周做了什么」时使用。",
    src: "mine",
    mode: "auto",
    on: true,
    tokens: 58,
    files: ["SKILL.md", "templates/weekly.md", "reference/分类规则.md", "examples/2026-W38.md"],
    tools: ["sql_query", "search_knowledge"],
    uses: 23,
    last: "今天 10:24",
    updated: "9/24",
  },
  {
    id: "reading-cards",
    ic: "book-open",
    c: "c3",
    title: "读书卡片生成",
    desc: "从微信读书划线或 PDF 高亮生成原子化知识卡片，一张卡只讲一个观点，并回链到出处。",
    src: "mine",
    mode: "auto",
    on: true,
    tokens: 47,
    files: ["SKILL.md", "reference/卡片写法.md"],
    tools: ["search_knowledge"],
    uses: 11,
    last: "周二",
    updated: "9/12",
  },
  {
    id: "flashcard-quiz",
    ic: "repeat",
    c: "c4",
    title: "闪卡出题",
    desc: "把卡片或文章改写成问答式闪卡（正面问题、背面答案），避免是非题与一问多答。",
    src: "mine",
    mode: "manual",
    on: true,
    tokens: 0,
    files: ["SKILL.md", "templates/cloze.md", "templates/qa.md"],
    tools: [],
    uses: 6,
    last: "9/20",
    updated: "9/02",
  },
  {
    id: "paper-reading",
    ic: "graduation-cap",
    c: "c2",
    title: "论文精读",
    desc: "",
    src: "mine",
    mode: "auto",
    on: true,
    tokens: 0,
    warn: "缺少 description，AI 无法判断何时使用它",
    files: ["SKILL.md"],
    tools: [],
    uses: 0,
    last: "从未",
    updated: "昨天",
  },
  {
    id: "code-review-zh",
    ic: "git-pull-request",
    c: "c5",
    title: "中文代码评审",
    desc: "按「正确性 → 可读性 → 性能」顺序用中文评审代码片段，每条意见给出修改建议。",
    src: "mine",
    mode: "auto",
    on: false,
    tokens: 41,
    files: ["SKILL.md", "reference/checklist.md"],
    tools: [],
    uses: 3,
    last: "8/30",
    updated: "8/28",
  },
  {
    id: "knowledge-base",
    ic: "library",
    c: "c1",
    title: "知识库搜索与引用",
    desc: "通过 search_knowledge 搜索个人知识库（卡片、文章、项目条目、日记），引用结果时使用 :ref 语法。",
    src: "builtin",
    mode: "auto",
    on: true,
    tokens: 212,
    warn: "描述偏长（212 tokens），建议把细则移到正文",
    files: ["SKILL.md"],
    tools: ["search_knowledge"],
    uses: 96,
    last: "今天 11:02",
    updated: "随应用",
  },
  {
    id: "database-schema",
    ic: "database",
    c: "c2",
    title: "主数据库结构与只读 SQL",
    desc: "说明主 SQLite 数据库的表结构、字段关系和安全查询方式，供 sql_query 使用。",
    src: "builtin",
    mode: "auto",
    on: true,
    tokens: 44,
    files: ["SKILL.md"],
    tools: ["sql_query"],
    uses: 58,
    last: "今天 10:24",
    updated: "随应用",
  },
  {
    id: "markdown",
    ic: "file-code-2",
    c: "c3",
    title: "Markdown 扩展语法",
    desc: "编辑或创建文档时使用 Markdown 扩展语法（高亮块、公式、提示框、双链等）。",
    src: "builtin",
    mode: "auto",
    on: true,
    tokens: 31,
    files: ["SKILL.md"],
    tools: [],
    uses: 41,
    last: "昨天",
    updated: "随应用",
  },
  {
    id: "mindmap",
    ic: "network",
    c: "c4",
    title: "思维导图",
    desc: "创建思维导图、脑图、知识图谱或组织结构图。",
    src: "builtin",
    mode: "auto",
    on: true,
    tokens: 22,
    files: ["SKILL.md"],
    tools: [],
    uses: 9,
    last: "9/18",
    updated: "随应用",
  },
  {
    id: "frontend-design",
    ic: "palette",
    c: "c5",
    title: "frontend-design",
    desc: "Guidance for distinctive, intentional visual design when building new UI.",
    src: "linked",
    dir: "~/.claude/skills",
    mode: "manual",
    on: true,
    tokens: 0,
    files: ["SKILL.md", "reference/typography.md"],
    tools: [],
    uses: 2,
    last: "9/10",
    updated: "外部",
  },
  {
    id: "pdf",
    ic: "file-text",
    c: "c2",
    title: "pdf",
    desc: "Read, extract text/tables, merge or split PDF files.",
    src: "linked",
    dir: "~/.claude/skills",
    mode: "auto",
    on: false,
    tokens: 0,
    files: ["SKILL.md", "forms.md", "reference.md", "scripts/"],
    tools: [],
    uses: 0,
    last: "从未",
    updated: "外部",
  },
];
export const byId = id => SKILLS.find(s => s.id === id);
export const bySrc = src => SKILLS.filter(s => s.src === src);

export const SRC_TEXT = { mine: "我的", builtin: "内置", linked: "关联目录" };
export const MODE = {
  auto: ["sparkles", "自动", "AI 按描述自行决定何时加载"],
  manual: ["slash", "仅手动", "只在输入框里 / 选中时加载"],
  always: ["pin", "常驻", "每次对话都注入全文"],
};
export const modeBadge = s =>
  !s.on
    ? `<span class="s-mode off">已停用</span>`
    : `<span class="s-mode ${s.mode}"><i data-lucide="${MODE[s.mode][0]}"></i>${MODE[s.mode][1]}</span>`;
export const srcBadge = s =>
  s.src === "builtin"
    ? `<span class="s-src">内置</span>`
    : s.src === "linked"
      ? `<span class="s-src" title="${s.dir}"><i data-lucide="link-2"></i>${s.dir.replace("~/.", "").replace("/skills", "")}</span>`
      : "";

/* 上下文预算：自动模式下每个 Skill 的「名称 + 描述」常驻系统提示词 */
export function budget({ compact = false } = {}) {
  const on = SKILLS.filter(s => s.on && s.mode === "auto" && s.tokens);
  const total = on.reduce((a, s) => a + s.tokens, 0);
  const big = on.filter(s => s.tokens > 150).reduce((a, s) => a + s.tokens, 0);
  return `
  <div class="s-budget" title="自动模式的 Skill 会把名称和描述放进每次对话的系统提示词">
    <span>${compact ? "" : "常驻上下文 "}<b class="num">${total}</b> tokens</span>
    <div class="bar"><i class="a" style="width:${((total - big) / 1000) * 100}%"></i><i class="w" style="width:${(big / 1000) * 100}%"></i></div>
    ${compact ? "" : `<span class="lg"><i style="background:var(--ok)"></i>${on.length} 个自动 Skill</span><span class="lg"><i style="background:var(--warn)"></i>描述过长 1</span>`}
  </div>`;
}

/* ── 控制条 ── */
export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>Skill 管理页 · 样板间</b>
    ${PLANS.map(([h, n]) => `<a href="${h}" class="${h === current ? "on" : ""}">${n}</a>`).join("")}
    <span class="sp"></span>
    ${extraHTML}
    <span style="opacity:.7">缩放 <span id="mb-zoom">100%</span></span>
    <label>窗口宽 <select id="mb-width">
      <option value="1280">1280</option><option value="1440" selected>1440</option>
      <option value="1680">1680</option></select></label>
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
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("skill-mock-width");
  if (savedW) sel.value = savedW;
  const fit = () => {
    if (window.innerWidth < 100 || window.innerHeight < 100) return;
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
    bar.querySelector("#mb-zoom").textContent = Math.round(z * 100) + "%";
  };
  const apply = () => {
    localStorage.setItem("skill-mock-width", sel.value);
    document.querySelectorAll(".win").forEach(w => (w.style.width = sel.value + "px"));
    fit();
  };
  sel.onchange = apply;
  window.addEventListener("resize", fit);
  requestAnimationFrame(apply);
}

/* ── 详情头部 ── */
export function detailHead(s, { extraActs = "" } = {}) {
  const more =
    s.src === "builtin"
      ? "更多：复制为我的 Skill / 导出"
      : s.src === "linked"
        ? "更多：复制为我的 Skill / 在访达中显示"
        : "更多：导出 .zip / 在访达中显示 / 删除";
  return `
  <div class="x-dh">
    ${ic(s, true)}
    <div class="info">
      <h2>${s.title}${srcBadge(s)}</h2>
      <p class="desc mono" style="font-size:11.5px;color:var(--ink-3)">${s.src === "linked" ? s.dir + "/" : ""}${s.id}</p>
      <div class="meta">${modeBadge(s)}<span style="font-size:11.5px;color:var(--ink-3)">${s.files.length} 个文件 · 用过 ${s.uses} 次 · 最近 ${s.last}</span></div>
    </div>
    <div class="acts">
      <button class="btn" title="新建对话并强制加载这个 Skill"><i data-lucide="message-square-plus"></i>试一试</button>
      ${s.src === "mine" ? `<button class="btn" data-edit><i data-lucide="pencil"></i>编辑</button>` : `<button class="btn"><i data-lucide="copy"></i>复制为我的</button>`}
      <button class="ib" title="${more}"><i data-lucide="more-horizontal"></i></button>
      ${extraActs}
      <span style="width:6px"></span>${tg(s.on)}
    </div>
  </div>`;
}

export function tabs(s, active, list = ["overview", "files", "settings", "usage"]) {
  const L = {
    overview: ["概览"],
    files: ["文件", s.files.length],
    settings: ["设置"],
    usage: ["使用记录", s.uses],
  };
  return `<div class="x-tabs">${list.map(k => `<div class="x-tab ${k === active ? "on" : ""}" data-tab="${k}">${L[k][0]}${L[k][1] != null ? `<span class="num">${L[k][1]}</span>` : ""}</div>`).join("")}</div>`;
}

export function pane(s, tab, opts = {}) {
  if (tab === "files") return `<div class="s-editor boxed">${editor(s, opts)}</div>`;
  if (tab === "settings") return settingsPane(s);
  if (tab === "usage") return usagePane(s);
  return overviewPane(s);
}

/* ── 概览：何时触发 + SKILL.md 渲染 + 元信息 ── */
function warnBanner(s) {
  if (!s.warn) return "";
  const empty = !s.desc;
  return `<div class="x-banner" style="${empty ? "" : "background:var(--warn-soft);color:var(--warn)"}"><i data-lucide="${empty ? "circle-alert" : "triangle-alert"}"></i><div class="t"><b>${s.warn}</b>${empty ? `<div style="margin-top:4px;display:flex;gap:12px"><span class="x-link" data-edit>补写描述</span><span class="x-link">让 AI 根据正文生成</span></div>` : ""}</div></div>`;
}
export function overviewPane(s) {
  const kw = s.id === "weekly-report" ? ["周报", "本周总结", "这周做了什么"] : [];
  return `
  ${warnBanner(s)}
  <div class="s-ov">
    <div>
      <div class="s-trigger">
        <div class="h"><i data-lucide="radar"></i>AI 看到的描述 · 据此决定何时加载${s.mode === "auto" ? `<span style="margin-left:auto" class="num">${s.tokens} tokens</span>` : ""}</div>
        <div class="t">${s.desc || `<span style="color:var(--ink-3)">（空）</span>`}</div>
        ${kw.length ? `<div class="kw">${kw.map(k => `<span>「${k}」</span>`).join("")}</div>` : ""}
      </div>
      <div class="s-doc-bar"><i data-lucide="file-text" style="width:13px"></i>SKILL.md<span class="sp"></span><span class="x-link" data-tab="files">查看全部文件</span></div>
      <div class="s-doc">${docHTML(s)}</div>
    </div>
    <div class="s-meta">
      <div><div class="k">调用方式</div><div class="v">${modeBadge(s)}</div></div>
      <div><div class="k">用到的工具</div><div class="v chips">${s.tools.length ? s.tools.map(t => `<span>${t}</span>`).join("") : `<span style="background:none;padding:0;color:var(--ink-3);font-family:var(--font)">未声明</span>`}</div></div>
      <div><div class="k">文件</div><div class="files">${s.files.map(f => `<div><i data-lucide="${f.endsWith("/") ? "folder" : "file-text"}"></i>${f}</div>`).join("")}</div></div>
      <div><div class="k">位置</div><div class="v mono">${s.src === "builtin" ? "随应用内置（只读）" : s.src === "linked" ? `${s.dir}/${s.id}（只读）` : `~/Library/Application Support/Tau/skills/${s.id}`}</div></div>
      <div><div class="k">更新</div><div class="v">${s.updated}</div></div>
    </div>
  </div>`;
}
function docHTML(s) {
  if (s.id !== "weekly-report")
    return `<h3>${s.title}</h3><p style="color:var(--ink-2)">${s.desc || "这里是 SKILL.md 正文的渲染预览。"}</p><h4>使用步骤</h4><ol><li>……</li><li>……</li></ol>`;
  return `
    <h3>周报整理</h3>
    <p>把用户本周的记录整理成一份结构清晰、不编造的周报。</p>
    <h4>步骤</h4>
    <ol>
      <li>用 <code>sql_query</code> 取本周（周一 00:00 至今）的日记、已完成待办和日历事件</li>
      <li>按 <span class="ref">reference/分类规则.md</span> 把条目归入「工作 / 学习 / 生活」</li>
      <li>每类挑 3–5 条最重要的，合并同一件事的多条记录</li>
      <li>套用 <span class="ref">templates/weekly.md</span> 输出，结尾给出下周计划草稿</li>
    </ol>
    <h4>注意</h4>
    <ul>
      <li>只写有记录的事，缺失的部分直接留空并提示用户补充</li>
      <li>引用日记原文时使用 <code>:ref[标题]{id=… type=diary}</code></li>
    </ul>
    <p style="color:var(--ink-3);font-size:12px">示例输出见 <span class="ref">examples/2026-W38.md</span></p>`;
}

/* ── 编辑器：Skill 内文件树 + SKILL.md（frontmatter 表单 + 正文） ── */
export function editor(s, { source = false, file = "SKILL.md" } = {}) {
  const tree = s.files
    .map(f => {
      const depth = f.includes("/") ? 1 : 0;
      const name = f.split("/").pop() || f;
      const dir = f.includes("/") ? f.split("/")[0] : null;
      return { f, depth, name, dir };
    })
    .reduce(
      (acc, x) => {
        if (x.dir && !acc.seen.has(x.dir)) {
          acc.seen.add(x.dir);
          acc.html += `<div class="f"><i data-lucide="chevron-down"></i><i data-lucide="folder-open"></i>${x.dir}</div>`;
        }
        if (x.name)
          acc.html += `<div class="f ${x.f === file ? "on" : ""}" style="padding-left:${8 + x.depth * 18}px"><i data-lucide="${x.f === "SKILL.md" ? "sparkles" : "file-text"}"></i>${x.name}${x.f === "SKILL.md" ? `<span class="dirty" title="未保存"></span>` : ""}</div>`;
        return acc;
      },
      { html: "", seen: new Set() }
    ).html;
  return `
  <div class="s-tree">
    <div class="th">${s.id}<span class="sp"></span><i data-lucide="file-plus" title="新建文件"></i><i data-lucide="folder-plus" title="新建文件夹"></i></div>
    ${tree}
    <div class="tip">SKILL.md 以外的文件只在 AI 需要时按需读取，适合放长参考资料与模板。</div>
  </div>
  <div class="s-edit">
    <div class="s-edit-bar"><span class="path">${file}</span><span>· 未保存</span><span class="sp"></span>
      <span class="x-seg" style="padding:2px"><span class="${source ? "" : "on"}" data-src="0" style="padding:2px 10px">编辑</span><span class="${source ? "on" : ""}" data-src="1" style="padding:2px 10px">源码</span></span>
      <button class="btn primary" style="height:26px">保存<span class="kbd" style="margin-left:4px">⌘S</span></button></div>
    <div class="s-edit-body">${source ? sourceView(s) : visualView(s)}</div>
  </div>`;
}
function visualView(s) {
  const len = s.desc.length;
  return `
  <div class="s-fm">
    <div class="hd"><i data-lucide="settings-2"></i>基本信息（写入 frontmatter）<span class="sp"></span><span class="x-link" style="font-size:11.5px">＋ 高级字段</span></div>
    <div class="row2">
      <div class="x-field"><label>显示名称</label><div class="x-input">${s.title}</div></div>
      <div class="x-field"><label>标识 <span class="h">name · 小写字母、数字、连字符</span></label><div class="x-input mono">${s.id}</div></div>
    </div>
    <div class="x-field"><label>描述 <span class="h">写清「做什么」和「什么时候用」</span><span class="s-count">${len} / 1024</span></label>
      <div class="x-input area focus">${s.desc}</div>
      <div class="s-hint ok"><i data-lucide="check"></i>包含触发场景，AI 能据此判断何时加载</div></div>
  </div>
  <div class="s-body">
    <h3>周报整理</h3>
    <p>把用户本周的记录整理成一份结构清晰、不编造的周报。</p>
    <h4>步骤</h4>
    <ol>
      <li>用 <code>sql_query</code> 取本周（周一 00:00 至今）的日记、已完成待办和日历事件</li>
      <li>按 reference/分类规则.md 把条目归入「工作 / 学习 / 生活」</li>
      <li>每类挑 3–5 条最重要的，合并同一件事的多条记录<span class="caret"></span></li>
    </ol>
  </div>`;
}
function sourceView(s) {
  return `<div class="s-src-code"><span class="fm">---</span>
<span class="k">name</span>: ${s.id}
<span class="k">title</span>: ${s.title}
<span class="k">description</span>: ${s.desc}
<span class="k">allowed-tools</span>: ${s.tools.join(", ")}
<span class="fm">---</span>

# 周报整理

把用户本周的记录整理成一份结构清晰、不编造的周报。

## 步骤

1. 用 \`sql_query\` 取本周（周一 00:00 至今）的日记、已完成待办和日历事件
2. 按 reference/分类规则.md 把条目归入「工作 / 学习 / 生活」
3. 每类挑 3–5 条最重要的，合并同一件事的多条记录
</div>`;
}

/* ── 设置 ── */
export function settingsPane(s) {
  const ro = s.src !== "mine";
  const cb = (on, t, h) =>
    `<label><span class="cb ${on ? "on" : ""}">${on ? `<i data-lucide="check"></i>` : ""}</span>${t}${h ? `<span class="h">${h}</span>` : ""}</label>`;
  return `
  <div class="s-set">
    <div>
      <h4>调用方式</h4>
      <p class="d">决定 AI 什么时候读取这个 Skill。${ro ? "内置 / 关联的 Skill 也可以改调用方式，偏好只存在本机、不改原文件。" : ""}</p>
      <div class="s-modes">
        ${Object.entries(MODE)
          .map(
            ([k, [i, n, d]]) =>
              `<div class="o ${s.mode === k ? "on" : ""}"><b><i data-lucide="${i}"></i>${n}${k === "auto" ? `<span class="s-src" style="margin-left:auto">默认</span>` : ""}</b>${d}${k === "always" ? `，约占 <span class="num">1.8k</span> tokens` : ""}<div class="fm">${{ auto: "默认行为", manual: "disable-model-invocation: true", always: "本应用扩展" }[k]}</div></div>`
          )
          .join("")}
      </div>
    </div>
    <div>
      <h4>在哪些地方可用</h4>
      <p class="d">不勾选的场景里，AI 看不到这个 Skill。</p>
      <div class="s-checks">
        ${cb(true, "AI 对话", "")}
        ${cb(true, "项目学习对话", "")}
        ${cb(false, "编辑器行内 AI", "行内 AI 以短回复为主，默认不带 Skill")}
        ${cb(true, "视频笔记 / PDF 对话", "")}
      </div>
    </div>
    <div>
      <h4>允许使用的工具 <span style="font-weight:400;color:var(--ink-3);font-size:12px">allowed-tools · 可选</span></h4>
      <p class="d">加载这个 Skill 后，这些工具无需再次确认。留空 = 沿用对话里的工具设置。</p>
      <div class="x-args">${s.tools.map(t => `<span class="a">${t}<i data-lucide="x"></i></span>`).join("")}<span class="a add">＋ 工具</span></div>
    </div>
    ${
      ro
        ? `<div class="s-danger" style="border-color:var(--line-1)"><i data-lucide="lock" style="width:15px;color:var(--ink-3)"></i><span>${s.src === "builtin" ? "内置 Skill 随应用更新，正文只读" : "来自外部目录，正文只读，修改请在原工具里进行"}</span><span class="sp"></span><button class="btn"><i data-lucide="copy"></i>复制为我的 Skill</button></div>`
        : `<div class="s-danger"><span>删除后会移到废纸篓，可以从那里恢复</span><span class="sp"></span><button class="btn"><i data-lucide="download"></i>导出 .zip</button><button class="btn d"><i data-lucide="trash-2"></i>删除</button></div>`
    }
  </div>`;
}

/* ── 使用记录 ── */
export function usagePane(s) {
  const rows = [
    ["把本周日记整理成周报", "AI 对话 · Sonnet 5", "今天 10:24", "自动加载"],
    ["九月第三周复盘", "AI 对话 · Sonnet 5", "9/21", "自动加载"],
    ["/周报整理 只看工作部分", "AI 对话 · Opus 5.5", "9/20", "/ 手动"],
    ["项目「桌面端重构」周进展", "项目学习对话", "9/14", "自动加载"],
    ["这周做了什么？", "AI 对话 · Haiku 4.5", "9/13", "自动加载"],
  ];
  return `
  <div class="s-stats">
    <div><div class="n num">${s.uses}</div><div class="k">累计加载</div></div>
    <div><div class="n num">87%</div><div class="k">AI 自动触发占比</div></div>
    <div><div class="k">近 8 周</div><div class="s-spark">${[2, 3, 1, 4, 3, 2, 5, 3].map((h, i) => `<i class="${i === 6 ? "hi" : ""}" style="height:${h * 7}px"></i>`).join("")}</div></div>
  </div>
  <div class="x-tools-bar"><span style="font-size:12px;color:var(--ink-3)">最近加载过这个 Skill 的对话</span></div>
  ${rows.map(([t, w, d, how]) => `<div class="s-use"><i data-lucide="message-circle" style="width:15px;color:var(--ink-3)"></i><div class="m"><div class="t">${t}</div><div class="s">${w}</div></div><span class="how">${how}</span><span class="num" style="color:var(--ink-3);font-size:11.5px;width:70px;text-align:right">${d}</span><i data-lucide="arrow-up-right" style="width:14px;color:var(--ink-3)"></i></div>`).join("")}
  <p style="font-size:11.5px;color:var(--ink-3);margin-top:12px">数据来自对话里的 Skill 加载记录，只统计本机。</p>`;
}

/* ── 添加 Skill 弹窗（三种方案共用） ── */
export function addDialog(tab = "new") {
  const T = [
    ["new", "新建"],
    ["ai", "用 AI 创建"],
    ["import", "导入"],
    ["link", "关联目录"],
  ];
  let body = "",
    foot = "";
  if (tab === "new") {
    const tpls = [
      ["file", "c5", "空白", "只有 frontmatter 与一级标题", true],
      ["list-checks", "c1", "流程类", "分步骤完成一件事（周报、复盘、出题）"],
      ["book-marked", "c3", "参考资料类", "SKILL.md 做索引，细节放 reference/"],
      ["ruler", "c2", "格式规范类", "输出格式、语气、模板约束"],
    ];
    body = `
      <div class="x-form" style="max-width:none">
        <div class="s-fm" style="margin:0;border:0;padding:0">
          <div class="row2">
            <div class="x-field"><label>显示名称</label><div class="x-input focus">会议纪要</div></div>
            <div class="x-field"><label>标识 <span class="h">自动生成，可改</span></label><div class="x-input mono">meeting-notes</div></div>
          </div>
          <div class="x-field"><label>描述 <span class="h">做什么 + 什么时候用</span></label><div class="x-input area"><span class="ph">例如：把会议录音转写整理成纪要，包含决议与待办。用户提到「会议纪要」「整理会议」时使用。</span></div></div>
        </div>
        <div class="x-field"><label>从模板开始</label><div class="s-tpl">${tpls.map(([i, c, n, d, on]) => `<div class="x-dir ${on ? "on" : ""}"><span class="x-ic ${c}"><i data-lucide="${i}"></i></span><div class="m"><div class="n">${n}</div><div class="d">${d}</div></div></div>`).join("")}</div></div>
      </div>`;
    foot = `<button class="btn primary">创建并编辑</button>`;
  }
  if (tab === "ai") {
    body = `
      <div class="s-ai-chat">
        <div class="a">说说你想让 AI 学会什么？可以直接贴一次满意的对话，我会把其中的做法提炼成 Skill。</div>
        <div class="u">每次开完会我会把录音转写贴进来，希望整理成纪要：先写结论和决议，再列待办（带负责人和截止日期），最后是讨论要点。</div>
        <div class="a">明白了，我起草了一个 Skill，你可以直接保存，或继续告诉我要改的地方：
          <div class="draft">
            <div class="dh"><span class="x-ic c1" style="width:24px;height:24px;border-radius:7px"><i data-lucide="sparkles" style="width:13px"></i></span><b>会议纪要</b><span class="mono" style="font-size:11px;color:var(--ink-3)">meeting-notes</span><span class="sp"></span><span class="x-link">展开 SKILL.md</span></div>
            <div style="font-size:12px;color:var(--ink-2)">把会议转写整理成纪要：结论与决议 → 待办（负责人 / 截止日期）→ 讨论要点。用户贴出会议转写或提到「会议纪要」时使用。</div>
            <div style="display:flex;gap:6px;margin-top:8px"><span class="s-src">SKILL.md</span><span class="s-src">templates/minutes.md</span></div>
          </div>
        </div>
      </div>`;
    foot = `<button class="btn">在编辑器中打开</button><button class="btn primary">保存 Skill</button>`;
  }
  if (tab === "import") {
    body = `
      <div class="s-drop"><i data-lucide="upload"></i><b>拖入 .zip / .skill 文件或 Skill 文件夹</b>包内需要有 SKILL.md；一个包里有多个 Skill 会逐个列出<button class="btn" style="margin-top:6px">选择文件…</button></div>
      <div class="s-or">或从链接导入</div>
      <div class="x-field"><label>GitHub 仓库或目录链接</label><div class="x-input mono">https://github.com/anthropics/skills/tree/main/skills/docx<span style="flex:1"></span><button class="btn" style="height:24px">解析</button></div></div>
      <div class="x-import-list">
        <div class="r"><i data-lucide="check" style="color:var(--ok)"></i>docx<span class="s-src">5 个文件</span><span style="color:var(--ink-3);font-size:11.5px">Create, edit and analyze Word documents</span><span class="sp"></span>${tg(true, true)}</div>
        <div class="r"><i data-lucide="triangle-alert" style="color:var(--warn)"></i>docx-scripts<span class="s-src">含 scripts/</span><span class="warn">本应用不执行脚本，仅作参考资料导入</span><span class="sp"></span>${tg(true, true)}</div>
      </div>`;
    foot = `<button class="btn primary">导入 2 个</button>`;
  }
  if (tab === "link") {
    const dirs = [
      ["Claude Code", "~/.claude/skills", "发现 6 个", true],
      ["通用 Agent Skills", "~/.agents/skills", "发现 2 个", false],
      ["Codex", "~/.codex/skills", "发现 3 个", false],
      ["自定义目录…", "选择任意文件夹", "", false],
    ];
    body = `
      <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">和其它 AI 工具共用同一份 Skill：关联后<b>只读</b>显示在「关联目录」分组里，原文件改了这里自动更新；想改就「复制为我的」。</p>
      ${dirs.map(([n, p, c, on]) => `<div class="s-link-dir"><span class="x-ic ${on ? "c1" : ""}"><i data-lucide="${p.startsWith("~") ? "folder-symlink" : "folder-plus"}"></i></span><div class="m"><div class="n">${n}</div><div class="p">${p}</div></div><span class="c">${c}</span>${p.startsWith("~") ? tg(on, true) : `<button class="btn">选择…</button>`}</div>`).join("")}
      <p style="font-size:11.5px;color:var(--ink-3);margin:10px 0 0">同名时「我的」优先于「关联目录」，内置最优先。</p>`;
    foot = `<button class="btn primary">完成</button>`;
  }
  return `
  <div class="scrim" data-close></div>
  <div class="x-dialog">
    <div class="dh"><b>添加 Skill</b><span class="sp"></span><button class="ib" data-close><i data-lucide="x"></i></button></div>
    <div class="x-tabs">${T.map(([k, l]) => `<div class="x-tab ${k === tab ? "on" : ""}" data-add="${k}">${l}</div>`).join("")}</div>
    <div class="db">${body}</div>
    <div class="df">
      <span class="h"><i data-lucide="info"></i>Skill 是一份说明文档，教 AI 按你的方式做事；遵循 Agent Skills 开放格式</span>
      <span class="sp"></span>
      <button class="btn" data-close>取消</button>
      ${foot}
    </div>
  </div>`;
}

/* ── 输入框 / 斜杠菜单：手动调用 Skill ── */
export function slashMenu(style) {
  const list = SKILLS.filter(s => s.on).slice(0, 6);
  return `
  <div class="s-slash" style="${style}">
    <div class="ph">Skill<span class="sp"></span><span>↑↓ 选择 · Enter 加载</span></div>
    ${list
      .map(
        (s, i) =>
          `<div class="r ${i === 0 ? "on" : ""}">${ic(s)}<div class="m"><div class="n">${s.title}<span class="k">/${s.id}</span></div><div class="d">${s.desc || "（无描述）"}</div></div>${s.mode === "manual" ? `<span class="s-mode manual" style="height:18px">仅手动</span>` : ""}</div>`
      )
      .join("")}
    <div class="sep"></div>
    <div class="foot"><i data-lucide="settings-2" style="width:13px;height:13px"></i><span class="x-link" style="font-size:11.5px">管理 Skill</span><span class="sp"></span>输入 / 后继续打字可筛选</div>
  </div>`;
}

/* ── 编辑页右侧「试一试」对话 ── */
export function tryPanel() {
  return `
  <div class="s-try">
    <div class="hd"><i data-lucide="flask-conical" style="width:14px"></i>试一试<span style="font-weight:400;color:var(--ink-3);font-size:11.5px">用未保存的版本</span><span class="sp"></span><button class="ib" title="清空"><i data-lucide="rotate-ccw"></i></button></div>
    <div class="bd md" style="font-size:12.5px">
      <div class="msg msg-user"><div class="bubble">这周做了什么？</div></div>
      <div class="s-loaded"><i data-lucide="sparkles"></i>已加载 Skill <b>周报整理</b> · 自动</div>
      <div class="s-loaded" style="margin-left:6px"><i data-lucide="database"></i>sql_query × 3</div>
      <p><b>本周周报（9/21 – 9/26）</b></p>
      <p><b>工作</b>：完成 MCP 服务器页重构（D-058）；对话块预览改为统一预览框……</p>
      <p style="color:var(--ink-3)">……</p>
    </div>
    <div class="ft"><div class="composer"><textarea rows="1" placeholder="用这个 Skill 发一条消息试试"></textarea><div class="row"><button class="model">Sonnet 5<i data-lucide="chevron-down"></i></button><span class="sp"></span><button class="send"><i data-lucide="arrow-up"></i></button></div></div></div>
  </div>`;
}

/* ── 通用：整页编辑器（B / C 从列表推入） ── */
export function editPage(s, { source = false, withTry = true } = {}) {
  return `
  <div class="s-page">
    <div class="s-page-head">
      <button class="ib" data-back title="返回"><i data-lucide="arrow-left"></i></button>
      ${ic(s)}
      <div class="t">${s.title}<span class="mono" style="font-weight:400;font-size:11.5px;color:var(--ink-3)">${s.id}</span></div>
      <span class="sp"></span>
      <span class="saved">上次保存 9/24 21:10</span>
      <button class="btn"><i data-lucide="settings-2"></i>设置</button>
      ${tg(s.on)}
    </div>
    <div style="flex:1;display:flex;min-height:0">
      <div class="s-editor" style="border-top:0">${editor(s, { source })}</div>
      ${withTry ? tryPanel() : ""}
    </div>
  </div>`;
}

/* ── 对话页里的斜杠菜单场景（三套方案共用：Skill 的手动调用入口） ── */
export function slashScene() {
  return `
  <section class="paper" style="flex:1;display:flex;flex-direction:column;position:relative">
    <div class="thread" style="flex:1"><div class="thread-inner" style="max-width:760px">
      <div class="msg msg-user"><div class="bubble">这周做了什么？帮我整理一下</div></div>
      <div class="msg"><div class="ai-meta"><span class="ai-avatar"><i data-lucide="sparkles"></i></span>Claude Sonnet 5<span>·</span><span class="num">10:24</span></div>
        <div class="s-loaded"><i data-lucide="sparkles"></i>已加载 Skill <b>周报整理</b> · AI 自动选择<i data-lucide="chevron-right" style="color:var(--ink-3)"></i></div>
        <div class="md"><p><b>本周周报（9/21 – 9/26）</b></p><p><b>工作</b>：完成 MCP 服务器页重构；对话块预览改为统一预览框；移除终端、EPUB 阅读器等 4 个旧功能。</p><p><b>学习</b>：读完《深度工作》第 3 章，新增 12 张卡片……</p></div>
      </div>
    </div></div>
    <div class="composer-wrap"><div class="composer focus" style="max-width:760px">
      <div class="ctx"><span class="chip on"><i data-lucide="sparkles"></i>周报整理<i data-lucide="x"></i></span></div>
      <textarea rows="2">/</textarea>
      <div class="row"><button class="ib"><i data-lucide="paperclip"></i></button><button class="ib"><i data-lucide="at-sign"></i></button><button class="ib" title="＋ 面板：MCP / Skill"><i data-lucide="plus"></i></button><button class="model">Sonnet 5<i data-lucide="chevron-down"></i></button><span class="sp"></span><span class="ring"></span><button class="send"><i data-lucide="arrow-up"></i></button></div>
    </div></div>
  </section>`;
}
