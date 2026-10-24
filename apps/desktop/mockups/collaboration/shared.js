/*
  协作页三方案共用：图标 / 壳层 / mock 协作状态 / 浮层（Menu · Popover · Dialog · Toast）/ 共用业务浮层
  （加入协作、协作设置、共享本地内容、结束 / 退出确认、分享面板）。
  数据形状与 @tau/collaboration 协议一致：session { role, status, connection, pending, leaving, error,
  members[{ nickname, role, online, activity }], source? }、joinRequest、12 位协作码（7 天有效）。
  状态文案 = packages/collaboration/src/view.ts sessionStatus 的逐条移植，不自造状态。
*/
(function () {
  "use strict";

  /* ============ 图标（lucide 线性 1.75） ============ */
  const ICONS = {
    flame:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "list-todo":
      '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    timer:
      '<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    "file-text":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    presentation:
      '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
    "folder-kanban":
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 12v4M12 12v2M16 12v5"/>',
    repeat:
      '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    "book-open":
      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    inbox:
      '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sparkles:
      '<path d="M12 3.5l1.7 4.4 4.4 1.6-4.4 1.7L12 15.6l-1.7-4.4-4.4-1.7 4.4-1.6z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    chart:
      '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.8"/><rect x="12" y="8" width="3" height="10" rx="0.8"/><rect x="17" y="5" width="3" height="13" rx="0.8"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    share:
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh:
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    "user-minus":
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
    "user-plus":
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    external:
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    "wifi-off":
      '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2.01-1.52M2 8.82a15 15 0 0 1 4.18-2.65M22 8.82a15 15 0 0 0-11.29-3.76M2 2l20 20"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    upload:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    server:
      '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    whiteboard: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 15 3-3 3 3 4-5"/>',
    history:
      '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  };
  function injectSprite() {
    if (document.getElementById("collab-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "collab-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  const esc = s =>
    String(s ?? "").replace(
      /[&<>"]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );

  /* ============ 时间 ============ */
  const MIN = 60000,
    H = 3600000,
    D = 86400000;
  const NOW = new Date(2026, 8, 25, 10, 40, 0).getTime();
  function rel(ts) {
    const d = NOW - ts;
    if (d < MIN) return "刚刚";
    if (d < H) return `${Math.round(d / MIN)} 分钟前`;
    if (d < D) return `${Math.round(d / H)} 小时前`;
    if (d < 7 * D) return `${Math.round(d / D)} 天前`;
    const t = new Date(ts);
    return `${t.getMonth() + 1}月${t.getDate()}日`;
  }
  const daysLeft = ts => Math.max(1, Math.ceil((ts - NOW) / D));

  /* ============ 派生色（deviceId → accent / tag-1…5，零新 token） ============ */
  const PALETTE = [
    ["var(--tag-1)", "var(--tag-1-soft)"],
    ["var(--tag-2)", "var(--tag-2-soft)"],
    ["var(--tag-3)", "var(--tag-3-soft)"],
    ["var(--tag-4)", "var(--tag-4-soft)"],
    ["var(--tag-5)", "var(--tag-5-soft)"],
    ["var(--accent)", "var(--accent-soft)"],
  ];
  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  const colorOf = id => PALETTE[hash(id) % PALETTE.length];

  /* ============ mock 协作状态 ============ */
  const ME = {
    deviceId: "d7f3a9c2e1b04f5a",
    nickname: "小熊",
    serverUrl: "https://collab.xiongtao.life",
  };
  const P = {
    lin: { deviceId: "a1b2c3d4e5f60718", nickname: "林一" },
    zhou: { deviceId: "e5f6a7b8c9d0e1f2", nickname: "周末" },
    jie: { deviceId: "c9d0e1f2a3b4c5d6", nickname: "阿杰" },
    chen: { deviceId: "b3c4d5e6f7a8b9c0", nickname: "陈默" },
    su: { deviceId: "f7a8b9c0d1e2f3a4", nickname: "苏禾" },
  };
  const m = (p, role, online, activity) => ({ ...p, role, online, activity });
  const meM = (role, activity = "editing") => m(ME, role, true, activity);

  function seed() {
    return {
      sessions: [
        {
          id: "s1",
          title: "分布式系统读书笔记",
          role: "owner",
          status: "active",
          connection: "connected",
          pending: false,
          leaving: false,
          updatedAt: NOW - 2 * MIN,
          source: {
            databaseName: "main",
            sourceType: "article",
            sourceId: 128,
            sourceTitle: "分布式系统读书笔记",
          },
          members: [
            meM("owner"),
            m(P.lin, "editor", true, "editing"),
            m(P.zhou, "editor", true, "viewing"),
          ],
          code: "K7QX-M3AZ-9BCD",
          codeExpiresAt: NOW + 5 * D + 3 * H,
        },
        {
          id: "s2",
          title: "Q3 季度复盘",
          role: "owner",
          status: "active",
          connection: "connected",
          pending: true,
          leaving: false,
          updatedAt: NOW - 6 * MIN,
          source: {
            databaseName: "main",
            sourceType: "project-item",
            sourceId: 42,
            sourceTitle: "工作复盘 / Q3 季度复盘",
          },
          members: [meM("owner"), m(P.su, "editor", false, "background")],
          code: "P2LD-8WQN-4HTE",
          codeExpiresAt: NOW + 6 * D,
        },
        {
          id: "s3",
          title: "费曼学习法",
          role: "owner",
          status: "active",
          connection: "connected",
          pending: false,
          leaving: false,
          updatedAt: NOW - 26 * H,
          source: {
            databaseName: "main",
            sourceType: "card",
            sourceId: 907,
            sourceTitle: "费曼学习法",
          },
          members: [meM("owner", "background")],
          code: "Z9RM-C3VK-7JYA",
          codeExpiresAt: NOW + 6 * D + 20 * H,
        },
        {
          id: "s4",
          title: "React 19 迁移指南",
          role: "editor",
          status: "active",
          connection: "connected",
          pending: false,
          leaving: false,
          updatedAt: NOW - 12 * MIN,
          members: [
            m(P.jie, "owner", true, "editing"),
            meM("editor", "viewing"),
            m(P.lin, "editor", false, "background"),
          ],
        },
        {
          id: "s5",
          title: "CRDT 综述 · 论文笔记",
          role: "editor",
          status: "active",
          connection: "offline",
          pending: true,
          leaving: false,
          updatedAt: NOW - 3 * H,
          members: [m(P.zhou, "owner", false, "background"), meM("editor", "background")],
        },
      ],
      requests: [
        { id: "r1", documentId: "s1", ...P.chen, status: "pending", expiresAt: NOW + 2 * D },
        { id: "r2", documentId: "s3", ...P.su, status: "pending", expiresAt: NOW + 6 * D },
      ],
      error: undefined,
    };
  }

  // 可共享的本地内容（CONTENT_TYPES = card / article / project-item / diary-daily）
  const LOCAL = [
    { contentId: 301, type: "article", title: "从零实现 Raft", sub: "文章 · 3 天前编辑" },
    { contentId: 302, type: "article", title: "写作的节奏感", sub: "文章 · 上周" },
    {
      contentId: 303,
      type: "project-item",
      title: "Tau 桌面端重构 / 设计系统规范",
      sub: "项目文档 · 昨天",
    },
    { contentId: 304, type: "project-item", title: "工作复盘 / 9 月周报", sub: "项目文档 · 今天" },
    { contentId: 305, type: "card", title: "间隔重复的遗忘曲线", sub: "卡片 · 2 天前" },
    { contentId: 306, type: "card", title: "第一性原理", sub: "卡片 · 上周" },
    { contentId: 307, type: "diary-daily", title: "2026年9月24日 周四", sub: "日记 · 昨天" },
  ];

  const SRC = {
    article: ["file-text", "文章"],
    card: ["layers", "卡片"],
    "project-item": ["folder-kanban", "项目文档"],
    "diary-daily": ["pen", "日记"],
    content: ["file", "内容"],
  };

  let S = seed();
  let demoMode = "normal";
  const subs = new Set();
  const on = fn => (subs.add(fn), () => subs.delete(fn));
  const emit = () => subs.forEach(fn => fn());

  function applyDemo(mode) {
    demoMode = mode;
    S = seed();
    if (mode === "empty") {
      S.sessions = [];
      S.requests = [];
    }
    if (mode === "offline") {
      S.sessions.forEach(s => {
        if (s.status === "active") s.connection = "offline";
        s.members.forEach(x => x.deviceId !== ME.deviceId && (x.online = false));
      });
      S.sessions[0].pending = true;
    }
    if (mode === "error") {
      S.error = "暂时连不上协作服务，改动会先保存在本机";
      S.sessions[0].error = "协作服务暂时不可用，稍后自动重试";
    }
    emit();
  }

  /* ---------- 派生 ---------- */
  function status(s) {
    if (s.error) return { label: s.error, tone: "error" };
    if (s.leaving) return { label: "等待退出完成", tone: "syncing" };
    if (s.status === "closed")
      return s.pending
        ? { label: "共享已结束，有待恢复内容", tone: "syncing" }
        : { label: "共享已结束", tone: "idle" };
    if (s.connection === "connected")
      return s.pending ? { label: "正在同步", tone: "syncing" } : { label: "已同步", tone: "live" };
    return s.pending
      ? { label: "离线，改动已存本机", tone: "syncing" }
      : { label: "离线", tone: "offline" };
  }
  const activity = x =>
    !x.online
      ? "离线"
      : x.activity === "editing"
        ? "正在编辑"
        : x.activity === "viewing"
          ? "正在查看"
          : "后台";
  const actKey = x => (!x.online ? "" : x.activity);
  const editing = s => s.members.filter(x => x.online && x.activity === "editing").length;
  const online = s => s.members.filter(x => x.online).length;
  const stale = s =>
    s.leaving || s.connection === "offline" || s.connection === "error" || !!s.error;
  const owner = s => s.members.find(x => x.role === "owner");
  const reqsOf = s => S.requests.filter(r => r.documentId === s.id && r.status === "pending");
  const isMe = x => x.deviceId === ME.deviceId;
  const byId = id => S.sessions.find(s => s.id === id);

  /* ---------- 渲染件 ---------- */
  function avatar(x, cls = "", withAct = true) {
    const [c, soft] = colorOf(x.deviceId);
    const act = withAct && x.online !== undefined ? actKey(x) : "";
    return `<span class="av ${cls}${x.online === false ? " off" : ""}" style="--c:${c};--c-soft:${soft}"${act ? ` data-act="${act}"` : ""} title="${esc(x.nickname)}${x.online !== undefined ? " · " + activity(x) : ""}">${esc(x.nickname.slice(0, 1))}</span>`;
  }
  function stack(members, max = 3, cls = "sm") {
    const sorted = [...members].sort((a, b) => Number(b.online) - Number(a.online));
    const shown = sorted
      .slice(0, max)
      .map(x => avatar(x, cls, false))
      .join("");
    return `<span class="av-stack">${shown}${members.length > max ? `<span class="more">+${members.length - max}</span>` : ""}</span>`;
  }
  const statusHTML = (s, extra = "") => {
    const st = status(s);
    return `<span class="st ${st.tone}"><i></i>${esc(st.label)}${extra}</span>`;
  };
  function srcHTML(s, withTitle = false) {
    if (!s.source) {
      const o = owner(s);
      return `<span class="src">${icon("users")}${o ? esc(o.nickname) + " 的共享" : "他人的共享"}</span>`;
    }
    const [ic, label] = SRC[s.source.sourceType] || SRC.content;
    return `<span class="src">${icon(ic)}${label}${withTitle ? " · " + esc(s.source.sourceTitle) : ""}</span>`;
  }
  const liveSummary = s => {
    if (s.status !== "active") return "";
    // 只数他人：自己在编辑不必告诉自己
    const others = s.members.filter(x => !isMe(x) && x.online);
    const n = others.filter(x => x.activity === "editing").length;
    return n ? `${n} 人正在编辑` : others.length ? `${others.length} 人在线` : "只有你在";
  };

  /* ============ 壳层 ============ */
  const NAV = [
    [
      "工作台",
      [
        ["flame", "今日"],
        ["calendar", "日程"],
        ["list-todo", "待办"],
        ["timer", "番茄专注"],
        ["users", "协作", true],
      ],
    ],
    [
      "知识",
      [
        ["layers", "卡片库"],
        ["file-text", "文章"],
        ["pen", "日记"],
        ["presentation", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["help", "问题管理"],
        ["book-open", "微信读书"],
        ["inbox", "订阅"],
      ],
    ],
    [
      "AI",
      [
        ["chat", "AI 对话"],
        ["sparkles", "Skill 管理"],
      ],
    ],
    [
      "工具",
      [
        ["chart", "统计"],
        ["send", "发布"],
      ],
    ],
  ];
  let crumbEl, backBtn;
  function mountShell({ crumb = "协作", demos = true } = {}) {
    injectSprite();
    const theme = localStorage.getItem("collab-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? '<span class="nav-badge" id="nav-badge" title="待审批的加入申请"></span>' : ""}</button>${active ? '<div id="nav-sub"></div>' : ""}`
          )
          .join("")}</div>`
    ).join("");
    document.getElementById("app").innerHTML = `
      <div class="app">
        <nav class="sidebar"><div class="sidebar-head"><span class="brand-mark">τ</span><span class="brand-name">Tau</span></div>${nav}
          <div class="nav-spacer"></div><button class="nav-item">${icon("sliders")}设置</button></nav>
        <div></div>
        <main class="main">
          <div class="titlebar">
            <button class="titlebar-btn" id="tb-back" disabled title="后退 (Alt+←)">${icon("back")}</button>
            <button class="titlebar-btn" disabled title="前进 (Alt+→)">${icon("fwd")}</button>
            <span class="titlebar-crumb" id="tb-crumb">${crumb}</span>
            <span class="titlebar-spacer"></span>
            ${
              demos
                ? `<div class="demo" title="mockup 演示控制，非产品 UI"><span>演示</span>
              <button data-demo="normal">正常</button><button data-demo="empty">空态</button><button data-demo="offline">断网</button><button data-demo="error">服务器异常</button></div>`
                : ""
            }
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
        </main>
      </div>`;
    crumbEl = document.getElementById("tb-crumb");
    backBtn = document.getElementById("tb-back");
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("collab-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    document
      .querySelectorAll("[data-demo]")
      .forEach(b => (b.onclick = () => applyDemo(b.dataset.demo)));
    const badge = document.getElementById("nav-badge");
    const sync = () => {
      const n = S.requests.filter(r => r.status === "pending").length;
      badge.textContent = n ? String(n) : "";
      document
        .querySelectorAll("[data-demo]")
        .forEach(b => b.classList.toggle("on", b.dataset.demo === demoMode));
    };
    on(sync);
    sync();
    return { page: document.getElementById("page-root") };
  }
  function setCrumb(html, onBack) {
    crumbEl.innerHTML = html;
    backBtn.disabled = !onBack;
    backBtn.onclick = onBack || null;
  }

  /* ============ Menu / Popover / Toast ============ */
  let menuEl = null,
    menuCleanup = null;
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    if (menuCleanup) menuCleanup();
    menuCleanup = null;
  }
  function place(el, anchor, placement, gap = 6) {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth,
      h = el.offsetHeight;
    let x = placement.endsWith("end")
      ? r.right - w
      : placement === "top" || placement === "bottom"
        ? (r.left + r.right) / 2 - w / 2
        : r.left;
    let y = placement.startsWith("top") ? r.top - h - gap : r.bottom + gap;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - gap);
    if (y < 8) y = r.bottom + gap;
    el.style.left = Math.max(8, x) + "px";
    el.style.top = y + "px";
  }
  function openMenu(anchor, entries, onPick, opts = {}) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.header
            ? `<div class="menu-label">${e.header}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}" data-i="${i}"${e.disabled ? " disabled" : ""}>${e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    place(el, anchor, opts.placement || "bottom-end");
    requestAnimationFrame(() => el.classList.add("open"));
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const entry = entries[+b.dataset.i];
      closeMenu();
      onPick && onPick(entry);
      entry.run && entry.run();
    });
    const onDown = ev => !el.contains(ev.target) && closeMenu();
    const onKey = ev => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        closeMenu();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    menuEl = el;
    menuCleanup = () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }

  let popClose = null;
  function openPop(anchor, render, opts = {}) {
    if (popClose) popClose();
    closeMenu();
    const el = document.createElement("div");
    el.className = "pop";
    if (opts.width) el.style.width = opts.width + "px";
    if (opts.pad !== undefined) el.style.padding = opts.pad;
    document.body.appendChild(el);
    const placement = opts.placement || "bottom-start";
    const draw = () => {
      el.innerHTML = render(close);
      opts.bind && opts.bind(el, close, draw);
      // 页面重渲染会替换锚点节点：已脱离文档时保持原位，不重新定位
      if (anchor.isConnected || !el.style.left) place(el, anchor, placement, 8);
    };
    const onDown = ev => {
      if (overlayOpen()) return;
      if (!el.contains(ev.target) && !anchor.contains(ev.target)) close();
    };
    const onKey = ev => {
      if (ev.key === "Escape" && !overlayOpen() && !menuEl) {
        ev.stopPropagation();
        close();
      }
    };
    const off = opts.live ? on(draw) : null;
    function close() {
      el.remove();
      off && off();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      if (popClose === close) popClose = null;
      opts.onClose && opts.onClose();
    }
    draw();
    requestAnimationFrame(() => el.classList.add("open"));
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    popClose = close;
    return close;
  }
  const closePop = () => popClose && popClose();

  let toastEl, toastTimer;
  function toast(msg, undo) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span class="${undo ? "" : "solo"}">${msg}</span>${undo ? "<button>撤销</button>" : ""}`;
    if (undo)
      toastEl.querySelector("button").onclick = () => {
        undo();
        toastEl.classList.remove("show");
      };
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), undo ? 5000 : 2600);
  }

  /* ============ Dialog（LIFO：Esc 只关栈顶） ============ */
  const dialogs = [];
  const overlayOpen = () => dialogs.length > 0;
  function openDialog(render, opts = {}) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dlg" style="${opts.width ? `width:${opts.width}px` : ""}"></div>`;
    const box = ov.firstElementChild;
    document.body.appendChild(ov);
    const draw = () => {
      box.innerHTML = render(close);
      opts.bind && opts.bind(box, close, draw);
    };
    const off = opts.live ? on(draw) : null;
    function close() {
      const i = dialogs.indexOf(close);
      if (i >= 0) dialogs.splice(i, 1);
      off && off();
      ov.classList.remove("open");
      setTimeout(() => ov.remove(), 180);
    }
    close.onKey = ev => ev.key === "Escape" && close();
    ov.addEventListener("mousedown", ev => ev.target === ov && close());
    dialogs.push(close);
    draw();
    requestAnimationFrame(() => ov.classList.add("open"));
    const f = box.querySelector("[autofocus]");
    f && setTimeout(() => f.focus(), 30);
    return close;
  }
  document.addEventListener(
    "keydown",
    ev => {
      if (ev.key === "Escape" && dialogs.length) {
        ev.stopPropagation();
        dialogs[dialogs.length - 1]();
      }
    },
    true
  );

  /* ============ 动作（模拟 IPC） ============ */
  const later = (ms, fn) => new Promise(r => setTimeout(() => r(fn && fn()), ms));
  function approve(rid, ok) {
    const r = S.requests.find(x => x.id === rid);
    if (!r) return;
    r.status = ok ? "approved" : "rejected";
    const s = byId(r.documentId);
    if (ok && s)
      s.members.push({
        deviceId: r.deviceId,
        nickname: r.nickname,
        role: "editor",
        online: true,
        activity: "viewing",
      });
    S.requests = S.requests.filter(x => x.id !== rid);
    emit();
    toast(
      ok ? `已同意 ${esc(r.nickname)} 加入「${esc(s?.title)}」` : `已拒绝 ${esc(r.nickname)} 的申请`
    );
  }
  function removeMember(sid, did) {
    const s = byId(sid);
    const x = s.members.find(y => y.deviceId === did);
    openDialog(
      close => `<h3>移除 ${esc(x.nickname)}？</h3>
        <p class="dsub">该设备会立即断开并失去访问权限；它本机已保存的内容不受影响。</p>
        <div class="dfoot"><button class="btn btn-ghost md" data-x>取消</button><button class="btn btn-danger md" data-ok>移除</button></div>`,
      {
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            s.members = s.members.filter(y => y.deviceId !== did);
            close();
            emit();
            toast(`已移除 ${esc(x.nickname)}`);
          };
        },
      }
    );
  }
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const genCode = () =>
    Array.from({ length: 3 }, () =>
      Array.from(
        { length: 4 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join("")
    ).join("-");
  function rotateCode(sid) {
    const s = byId(sid);
    s.code = genCode();
    s.codeExpiresAt = NOW + 7 * D;
    emit();
    toast("已轮换协作码，旧码不能再申请加入");
  }
  function copyCode(s, btn) {
    navigator.clipboard?.writeText(s.code).catch(() => {});
    if (btn) {
      btn.innerHTML = icon("check");
      btn.classList.add("on");
      setTimeout(() => {
        btn.innerHTML = icon("copy");
        btn.classList.remove("on");
      }, 1400);
    }
    toast("协作码已复制");
  }

  /* ---------- 分享面板（owner：协作码 + 成员 + 申请；editor：成员 + 退出） ----------
     三方案与内容页状态栏共用同一份内容，只是容器不同（Popover / 右栏 / 行内展开）。 */
  function sharePanelHTML(s, opts = {}) {
    const reqs = reqsOf(s);
    const ownerActive = s.role === "owner" && s.status === "active";
    const members = [...s.members].sort((a, b) =>
      a.role === "owner" ? -1 : b.role === "owner" ? 1 : Number(b.online) - Number(a.online)
    );
    const codeBlock = ownerActive
      ? `<div class="code-box">
           <span class="code num">${esc(s.code)}</span>
           <button class="ibtn" data-copy title="复制协作码">${icon("copy")}</button>
         </div>
         <div class="code-meta"><span>${daysLeft(s.codeExpiresAt)} 天后过期 · 发给对方，在「加入协作」里输入</span>
           <button class="link" data-rotate title="生成新码，旧码立即失效（已加入的成员不受影响）">${icon("refresh")}轮换</button></div>`
      : "";
    const reqBlock = reqs.length
      ? `<div style="margin-top:${opts.gap || 18}px"><div class="sec">待审批 <span class="n">${reqs.length}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${reqs
            .map(
              r => `<div class="req" style="background:var(--bg-hover)">${avatar(r, "", false)}<div class="who"><b>${esc(r.nickname)}</b><p>申请加入 · ${daysLeft(r.expiresAt)} 天内有效</p></div>
                <div class="acts"><button class="btn btn-ghost" data-rej="${r.id}">拒绝</button><button class="btn btn-primary" data-ok="${r.id}">同意</button></div></div>`
            )
            .join("")}</div></div>`
      : "";
    const memberBlock = `<div style="margin-top:${opts.gap || 18}px">
        <div class="sec">成员 <span class="n">${s.members.length}</span><span class="spacer"></span>${s.status === "active" ? `<span class="muted" style="font-size:12px;font-weight:400">${liveSummary(s)}</span>` : ""}</div>
        <div style="margin-top:6px">${members
          .map(
            x => `<div class="mrow">${avatar(x)}<span class="name">${esc(x.nickname)}${isMe(x) ? '<span class="muted">（我）</span>' : ""}</span>
              ${x.role === "owner" ? '<span class="role">作者</span>' : ""}
              <span class="tail"><span class="sub ${actKey(x)}">${activity(x)}</span>
              ${
                ownerActive && x.role !== "owner"
                  ? `<button class="ibtn sm danger hover-act" data-rm="${x.deviceId}" title="移除 ${esc(x.nickname)}">${icon("user-minus")}</button>`
                  : opts.reserveSlot !== false && ownerActive
                    ? '<span style="width:24px"></span>'
                    : ""
              }</span></div>`
          )
          .join("")}</div></div>`;
    const order = s.role === "owner" ? [codeBlock, reqBlock, memberBlock] : [memberBlock];
    return order.join("");
  }
  function bindSharePanel(root, s) {
    root.querySelector("[data-copy]")?.addEventListener("click", e => copyCode(s, e.currentTarget));
    root.querySelector("[data-rotate]")?.addEventListener("click", () => rotateCode(s.id));
    root
      .querySelectorAll("[data-ok]")
      .forEach(b => (b.onclick = () => approve(b.dataset.ok, true)));
    root
      .querySelectorAll("[data-rej]")
      .forEach(b => (b.onclick = () => approve(b.dataset.rej, false)));
    root
      .querySelectorAll("[data-rm]")
      .forEach(b => (b.onclick = () => removeMember(s.id, b.dataset.rm)));
  }

  /* ---------- 结束共享 / 退出 / 清理（文案与 legacy 判定逐条对齐） ---------- */
  function leaveDialog(sid, after) {
    const s = byId(sid);
    const isStale = stale(s);
    const title = isStale
      ? "清理本地协作记录？"
      : s.status === "closed"
        ? "清理协作缓存？"
        : s.role === "owner"
          ? "结束共享？"
          : "退出协作？";
    const desc = isStale
      ? "协作服务器当前不可达。缓存内容会先保留到本地，然后删除本机的共享记录；原内容不会删除。"
      : s.pending
        ? "仍有未同步的改动。等待同步完成后再退出，或丢弃这些改动。"
        : s.role === "owner"
          ? "所有成员将停止协作，服务器上的正文与附件会被清理，原内容保留在本机。"
          : "这段内容将从协作中移除，已保存的本地内容不受影响。";
    const blocked = !isStale && s.pending && s.role === "owner" && s.status === "active";
    const ok = isStale
      ? "清理记录"
      : s.pending && s.role !== "owner" && s.status !== "closed"
        ? "丢弃改动并退出"
        : s.status === "closed"
          ? "清理"
          : s.role === "owner"
            ? "结束共享"
            : "退出";
    openDialog(
      () => `<h3>${title}</h3><p class="dsub">${desc}</p>
        ${blocked ? `<div class="banner warn" style="margin-top:14px">${icon("refresh")}正在同步未提交的改动，完成后才能结束共享</div>` : ""}
        <div class="dfoot"><button class="btn btn-ghost md" data-x>取消</button><button class="btn btn-danger md" data-ok ${blocked ? "disabled" : ""}>${ok}</button></div>`,
      {
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = async () => {
            close();
            s.leaving = true;
            emit();
            await later(900);
            S.sessions = S.sessions.filter(x => x.id !== sid);
            S.requests = S.requests.filter(r => r.documentId !== sid);
            emit();
            toast(
              s.role === "owner" && !isStale
                ? `已结束共享「${esc(s.title)}」`
                : `已退出「${esc(s.title)}」`
            );
            after && after();
          };
        },
      }
    );
  }

  /* ---------- 加入协作（三段 4 位，粘贴自动分段，回车提交） ---------- */
  function codeInputHTML(cls = "") {
    return `<div class="code-input ${cls}"><input maxlength="4" placeholder="K7QX" data-seg autofocus aria-label="协作码第 1 段"><span class="dash">–</span><input maxlength="4" placeholder="M3AZ" data-seg aria-label="协作码第 2 段"><span class="dash">–</span><input maxlength="4" placeholder="9BCD" data-seg aria-label="协作码第 3 段"></div>`;
  }
  function bindCodeInput(root, onChange, onSubmit) {
    const segs = [...root.querySelectorAll("[data-seg]")];
    const value = () => segs.map(i => i.value.toUpperCase()).join("");
    segs.forEach((inp, i) => {
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(/[^0-9a-z]/gi, "").toUpperCase();
        if (inp.value.length === 4 && segs[i + 1]) segs[i + 1].focus();
        onChange(value());
      });
      inp.addEventListener("keydown", e => {
        if (e.key === "Backspace" && !inp.value && segs[i - 1]) segs[i - 1].focus();
        if (e.key === "Enter") onSubmit(value());
      });
      inp.addEventListener("paste", e => {
        const t = (e.clipboardData.getData("text") || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
        if (t.length > 4) {
          e.preventDefault();
          segs.forEach((s, k) => (s.value = t.slice(k * 4, k * 4 + 4)));
          segs[Math.min(2, Math.floor((t.length - 1) / 4))].focus();
          onChange(value());
        }
      });
    });
    return { value, clear: () => segs.forEach(s => (s.value = "")) };
  }
  async function submitJoin(code) {
    await later(700);
    if (code.length !== 12) throw new Error("协作码是 12 位，请检查是否输完整");
    if (code === "AAAAAAAAAAAA") throw new Error("协作码无效或已过期");
    return true;
  }
  function joinDialog() {
    let v = "",
      state = "idle",
      err = "";
    openDialog(
      () =>
        state === "sent"
          ? `<div class="empty" style="padding:10px 0 4px"><div class="glyph">${icon("check")}</div><h3>申请已发出</h3><p>对方同意后，这份内容会出现在「我加入的」里。你可以先关掉这个窗口，结果会通过通知告诉你。</p></div>
             <div class="dfoot"><button class="btn btn-primary md" data-x autofocus>好的</button></div>`
          : `<h3>加入协作</h3><p class="dsub">向内容作者要一个 12 位协作码。提交后需要对方同意。</p>
             <div class="dbody">${codeInputHTML()}${err ? `<div class="err" style="margin-top:12px">${err}</div>` : '<p class="hint">可以直接粘贴整段协作码，会自动分段。</p>'}</div>
             <div class="dfoot"><span class="left muted" style="font-size:12px">以「${esc(ME.nickname)}」的身份申请</span><button class="btn btn-ghost md" data-x>取消</button><button class="btn btn-primary md" data-go ${v.length === 12 && state !== "busy" ? "" : "disabled"}>${state === "busy" ? "正在提交…" : "申请加入"}</button></div>`,
      {
        bind(box, close, draw) {
          box.querySelectorAll("[data-x]").forEach(b => (b.onclick = close));
          if (state === "sent") return;
          const go = box.querySelector("[data-go]");
          const submit = async code => {
            if (code.length !== 12 || state === "busy") return;
            state = "busy";
            err = "";
            go.disabled = true;
            go.textContent = "正在提交…";
            try {
              await submitJoin(code);
              state = "sent";
            } catch (e) {
              state = "idle";
              err = e.message;
            }
            draw();
          };
          const ci = bindCodeInput(
            box,
            val => ((v = val), (go.disabled = v.length !== 12)),
            submit
          );
          go.onclick = () => submit(ci.value());
        },
      }
    );
  }

  /* ---------- 昵称（唯一的本机协作设置；服务器地址不暴露，身份不导入导出） ---------- */
  function settingsHTML() {
    return `<div class="field"><label>昵称</label><input class="input" data-nick value="${esc(ME.nickname)}" maxlength="40" placeholder="展示给协作者的名称"><p class="hint">只用于展示，授权以设备身份为准。</p></div>`;
  }
  function bindSettings() {}
  function settingsDialog() {
    openDialog(
      () => `<h3>协作昵称</h3><div class="dbody">${settingsHTML()}</div>
        <div class="dfoot"><button class="btn btn-ghost md" data-x>取消</button><button class="btn btn-primary md" data-save>保存</button></div>`,
      {
        width: 420,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-save]").onclick = () => {
            ME.nickname = box.querySelector("[data-nick]").value.trim() || ME.nickname;
            close();
            emit();
            toast("昵称已保存");
          };
        },
      }
    );
  }

  /* ---------- 共享本地内容：选择 → 冻结 / 上传资源 / 发布 → 出码 ---------- */
  function shareLocalDialog(onDone) {
    let q = "",
      type = "all",
      phase = "pick",
      picked = null,
      step = 0;
    const shared = new Set(S.sessions.map(s => s.source?.sourceTitle));
    const STEPS = ["暂停本地编辑", "上传正文引用的 3 个附件", "在协作服务器上创建文档"];
    openDialog(
      () => {
        if (phase === "pick") {
          const list = LOCAL.filter(
            x => (type === "all" || x.type === type) && x.title.includes(q) && !shared.has(x.title)
          );
          return `<h3>共享本地内容</h3><p class="dsub">选一段内容发起协作。共享后它仍在原处，编辑会实时同步给成员。</p>
            <div class="dbody">
              <div style="display:flex;gap:8px"><div style="position:relative;flex:1"><input class="input" data-q value="${esc(q)}" placeholder="搜索标题" autofocus style="padding-left:30px"><span style="position:absolute;left:10px;top:8px;color:var(--ink-3)">${icon("search")}</span></div></div>
              <div class="seg" style="margin-top:10px">${[
                ["all", "全部"],
                ["article", "文章"],
                ["card", "卡片"],
                ["project-item", "项目文档"],
                ["diary-daily", "日记"],
              ]
                .map(
                  ([k, l]) =>
                    `<button data-t="${k}" class="${type === k ? "on" : ""}">${l}</button>`
                )
                .join("")}</div>
              <div style="margin-top:10px;height:252px;overflow:auto;margin-inline:-8px;padding-inline:8px">${
                list.length
                  ? list
                      .map(
                        x => `<button class="mrow" data-pick="${x.contentId}" style="width:calc(100% + 16px);text-align:left;min-height:44px">
                          <span class="av" style="--c:var(--ink-2);--c-soft:var(--bg-hover);border-radius:8px">${icon(SRC[x.type][0])}</span>
                          <span style="min-width:0;flex:1"><span class="name" style="display:block">${esc(x.title)}</span><span class="sub">${esc(x.sub)}</span></span>
                          <span class="tail hover-act">${icon("arrow-right")}</span></button>`
                      )
                      .join("")
                  : '<div class="empty" style="padding:50px 0"><p>没有找到匹配的内容</p></div>'
              }</div>
            </div>`;
        }
        if (phase === "run")
          return `<h3>正在共享「${esc(picked.title)}」</h3><p class="dsub">共享期间请不要关闭应用。</p>
            <div class="dbody" style="display:flex;flex-direction:column;gap:10px">${STEPS.map(
              (
                t,
                i
              ) => `<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:${i <= step ? "var(--ink-1)" : "var(--ink-3)"}">
                <span style="width:18px;height:18px;display:grid;place-items:center;border-radius:50%;${i < step ? "background:var(--ok-soft);color:var(--ok)" : i === step ? "color:var(--accent-text)" : "box-shadow:inset 0 0 0 1.5px var(--line-1)"}">${i < step ? icon("check") : i === step ? `<svg class="icon" style="width:14px;height:14px;animation:spin 900ms linear infinite"><use href="#i-loader"/></svg>` : ""}</span>${t}</div>`
            ).join("")}</div>`;
        const s = S.sessions[0];
        return `<h3>已共享「${esc(picked.title)}」</h3><p class="dsub">把协作码发给对方。对方申请后，你会在这里和通知里看到。</p>
          <div class="dbody">${sharePanelHTML(s)}</div>
          <div class="dfoot"><button class="btn btn-primary md" data-x>完成</button></div>`;
      },
      {
        width: 480,
        live: false,
        bind(box, close, draw) {
          box
            .querySelectorAll("[data-x]")
            .forEach(b => (b.onclick = () => (close(), onDone && onDone(S.sessions[0].id))));
          if (phase === "pick") {
            const qi = box.querySelector("[data-q]");
            qi.oninput = () => {
              q = qi.value;
              draw();
              const n = box.querySelector("[data-q]");
              n.focus();
              n.setSelectionRange(q.length, q.length);
            };
            box
              .querySelectorAll("[data-t]")
              .forEach(b => (b.onclick = () => ((type = b.dataset.t), draw())));
            box.querySelectorAll("[data-pick]").forEach(
              b =>
                (b.onclick = async () => {
                  picked = LOCAL.find(x => x.contentId === +b.dataset.pick);
                  phase = "run";
                  draw();
                  for (step = 0; step < STEPS.length; step++) {
                    draw();
                    await later(650);
                  }
                  S.sessions.unshift({
                    id: "n" + picked.contentId,
                    title: picked.title,
                    role: "owner",
                    status: "active",
                    connection: "connected",
                    pending: false,
                    leaving: false,
                    updatedAt: NOW,
                    source: {
                      databaseName: "main",
                      sourceType: picked.type === "diary-daily" ? "content" : picked.type,
                      sourceId: picked.contentId,
                      sourceTitle: picked.title,
                    },
                    members: [meM("owner")],
                    code: genCode(),
                    codeExpiresAt: NOW + 7 * D,
                  });
                  phase = "done";
                  emit();
                  draw();
                })
            );
          } else if (phase === "done") bindSharePanel(box, S.sessions[0]);
        },
      }
    );
  }
  const spinStyle = document.createElement("style");
  spinStyle.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(spinStyle);

  /* ---------- 正文 mock（远端光标：正在编辑的他人） ---------- */
  const DOCS = {
    s1: {
      h: [
        "第 5 章 · 复制",
        "复制的目的有三：让数据在地理上靠近用户、在部分节点故障时继续工作、以及横向扩展读吞吐。",
        "单主复制",
        "所有写入都经过主节点，从节点按日志顺序重放。它的难点不在正常路径，而在主节点故障时的切换：如何判定主节点已经失效，如何选出新主，以及旧主恢复后如何认清自己的身份。",
        "异步复制下，新主可能缺少旧主最后几条写入。常见的处理是直接丢弃，这会让已经确认过的写入凭空消失——这是很多线上事故的源头。",
        "多主与无主",
        "多主复制让每个数据中心都能接受写入，代价是必须处理写冲突。CRDT 是其中一条路：把数据结构设计成天然可交换、可结合、幂等，合并时不需要协调。",
      ],
    },
    s4: {
      h: [
        "升级前的准备",
        "先把所有第三方库升到声明兼容 React 19 的版本，再一次性切换 react 与 react-dom。",
        "破坏性变更",
        "ref 现在可以作为普通 prop 传给函数组件，forwardRef 在新代码里不再需要；旧代码仍然可用，但会在未来版本弃用。",
        "useFormStatus 与 useActionState 替代了大部分手写的提交状态管理。",
        "迁移顺序",
        "按依赖图从叶子组件开始，每一批都跑一遍 e2e。",
      ],
    },
  };
  function docHTML(s, { editable = true } = {}) {
    const d = DOCS[s.id] || {
      h: [
        "概述",
        "这份内容正在协作中，正文与标题会实时同步给所有成员。",
        "要点",
        "每个成员的光标和选区都会以对方的颜色显示；断网时改动先存在本机，恢复连接后自动合并。",
        "白板、数据库这类依赖本地数据的块不会进入共享文档，其他成员看到的是占位说明。",
        "后续",
        "结束共享后，内容回到本机编辑，服务器上的副本会被清理。",
      ],
    };
    const others = s.members.filter(x => !isMe(x) && x.online && x.activity === "editing");
    const cursor = (x, text, sel) => {
      const [c] = colorOf(x.deviceId);
      return sel
        ? `<span class="sel" style="--c:${c}">${text}</span><span class="rc" style="--c:${c}"><span>${esc(x.nickname)}</span></span>`
        : `<span class="rc" style="--c:${c}"><span>${esc(x.nickname)}</span></span>${text}`;
    };
    const [h1, p1, h2, p2, p3, h3, p4] = d.h;
    const p2html = others[0] ? p2.replace(/，/, "，" + cursor(others[0], "", false)) : p2;
    const p4html = others[1] ? p4.replace(/(.{10})/, (_, a) => cursor(others[1], a, true)) : p4;
    const ro = !editable || s.status !== "active";
    return `<div class="doc">
      <div class="t" ${ro ? "" : 'contenteditable="true"'} spellcheck="false">${esc(s.title)}</div>
      <div class="body" contenteditable="${!ro}" spellcheck="false">
        <h2>${h1}</h2><p>${p1}</p><h2>${h2}</h2><p>${p2html}</p>
        ${s.id === "s1" ? `<div class="private-block">${icon("whiteboard")}白板「故障切换时序」只在作者本机显示</div>` : ""}
        <blockquote>${p3}</blockquote><h2>${h3}</h2><p>${p4html}</p>
      </div></div>`;
  }

  window.Collab = {
    icon,
    esc,
    rel,
    daysLeft,
    NOW,
    ME,
    SRC,
    get S() {
      return S;
    },
    on,
    emit,
    applyDemo,
    get demoMode() {
      return demoMode;
    },
    status,
    activity,
    actKey,
    editing,
    online,
    stale,
    owner,
    reqsOf,
    isMe,
    byId,
    colorOf,
    hash,
    avatar,
    stack,
    statusHTML,
    srcHTML,
    liveSummary,
    mountShell,
    setCrumb,
    openMenu,
    closeMenu,
    openPop,
    closePop,
    openDialog,
    toast,
    approve,
    removeMember,
    rotateCode,
    copyCode,
    sharePanelHTML,
    bindSharePanel,
    leaveDialog,
    codeInputHTML,
    bindCodeInput,
    submitJoin,
    joinDialog,
    settingsHTML,
    bindSettings,
    settingsDialog,
    shareLocalDialog,
    docHTML,
  };
})();
