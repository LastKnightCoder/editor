/* MCP 配置页样板间 · 共享数据与渲染 */
import { titlebar, anno, icons } from "../chat/shared.js?v=3";
export { titlebar, anno, icons };

const PLANS = [
  ["index.html", "总览与决策"],
  ["a-split.html", "方案 A 列表 + 详情"],
  ["b-gallery.html", "方案 B 卡片库 + 抽屉"],
  ["c-rows.html", "方案 C 单列展开"],
];

/* ── 数据：内置 = src/mcp/providers 的真实清单；自定义 = 常见第三方服务器 ── */
export const BUILTIN = [
  {
    id: "sql",
    ic: "database",
    c: "c2",
    name: "只读 SQL 查询",
    desc: "对本地数据库执行只读 SQL，查询卡片 / 日记 / 待办 / 日历等数据",
    tools: ["sql_query"],
    on: true,
  },
  {
    id: "content",
    ic: "pen-line",
    c: "c1",
    name: "内容编辑",
    desc: "全文改写、范围定位、批量编辑和快速创作",
    tools: [
      "get_content_markdown",
      "find_content_ranges",
      "replace_content_by_text",
      "apply_content_edit_operations",
      "rewrite_content_full",
    ],
    on: true,
    write: true,
  },
  {
    id: "calendar",
    ic: "calendar",
    c: "c3",
    name: "日历",
    desc: "日历分组、日历和日历事件的增删改（查询走 sql_query）",
    tools: [
      "create_calendar_group",
      "update_calendar_group",
      "delete_calendar_group",
      "create_calendar",
      "update_calendar",
      "archive_calendar",
      "delete_calendar",
      "merge_calendars",
      "toggle_calendar_visibility",
      "create_calendar_event",
      "update_calendar_event",
      "delete_calendar_event",
    ],
    on: true,
    write: true,
  },
  {
    id: "video",
    ic: "video",
    c: "c4",
    name: "视频笔记",
    desc: "视频笔记的转录、总结与时间片段查询",
    tools: ["get_video_note_summary", "search_video_note_transcript"],
    on: true,
  },
  {
    id: "fetch",
    ic: "globe",
    c: "c2",
    name: "网络请求",
    desc: "通用 HTTP 请求",
    tools: ["http_fetch"],
    on: true,
  },
  {
    id: "fs",
    ic: "folder-open",
    c: "c5",
    name: "文件系统",
    desc: "读取纯文本文件与本地 / 远程图片（供视觉分析）",
    tools: ["read_file", "read_image"],
    on: false,
  },
  {
    id: "image",
    ic: "image",
    c: "c1",
    name: "图片生成",
    desc: "图片生成与编辑（使用「设置 → 模型」里的 OpenAI 兼容服务）",
    tools: ["generate_image", "edit_image"],
    on: true,
    needs: "需要在模型设置中配置图片模型",
  },
];

export const CUSTOM = [
  {
    id: "c-fs",
    ic: "hard-drive",
    c: "c5",
    name: "filesystem",
    desc: "官方文件系统服务器：在允许的目录内读写文件",
    type: "stdio",
    cmd: "npx -y @modelcontextprotocol/server-filesystem ~/Notes",
    status: "connected",
    tools: FS_TOOLS(),
    on: true,
  },
  {
    id: "c-gh",
    ic: "git-pull-request",
    c: "c4",
    name: "github",
    desc: "Issues / PR / 仓库检索（远程托管）",
    type: "http",
    cmd: "https://api.githubcopilot.com/mcp/",
    status: "connected",
    tools: [
      "search_repositories",
      "get_issue",
      "list_issues",
      "create_issue",
      "get_pull_request",
      "list_pull_requests",
      "create_pull_request_review",
      "get_file_contents",
      "search_code",
    ],
    on: true,
  },
  {
    id: "c-chart",
    ic: "bar-chart-3",
    c: "c2",
    name: "antv-chart",
    desc: "AntV 图表生成：折线 / 柱状 / 饼图 / 思维导图等",
    type: "stdio",
    cmd: "npx -y @antv/mcp-server-chart",
    status: "connecting",
    tools: [],
    on: true,
  },
  {
    id: "c-ctx7",
    ic: "book-marked",
    c: "c3",
    name: "context7",
    desc: "拉取第三方库的最新文档",
    type: "http",
    cmd: "https://mcp.context7.com/mcp",
    status: "error",
    err: "401 Unauthorized：请求头缺少 CONTEXT7_API_KEY",
    tools: ["resolve-library-id", "get-library-docs"],
    on: true,
  },
  {
    id: "c-think",
    ic: "brain",
    c: "c1",
    name: "sequential-thinking",
    desc: "结构化分步思考",
    type: "stdio",
    cmd: "npx -y @modelcontextprotocol/server-sequential-thinking",
    status: "disabled",
    tools: ["sequentialthinking"],
    on: false,
  },
];
function FS_TOOLS() {
  return [
    "read_text_file",
    "read_multiple_files",
    "write_file",
    "edit_file",
    "create_directory",
    "list_directory",
    "directory_tree",
    "move_file",
    "search_files",
    "get_file_info",
    "list_allowed_directories",
  ];
}
const TOOL_DESC = {
  read_text_file: [
    "读取文本文件的完整内容，可用 head / tail 截取",
    ["path", "head", "tail"],
    ["path"],
  ],
  read_multiple_files: ["一次读取多个文件", ["paths"], ["paths"]],
  write_file: ["创建或覆盖文件", ["path", "content"], ["path", "content"]],
  edit_file: ["按行做精确替换，返回 git 风格 diff", ["path", "edits", "dryRun"], ["path", "edits"]],
  create_directory: ["创建目录（含多级）", ["path"], ["path"]],
  list_directory: ["列出目录内容", ["path"], ["path"]],
  directory_tree: ["以 JSON 树返回目录结构", ["path"], ["path"]],
  move_file: ["移动或重命名文件", ["source", "destination"], ["source", "destination"]],
  search_files: [
    "按 glob 递归搜索文件",
    ["path", "pattern", "excludePatterns"],
    ["path", "pattern"],
  ],
  get_file_info: ["文件大小 / 时间 / 权限等元信息", ["path"], ["path"]],
  list_allowed_directories: ["列出允许访问的目录", [], []],
};
const WRITE_RE = /^(write|edit|create|move|delete|update|merge|archive|rewrite|replace|apply)/;
export const ALL = [
  ...BUILTIN.map(s => ({ ...s, builtin: true, status: s.on ? "connected" : "disabled" })),
  ...CUSTOM,
];
export const byId = id => ALL.find(s => s.id === id);

export const STATUS_TEXT = {
  connected: "已连接",
  connecting: "连接中",
  error: "连接失败",
  disabled: "已停用",
};

/* ── 控制条 ── */
export function mockBar(current, extraHTML = "") {
  const bar = document.createElement("div");
  bar.className = "mock-bar";
  bar.innerHTML = `
    <b>MCP 配置页 · 样板间</b>
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
  document.body.classList.add("no-anno");
  bar.querySelector("#mb-anno").onclick = () => document.body.classList.toggle("no-anno");
  bar.querySelector("#mb-note").onclick = () => {
    document.body.classList.toggle("no-note");
    fit();
  };
  const sel = bar.querySelector("#mb-width");
  const savedW = localStorage.getItem("mcp-mock-width");
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
    localStorage.setItem("mcp-mock-width", sel.value);
    document.querySelectorAll(".win").forEach(w => (w.style.width = sel.value + "px"));
    fit();
  };
  sel.onchange = apply;
  window.addEventListener("resize", fit);
  requestAnimationFrame(apply);
}

/* ── 侧栏：nav = "own"（AI 组新增 MCP 条目）| "merged"（Skill 与 MCP 合为「AI 能力」） ── */
export function sidebar(nav = "own", active = null) {
  const ai =
    nav === "merged"
      ? [
          ["message-circle", "AI 对话"],
          ["blocks", "AI 能力", true],
        ]
      : [
          ["message-circle", "AI 对话"],
          ["sparkles", "Skill 管理"],
          ["plug", "MCP 服务器", true, "1"],
        ];
  const groups = [
    [
      "工作台",
      [
        ["flame", "今日"],
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
        ["file-text", "文章"],
        ["pen-line", "日记"],
        ["presentation", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["circle-help", "问题管理"],
        ["book-open", "微信读书"],
      ],
    ],
    ["AI", ai],
    [
      "工具",
      [
        ["bar-chart-3", "统计"],
        ["send", "发布"],
      ],
    ],
  ];
  return `
  <aside class="sb">
    <div class="sb-head"><div class="sb-logo">τ</div><span>Tau</span></div>
    <div class="sb-scroll">
      ${groups
        .map(
          ([g, items]) => `
        <div class="sb-group"><div class="sb-gt">${g}</div>
          ${items.map(([ic, label, on, badge]) => `<div class="sb-item ${(active ? label === active : on) ? "on" : ""}"><i data-lucide="${ic}"></i><span>${label}</span>${badge ? `<em class="badge num" style="background:var(--danger-soft);color:var(--danger)" title="1 个服务器连接失败">${badge}</em>` : ""}</div>`).join("")}
        </div>`
        )
        .join("")}
    </div>
    <div class="sb-item"><i data-lucide="sliders-horizontal"></i><span>设置</span></div>
  </aside>`;
}

/* ── 原子 ── */
export const ic = (s, lg = false) =>
  `<span class="x-ic ${s.c} ${lg ? "lg" : ""}"><i data-lucide="${s.ic}"></i></span>`;
export const tg = (on, sm = false) =>
  `<span class="tg ${on ? "on" : ""} ${sm ? "sm" : ""}"></span>`;
export const typeBadge = s =>
  s.builtin ? `<span class="badge-t">内置</span>` : `<span class="badge-t">${s.type}</span>`;
export function statusPill(s) {
  const n = s.tools.length;
  const t =
    s.status === "connected" ? `${STATUS_TEXT.connected} · ${n} 个工具` : STATUS_TEXT[s.status];
  return `<span class="pill ${s.status}"><span class="dot ${s.status}"></span>${t}</span>`;
}
export function subline(s) {
  if (s.status === "error")
    return `<span style="color:var(--danger)">连接失败 · 点开查看原因</span>`;
  if (s.status === "connecting") return "连接中…";
  if (s.status === "disabled") return "已停用";
  return `${s.tools.length} 个工具${s.builtin ? "" : " · " + s.type}`;
}

/* ── 详情：头部 + 标签页 ── */
export function detailHead(s) {
  const acts = s.builtin
    ? `${tg(s.on)}`
    : `<button class="ib" title="重新连接"><i data-lucide="refresh-cw"></i></button>
       <button class="ib" title="更多：复制为 JSON / 导出 / 删除"><i data-lucide="more-horizontal"></i></button>
       <span style="width:6px"></span>${tg(s.on)}`;
  return `
  <div class="x-dh">
    ${ic(s, true)}
    <div class="info">
      <h2>${s.name}${typeBadge(s)}</h2>
      <p class="desc">${s.desc}</p>
      <div class="meta">${statusPill(s)}${s.builtin ? "" : `<span class="mono" style="font-size:11.5px;color:var(--ink-3)">${s.cmd}</span>`}</div>
    </div>
    <div class="acts">${acts}</div>
  </div>`;
}

export function tabs(s, active) {
  const list = s.builtin
    ? [["tools", "工具", s.tools.length]]
    : [
        ["tools", "工具", s.tools.length || "–"],
        ["config", "配置"],
        ["logs", "日志"],
      ];
  return `<div class="x-tabs">${list.map(([k, l, n]) => `<div class="x-tab ${k === active ? "on" : ""}" data-tab="${k}">${l}${n != null ? `<span class="num">${n}</span>` : ""}</div>`).join("")}</div>`;
}

export function pane(s, tab) {
  if (tab === "config") return configPane(s);
  if (tab === "logs") return logsPane(s);
  return toolsPane(s);
}

function banner(s) {
  if (s.status === "error")
    return `<div class="x-banner"><i data-lucide="circle-alert"></i><div class="t"><b>连接失败</b> · <code>${s.err}</code><div style="margin-top:4px;display:flex;gap:12px"><span class="x-link" data-tab="config">去配置请求头</span><span class="x-link" data-tab="logs">查看日志</span></div></div><button class="btn" style="height:26px;background:var(--surface)"><i data-lucide="refresh-cw"></i>重试</button></div>`;
  if (s.needs)
    return `<div class="x-banner info"><i data-lucide="info"></i><div class="t">${s.needs} · <span class="x-link">前往设置</span></div></div>`;
  if (s.status === "connecting")
    return `<div class="x-banner info"><i data-lucide="loader"></i><div class="t">正在启动 <code>npx -y @antv/mcp-server-chart</code>，首次需要下载依赖，可能需要十几秒…</div></div>`;
  return "";
}

function toolsPane(s) {
  if (s.status === "connecting")
    return (
      banner(s) +
      `<div class="x-empty" style="padding-top:60px"><i data-lucide="plug-zap" style="width:28px;height:28px;color:var(--ink-3)"></i><p>连接成功后会在这里列出服务器提供的工具</p></div>`
    );
  const offSet = new Set(s.id === "c-fs" ? ["move_file"] : []);
  return `
  ${banner(s)}
  <div class="x-tools-bar">
    <div class="x-search"><i data-lucide="search"></i>筛选工具</div>
    <span class="sp"></span>
    <span style="font-size:12px;color:var(--ink-3)">${s.tools.length - offSet.size} / ${s.tools.length} 已启用</span>
    <button class="btn" title="批量：全部启用 / 全部停用 / 写操作都要确认">批量<i data-lucide="chevron-down"></i></button>
  </div>
  ${s.tools
    .map(t => {
      const [d, params, req] = TOOL_DESC[t] || ["", [], []];
      const ask = WRITE_RE.test(t);
      const off = offSet.has(t);
      return `
    <div class="x-tool ${off ? "off" : ""}">
      <div class="m">
        <div class="tn">${t}${ask ? `<i data-lucide="pencil" style="width:12px;height:12px;color:var(--warn)" title="写操作"></i>` : ""}</div>
        ${d ? `<div class="td">${d}</div>` : ""}
        ${params.length ? `<div class="params">${params.map(p => `<span class="${req.includes(p) ? "req" : ""}">${p}</span>`).join("")}</div>` : ""}
      </div>
      <span class="x-appr ${ask ? "ask" : ""}" title="执行前是否需要确认">${ask ? `<i data-lucide="hand"></i>每次询问` : `<i data-lucide="zap"></i>自动执行`}<i data-lucide="chevron-down"></i></span>
      ${tg(!off, true)}
    </div>`;
    })
    .join("")}`;
}

function configPane(s) {
  const stdio = s.type === "stdio";
  const [bin, ...args] = s.cmd.split(" ");
  return `
  ${s.status === "error" ? banner(s) : ""}
  <div class="x-form">
    <div class="x-field"><label>名称</label><div class="x-input">${s.name}</div></div>
    <div class="x-field"><label>描述 <span class="h">可选</span></label><div class="x-input">${s.desc}</div></div>
    <div class="x-field"><label>传输方式</label>
      <div class="x-seg"><span class="${stdio ? "on" : ""}"><i data-lucide="terminal"></i>本地进程 stdio</span><span class="${stdio ? "" : "on"}"><i data-lucide="cloud"></i>远程 HTTP</span></div>
    </div>
    ${
      stdio
        ? `
    <div class="x-field"><label>命令</label><div class="x-input mono">${bin}</div></div>
    <div class="x-field"><label>参数 <span class="h">每项一个参数，回车添加，可拖拽排序</span></label>
      <div class="x-args">${args.map(a => `<span class="a">${a}<i data-lucide="x"></i></span>`).join("")}<span class="a add">＋ 参数</span></div></div>
    <div class="x-field"><label>环境变量 <span class="h">值默认遮蔽，存入系统钥匙串</span></label>
      <div class="x-kv">
        <div class="r hd"><div>名称</div><div>值</div><div></div></div>
        <div class="r"><div>NODE_OPTIONS</div><div>--max-old-space-size=2048</div><div class="x"><i data-lucide="x"></i></div></div>
        <div class="r"><div class="ph">KEY</div><div class="ph">value</div><div></div></div>
      </div></div>
    <div class="x-field"><label>工作目录 <span class="h">可选</span></label><div class="x-input mono"><span class="ph">默认：应用数据目录</span><span style="flex:1"></span><i data-lucide="folder" style="color:var(--ink-3)"></i></div></div>`
        : `
    <div class="x-field"><label>URL</label><div class="x-input mono">${s.cmd}</div></div>
    <div class="x-field"><label>请求头 <span class="h">值默认遮蔽，存入系统钥匙串</span></label>
      <div class="x-kv">
        <div class="r hd"><div>名称</div><div>值</div><div></div></div>
        ${
          s.status === "error"
            ? `<div class="r"><div class="ph">CONTEXT7_API_KEY</div><div class="x-input focus" style="border:0;box-shadow:none;min-height:0;padding:0"><span class="ph">粘贴 API Key</span></div><div></div></div>`
            : `<div class="r"><div>Authorization</div><div>Bearer ••••••••••••3f9a<i data-lucide="eye"></i></div><div class="x"><i data-lucide="x"></i></div></div>`
        }
        <div class="r"><div class="ph">Header</div><div class="ph">value</div><div></div></div>
      </div></div>`
    }
    <div class="x-form-foot">
      <span class="x-link"><i data-lucide="braces"></i>以 JSON 编辑</span>
      <span class="sp"></span>
      <button class="btn">撤销</button>
      <button class="btn primary">保存并重连</button>
    </div>
  </div>`;
}

function logsPane(s) {
  const lines =
    s.status === "error"
      ? `<span class="tm">10:31:02</span> 连接 https://mcp.context7.com/mcp（streamable-http）
<span class="tm">10:31:03</span> <span class="err">POST /mcp → 401 Unauthorized</span>
<span class="tm">10:31:03</span> <span class="err">{"error":"missing CONTEXT7_API_KEY header"}</span>
<span class="tm">10:31:05</span> <span class="wa">第 1 次自动重连…</span>
<span class="tm">10:31:09</span> <span class="wa">第 2 次自动重连…</span>
<span class="tm">10:31:17</span> <span class="err">已放弃自动重连（3/3），等待手动重试</span>`
      : `<span class="tm">09:12:40</span> 启动进程 npx -y @modelcontextprotocol/server-filesystem ~/Notes
<span class="tm">09:12:42</span> [stderr] Secure MCP Filesystem Server running on stdio
<span class="tm">09:12:42</span> [stderr] Allowed directories: [ '/Users/t.xiong/Notes' ]
<span class="tm">09:12:42</span> <span class="ok">initialize 完成 · protocol 2025-06-18</span>
<span class="tm">09:12:42</span> <span class="ok">tools/list → 11 个工具</span>
<span class="tm">10:24:07</span> tools/call read_text_file { path: "~/Notes/周报.md" } · 38 ms
<span class="tm">10:24:09</span> tools/call search_files { pattern: "*.md" } · 112 ms`;
  return `
  <div class="x-tools-bar"><span style="font-size:12px;color:var(--ink-3)">最近 200 行 · 仅本次运行</span><span class="sp"></span><button class="btn"><i data-lucide="copy"></i>复制</button><button class="btn"><i data-lucide="trash-2"></i>清空</button></div>
  <div class="x-log">${lines}</div>`;
}

/* ── 添加服务器弹窗 ── */
const DIRECTORY = [
  ["hard-drive", "c5", "Filesystem", "在允许的目录内读写文件", "stdio", "官方"],
  ["git-pull-request", "c4", "GitHub", "Issues / PR / 代码检索", "http", "官方"],
  ["book-marked", "c3", "Context7", "第三方库最新文档", "http", ""],
  ["monitor", "c2", "Playwright", "驱动浏览器打开网页、截图、填表", "stdio", "官方"],
  ["bar-chart-3", "c2", "AntV Chart", "生成 25+ 种图表", "stdio", ""],
  ["brain", "c1", "Sequential Thinking", "结构化分步思考", "stdio", "官方"],
  ["search", "c1", "Brave Search", "网页搜索", "stdio", "需 Key"],
  ["notebook-pen", "c4", "Notion", "读写 Notion 页面与数据库", "http", "OAuth"],
];
export function addDialog(tab = "dir") {
  const t = [
    ["dir", "常用服务器"],
    ["form", "手动填写"],
    ["json", "粘贴 JSON"],
  ];
  let body = "";
  if (tab === "dir")
    body = `
      <div class="x-search" style="margin-bottom:12px"><i data-lucide="search"></i>搜索常用服务器</div>
      <div class="x-dir-grid">${DIRECTORY.map(
        ([i, c, n, d, ty, tag], k) => `
        <div class="x-dir ${k === 3 ? "on" : ""}"><span class="x-ic ${c}"><i data-lucide="${i}"></i></span>
          <div class="m"><div class="n">${n}<span class="badge-t">${ty}</span>${tag ? `<span class="badge-t">${tag}</span>` : ""}</div><div class="d">${d}</div></div></div>`
      ).join("")}
      </div>
      <p style="font-size:11.5px;color:var(--ink-3);margin:12px 0 0">选中后跳到「手动填写」并预填命令 / URL，只需补齐 Key 或目录。清单随应用内置，不联网拉取。</p>`;
  if (tab === "form")
    body = `
      <div class="x-banner info" style="margin-bottom:14px"><i data-lucide="sparkles"></i><div class="t">已按 <b>Playwright</b> 预填，确认后保存</div></div>
      <div class="x-form">
        <div class="x-field"><label>名称</label><div class="x-input">playwright</div></div>
        <div class="x-field"><label>传输方式</label><div class="x-seg"><span class="on"><i data-lucide="terminal"></i>本地进程 stdio</span><span><i data-lucide="cloud"></i>远程 HTTP</span></div></div>
        <div class="x-field"><label>命令</label><div class="x-input mono">npx</div></div>
        <div class="x-field"><label>参数</label><div class="x-args"><span class="a">-y<i data-lucide="x"></i></span><span class="a">@playwright/mcp@latest<i data-lucide="x"></i></span><span class="a add">＋ 参数</span></div></div>
        <div class="x-field"><label>环境变量 <span class="h">可选</span></label><div class="x-kv"><div class="r"><div class="ph">KEY</div><div class="ph">value</div><div></div></div></div></div>
      </div>`;
  if (tab === "json")
    body = `
      <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">兼容 Claude Desktop / Cursor / VS Code 的 <code>mcpServers</code> 格式，可一次导入多个</div>
<pre class="x-code">{
  <span class="k">"mcpServers"</span>: {
    <span class="k">"playwright"</span>: { <span class="k">"command"</span>: <span class="s">"npx"</span>, <span class="k">"args"</span>: [<span class="s">"-y"</span>, <span class="s">"@playwright/mcp@latest"</span>] },
    <span class="k">"context7"</span>:   { <span class="k">"url"</span>: <span class="s">"https://mcp.context7.com/mcp"</span> },
    <span class="k">"filesystem"</span>: { <span class="k">"command"</span>: <span class="s">"npx"</span>, <span class="k">"args"</span>: [<span class="s">"-y"</span>, <span class="s">"@modelcontextprotocol/server-filesystem"</span>, <span class="s">"~/Notes"</span>] }
  }
}</pre>
      <div class="x-import-list">
        <div class="r"><i data-lucide="check" style="color:var(--ok)"></i>playwright<span class="badge-t">stdio</span><span class="sp"></span>${tg(true, true)}</div>
        <div class="r"><i data-lucide="check" style="color:var(--ok)"></i>context7<span class="badge-t">http</span><span class="sp"></span>${tg(true, true)}</div>
        <div class="r"><i data-lucide="triangle-alert" style="color:var(--warn)"></i>filesystem<span class="badge-t">stdio</span><span class="warn">同名服务器已存在，将覆盖</span><span class="sp"></span>${tg(false, true)}</div>
      </div>`;
  return `
  <div class="scrim" data-close></div>
  <div class="x-dialog">
    <div class="dh"><b>添加 MCP 服务器</b><span class="sp"></span><button class="ib" data-close><i data-lucide="x"></i></button></div>
    <div class="x-tabs">${t.map(([k, l]) => `<div class="x-tab ${k === tab ? "on" : ""}" data-add="${k}">${l}</div>`).join("")}</div>
    <div class="db">${body}</div>
    <div class="df">
      <span class="h"><i data-lucide="shield"></i>MCP 服务器能执行本地命令，只添加你信任的来源</span>
      <span class="sp"></span>
      <button class="btn" data-close>取消</button>
      <button class="btn primary">${tab === "json" ? "导入 2 个" : tab === "form" ? "保存并连接" : "下一步"}</button>
    </div>
  </div>`;
}

/* ── 输入框 MCP 快捷浮层：只做开关，管理跳页 ── */
export function composerPopover(style) {
  const rows = ALL.filter(s => !s.builtin).concat(ALL.filter(s => s.builtin).slice(0, 3));
  return `
  <div class="x-pop" style="${style}">
    <div class="ph">本次对话可用的 MCP<span class="sp"></span><span class="num">27 个工具</span></div>
    ${rows.map(s => `<div class="pr"><span class="dot ${s.status}"></span><span class="n">${s.name}</span><span class="c">${s.status === "error" ? `<span style="color:var(--danger)">失败</span>` : s.tools.length || "…"}</span>${tg(s.on, true)}</div>`).join("")}
    <div class="pr" style="color:var(--ink-3)"><span style="width:7px"></span><span class="n">其余 4 个内置…</span></div>
    <div class="sep"></div>
    <div class="foot"><i data-lucide="settings-2" style="width:14px;height:14px"></i>管理 MCP 服务器<span style="flex:1"></span><i data-lucide="arrow-up-right" style="width:13px;height:13px"></i></div>
  </div>`;
}
