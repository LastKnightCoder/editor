/*
  问题页三方案共用：图标 sprite / mock 数据 / 数据操作 / 壳层 / Menu / Toast / Dialog /
  材料选择器 / 写卡片·写答案编辑器 / 快速收集输入。
  【视觉参考，非导出源】—— 三方案共用同一套数据，差异只在布局与交互承载。
  数据形状对齐 src/types/question.ts（IQuestion：questionContent / description / answers / groupId /
  sortIndex / status / resolvedTime）与 question_group（title / color / isDefault），不加新字段。
  「材料」二轮：legacy 的 answers 只能存 content id（卡片 / 文章 / 项目文档 / 独立答案）；项目、白板没有 content，
  mock 按提议的多态关联（target_type + target_id）演示六种材料。
  「探究轨迹」= 提议的事件日志：状态变化、关联 / 移除、从问题里新建的材料自动记；「记一笔」为手动记录。
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
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    unlink:
      '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><path d="M8 2v3M2 8h3M16 22v-3M22 16h-3"/>',
    external:
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    note: '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.6"/><path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><path d="M21.4 5.6a2.1 2.1 0 1 0-3-3L13 8l-1 4 4-1Z"/>',
    folder:
      '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    lightbulb:
      '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
    quote:
      '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
    inbox:
      '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    compass:
      '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    shuffle:
      '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  };
  function injectSprite() {
    if (document.getElementById("q-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "q-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  const esc = s =>
    String(s).replace(
      /[&<>"]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );

  /* ============ 时间：演示日期固定 2026-09-25 周五 10:30 ============ */
  const D = 86400000;
  const NOW = new Date(2026, 8, 25, 10, 30).getTime();
  const day = (m, d, h = 21, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
  function relDate(ts) {
    const d0 = new Date(NOW);
    d0.setHours(0, 0, 0, 0);
    if (ts >= d0.getTime()) return "今天";
    const diff = Math.ceil((d0.getTime() - ts) / D);
    if (diff === 1) return "昨天";
    if (diff < 7) return `${diff} 天前`;
    const t = new Date(ts);
    return `${t.getMonth() + 1}月${t.getDate()}日`;
  }
  const fullDate = ts => {
    const t = new Date(ts);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const daysBetween = (a, b) => Math.max(1, Math.round((b - a) / D));

  /* ============ 状态：枚举不变，只换文案（学习语境） ============ */
  const STATUS = {
    not_started: { key: "not_started", label: "待探究", legacy: "未开始", icon: "inbox" },
    in_progress: { key: "in_progress", label: "探究中", legacy: "进行中", icon: "compass" },
    resolved: { key: "resolved", label: "已解答", legacy: "已解决", icon: "check-circle" },
  };
  const STATUS_ORDER = ["in_progress", "not_started", "resolved"];
  /** 状态环：虚线空圈 = 待探究；半实心 accent = 探究中；实心 ok 勾 = 已解答 */
  const statusRing = (s, cls = "") =>
    `<span class="qs qs-${s} ${cls}" aria-label="${STATUS[s].label}">${s === "resolved" ? icon("check") : ""}</span>`;

  /* ============ 材料类型（答案 content 的投影） ============ */
  const KIND = {
    card: { label: "卡片", icon: "layers" },
    article: { label: "文章", icon: "file-text" },
    doc: { label: "项目文档", icon: "file" },
    project: { label: "项目", icon: "folder-kanban" },
    whiteboard: { label: "白板", icon: "presentation" },
    answer: { label: "独立答案", icon: "pen" },
  };

  /* ============ mock 数据 ============ */
  const groups = [
    { id: 1, title: "编辑器原理", color: "blue" },
    { id: 2, title: "前端工程", color: "green" },
    { id: 3, title: "计算机基础", color: "purple" },
    { id: 4, title: "数学与算法", color: "yellow" },
    { id: 5, title: "读书疑问", color: "rose" },
    { id: 0, title: "默认分组", color: "gray", isDefault: true },
  ];

  let mid = 100;
  const M = (kind, title, excerpt, createTime, extra = {}) => ({
    id: ++mid,
    kind,
    title,
    excerpt,
    createTime,
    words: extra.words || Math.round(excerpt.length * 3.4),
    ...extra,
  });
  const materials = [
    /* 101 */ M(
      "card",
      "Slate dirtyPaths：每个 op 只标记受影响的祖先路径",
      "insert_node 会把新节点自身及所有祖先加入 dirty 集合；split_node 会同时标记两侧兄弟。normalize 按 dirty 路径逐个调用 normalizeNode，每次修复又会产生新的 op……",
      day(9, 14)
    ),
    /* 102 */ M(
      "card",
      "withoutNormalizing 把规范化推迟到最外层",
      "嵌套的 withoutNormalizing 只有最外层退出时才 flush。粘贴处理要整体包一层，否则每插一个 fragment 节点都会触发一次完整的 normalize。",
      day(9, 18)
    ),
    /* 103 */ M(
      "article",
      "从 OT 到 CRDT：协同编辑的两条路",
      "OT 的核心是变换函数 transform(a, b)，要求有一个中心化的顺序；CRDT 把冲突解决放进数据结构本身，让操作天然可交换……",
      day(9, 6),
      { words: 6120 }
    ),
    /* 104 */ M(
      "card",
      "Yjs 的 YATA 冲突解决规则",
      "并发插入同一位置时，按 origin 左右邻居与 clientID 排序，保证所有副本收敛到同一顺序。",
      day(8, 27)
    ),
    /* 105 */ M(
      "card",
      "OT 需要中心服务器做变换的原因",
      "变换函数只保证两两收敛（TP1），多方并发需要 TP2，而满足 TP2 的变换函数极难写对——所以工程上都用服务器定序。",
      day(8, 29)
    ),
    /* 106 */ M(
      "answer",
      "OT 变换操作，CRDT 让数据本身可交换",
      "一句话：OT 在「操作」层面做补偿，依赖全局顺序；CRDT 在「数据结构」层面保证交换律与幂等，天然去中心。代价是元数据膨胀（墓碑）。",
      day(9, 10)
    ),
    /* 107 */ M(
      "card",
      "compositionend 之后才能安全写入模型",
      "Chrome 的 beforeinput 在组合输入期间 inputType=insertCompositionText 且不可取消；提前改 DOM 会打断输入法，导致重复字符。",
      day(9, 20)
    ),
    /* 108 */ M(
      "card",
      "Activity hidden 时卸载 effect、保留 state",
      'React 19 <Activity mode="hidden"> 会执行 effect cleanup 但保留组件 state 与 DOM；再次可见时重新执行 effect。',
      day(9, 16)
    ),
    /* 109 */ M(
      "doc",
      "M0 spike：Activity 保活实验记录",
      "实验了 webview、编辑器焦点、滚动位置三种场景；webview 需要额外处理 visibility 事件……",
      day(9, 15),
      { source: "桌面端重构", words: 2380 }
    ),
    /* 110 */ M(
      "article",
      "Vite 预构建：esbuild 做了什么",
      "预构建把 CommonJS 依赖转换为 ESM，并把内部模块众多的包合并成单文件以减少请求……",
      day(8, 11),
      { words: 3840 }
    ),
    /* 111 */ M(
      "answer",
      "预构建统一把 CJS 转为 ESM 再交给浏览器",
      "浏览器只认 ESM；esbuild 在 dev 启动时把 CJS 包扫描、转换、打包，并处理 default 导出互操作，所以业务代码可以 import CJS 包。",
      day(8, 13)
    ),
    /* 112 */ M(
      "card",
      "B+ 树叶子节点链表支持范围扫描",
      "数据只存在叶子，叶子之间双向链表相连；范围查询定位到起点后顺序遍历，不必回溯内部节点。",
      day(9, 19)
    ),
    /* 113 */ M(
      "card",
      "扇出越大树越矮，磁盘 IO 越少",
      "内部节点不存数据，一页能放更多键，扇出可达数百，三层就能索引千万行。",
      day(9, 21)
    ),
    /* 114 */ M(
      "card",
      "TIME_WAIT 等 2MSL：保证最后的 ACK 可重传",
      "若最后一个 ACK 丢失，对端会重发 FIN；主动关闭方需要还在，才能再回 ACK。",
      day(7, 30)
    ),
    /* 115 */ M(
      "card",
      "2MSL 让旧连接的迟到报文自然消亡",
      "避免同一四元组的新连接收到上一个连接的延迟报文。",
      day(7, 30)
    ),
    /* 116 */ M(
      "answer",
      "两个目的：可靠关闭 + 旧报文消亡",
      "① 最后 ACK 丢失时能重传；② 让网络中旧连接的报文全部过期，新连接不会被污染。MSL 取 30s~2min 视系统。",
      day(8, 1)
    ),
    /* 117 */ M(
      "article",
      "间隔重复算法演进：SM-2 到 FSRS",
      "SM-2 用固定的难度因子；FSRS 把记忆拆成难度 D、稳定性 S、可提取性 R 三个变量，用复习日志做最大似然拟合……",
      day(9, 17),
      { words: 8210 }
    ),
    /* 118 */ M(
      "card",
      "稳定性 S 与可提取性 R 的关系",
      "R(t) = (1 + t / (9·S))^-1；S 定义为 R 从 100% 降到 90% 所需天数。",
      day(9, 22)
    ),
    /* 119 */ M(
      "card",
      "滚动数组：只依赖上一行就只存两行",
      "dp[i][j] 只依赖 dp[i-1][*] 与 dp[i][j-1]，所以可以用两行交替，空间从 O(mn) 降到 O(n)。",
      day(6, 2)
    ),
    /* 120 */ M(
      "answer",
      "因为状态转移只看上一行",
      "LCS 的转移只用到 i-1 行和本行左侧，所以只保留两行；若倒序遍历还能压到一行加一个临时变量。",
      day(6, 3)
    ),
    /* 121 */ M(
      "card",
      "可得性启发：容易想起 ≠ 更常发生",
      "人们用「想起例子的难易」替代「频率判断」，所以空难显得比车祸常见。",
      day(9, 23)
    ),
    /* 122 */ M(
      "card",
      "讲给外行听，暴露的是「知识的诅咒」",
      "术语是压缩后的理解；一旦不能用术语，就必须把被压缩的推理展开，缺口立刻现形。",
      day(5, 12)
    ),
    /* 123 */ M(
      "article",
      "我的费曼学习实践：一个月后的复盘",
      "坚持每学完一个概念写一张「给初中生看」的卡片，一个月后发现……",
      day(5, 20),
      { words: 4410 }
    ),
    /* 124 */ M(
      "card",
      "撤销栈应该记录操作而不是快照",
      "编辑器的撤销要和协同、选区恢复配合，原生 undo 只认 DOM 变更，模型层完全不知情。",
      day(4, 8)
    ),
    /* 125 */ M(
      "answer",
      "原生撤销只懂 DOM，不懂模型",
      "contenteditable 的撤销栈记录的是 DOM 变更，一旦模型接管渲染，两边就不同步；所以都自己实现 history（按 op 合并、带选区）。",
      day(4, 9)
    ),
    /* 126 */ M(
      "card",
      "zustand selector 返回新对象会每次都触发渲染",
      "useStore(s => ({a: s.a, b: s.b})) 每次都返回新引用；要用 useShallow 或拆成多个 selector。",
      day(9, 24)
    ),
    // —— 以下未被任何问题关联，供「关联已有材料」选择器使用 ——
    /* 127 */ M(
      "card",
      "Slate 的 Editor.withoutNormalizing 源码走读",
      "内部用 NORMALIZING WeakMap 记录状态，finally 中恢复并调用 Editor.normalize(editor)。",
      day(9, 24)
    ),
    /* 128 */ M(
      "article",
      "富文本编辑器的数据模型选型",
      "树形模型（Slate / ProseMirror）与扁平模型（Quill Delta）的取舍……",
      day(7, 2),
      { words: 5230 }
    ),
    /* 129 */ M(
      "card",
      "WAL 模式：写入追加到 -wal 文件",
      "读者读取数据库文件 + WAL 中截至自己开始时刻的帧，所以读写互不阻塞。",
      day(9, 2)
    ),
    /* 130 */ M(
      "card",
      "better-sqlite3 为什么坚持同步 API",
      "SQLite 本身是进程内库，查询通常微秒级；异步包装的调度开销反而更大。",
      day(8, 19)
    ),
    /* 131 */ M(
      "doc",
      "Electron 主进程性能排查笔记",
      "用 --inspect 抓主进程 profile，发现大 JSON 序列化占了 40%……",
      day(8, 22),
      { source: "桌面端重构", words: 1760 }
    ),
    /* 132 */ M(
      "card",
      "多级页表：只为用到的地址区间分配页表",
      "单级页表必须覆盖整个地址空间；多级让未使用区间的下级表不存在。",
      day(3, 11)
    ),
    /* 133 */ M(
      "article",
      "Tailwind v4 主题化实践",
      "@theme 定义的变量会同时生成工具类和 CSS 变量……",
      day(9, 8),
      { words: 2970 }
    ),
    // —— 二轮：整个项目、白板也可以是材料（没有 content id，走多态关联） ——
    /* 134 */ M(
      "project",
      "Vibe Learning：协同编辑原理",
      "为这个问题专门开的学习项目：OT / CRDT 两条路线的论文精读、Yjs 源码走读和一张对比数据表。",
      day(8, 24),
      { meta: "9 篇文档 · 1 张数据表", words: 21400 }
    ),
    /* 135 */ M(
      "whiteboard",
      "B+ 树 vs B 树结构对比",
      "两种树的节点布局，以及一次范围查询在两棵树上的访问路径。",
      day(9, 20),
      { meta: "31 个元素" }
    ),
    /* 136 */ M(
      "whiteboard",
      "Slate normalize 调用链",
      "从 Transforms.insertFragment 到 normalizeNode 的调用链，标出每一处产生 dirty path 的位置。",
      day(9, 15),
      { meta: "18 个元素" }
    ),
    /* 137 */ M(
      "project",
      "FSRS 复现实验",
      "用自己 3 千条复习日志跑参数优化器，对比默认参数与个人参数的预测误差。",
      day(9, 19),
      { meta: "4 篇文档 · 1 张数据表", words: 6800 }
    ),
    /* 138 */ M(
      "whiteboard",
      "Electron 进程模型草图",
      "主进程、渲染进程、preload 与 IPC 通道的关系图。",
      day(8, 20),
      { meta: "24 个元素" }
    ),
    /* 139 */ M(
      "project",
      "计算机网络自学",
      "按《计算机网络：自顶向下方法》章节组织的学习项目。",
      day(7, 1),
      { meta: "23 篇文档", words: 38200 }
    ),
  ];
  const matById = id => materials.find(m => m.id === id);

  let qid = 0;
  const Q = (groupId, title, status, createTime, answers = [], extra = {}) => ({
    id: ++qid,
    groupId,
    questionContent: title,
    description: extra.desc || "",
    status,
    createTime,
    updateTime:
      extra.updateTime || Math.max(createTime, ...answers.map(a => matById(a)?.createTime || 0)),
    resolvedTime: status === "resolved" ? extra.resolved : null,
    answers,
    sortIndex: qid,
  });
  const questions = [
    Q(
      1,
      "Slate 的 normalize 为什么会在一次粘贴里被触发这么多次？",
      "in_progress",
      day(9, 12),
      [101, 136, 102],
      {
        desc: "给表格插件写 normalizeNode 时发现：粘贴一段 3 行表格，normalizeNode 被调了 40 多次。想弄清 dirty paths 是怎么算的、有没有办法合并。",
      }
    ),
    Q(
      2,
      "CRDT 和 OT 在协同编辑里的本质区别是什么？",
      "resolved",
      day(8, 20),
      [134, 103, 104, 105, 106],
      {
        desc: "协作功能选型时反复遇到这两个词。Yjs 是 CRDT，Google Docs 是 OT——为什么两者都能用？各自的代价是什么？",
        resolved: day(9, 10),
      }
    ),
    Q(1, "ProseMirror 的 decoration 和 Slate 的 decorate 性能差在哪？", "not_started", day(9, 23)),
    Q(
      1,
      "IME 输入时 contenteditable 的 beforeinput 为什么不可靠？",
      "in_progress",
      day(9, 19),
      [107],
      {
        desc: "中文输入法在表格单元格里偶发重复字符。",
      }
    ),
    Q(
      2,
      "React 19 的 Activity 保活时，effect 到底会不会跑？",
      "in_progress",
      day(9, 14),
      [108, 109],
      {
        desc: "新 Page 协议用 Activity 做保活，需要确认隐藏页面的订阅、定时器会不会泄漏。",
      }
    ),
    Q(2, "Vite 的依赖预构建为什么能解决 CJS 互操作问题？", "resolved", day(8, 10), [110, 111], {
      resolved: day(8, 13),
    }),
    Q(2, "Electron 主进程里 better-sqlite3 同步调用会阻塞 IPC 吗？", "not_started", day(9, 24)),
    Q(2, "Tailwind v4 的 @theme 和运行时切换的 CSS 变量主题怎么配合？", "not_started", day(9, 7)),
    Q(3, "为什么 B+ 树比 B 树更适合做数据库索引？", "in_progress", day(9, 18), [112, 135, 113], {
      desc: "看 SQLite 文档时想到的：它的表用 B+ 树、索引用 B 树，为什么不统一？",
    }),
    Q(3, "TCP 的 TIME_WAIT 为什么要等 2MSL？", "resolved", day(7, 28), [114, 115, 116], {
      resolved: day(8, 1),
    }),
    Q(3, "SQLite 的 WAL 模式下读写为什么能并发？", "not_started", day(9, 1)),
    Q(3, "虚拟内存的页表为什么要分多级？", "not_started", day(3, 10), [], {
      desc: "课本上说是为了省空间，但多级不是更多次访存吗？",
    }),
    Q(4, "FSRS 的遗忘曲线参数是怎么拟合出来的？", "in_progress", day(9, 16), [117, 137, 118], {
      desc: "闪卡复习台用的是 FSRS，想知道 17 个参数的含义，以及个人数据量少时效果如何。",
    }),
    Q(4, "为什么 LCS 的动态规划可以用滚动数组压缩空间？", "resolved", day(6, 1), [119, 120], {
      resolved: day(6, 3),
    }),
    Q(4, "贝叶斯推断里先验分布到底怎么选？", "not_started", day(8, 30)),
    Q(
      5,
      "《思考，快与慢》里系统 1 的「启发式」和直觉是一回事吗？",
      "in_progress",
      day(9, 22),
      [121],
      {
        desc: "第 12 章读到一半。书里有时说启发式是偏差来源，有时又说它是专家直觉的基础。",
      }
    ),
    Q(5, "《置身事内》说的「土地财政」为什么能撬动基建？", "not_started", day(9, 5)),
    Q(5, "费曼学习法为什么强调「讲给外行听」？", "resolved", day(5, 10), [122, 123], {
      resolved: day(5, 20),
    }),
    Q(0, "番茄钟 25 分钟这个数字有依据吗？", "not_started", day(9, 24, 23)),
    Q(0, "为什么写完的卡片过几天再看会觉得看不懂？", "not_started", day(9, 25, 8, 40)),
    Q(
      1,
      "为什么富文本编辑器大多不用 contenteditable 原生撤销？",
      "resolved",
      day(4, 6),
      [124, 125],
      { resolved: day(4, 9) }
    ),
    Q(2, "zustand 的 selector 什么时候会导致多余渲染？", "in_progress", day(9, 24), [126]),
  ];

  /* ============ 探究轨迹：事件日志（自动事件 + 手动记一笔） ============ */
  const H = 3600000;
  const NOTES = {
    1: [
      [
        day(9, 16, 22),
        "粘贴处理包一层 withoutNormalizing 后，normalizeNode 调用从 43 次降到 3 次。",
      ],
      [
        day(9, 21, 23),
        "还剩一个疑问：表格 cell 合并后会不会再触发一轮？明天读 Editor.normalize 源码。",
      ],
    ],
    2: [[day(9, 1, 22), "卡住：看不懂 TP2 为什么难满足，先去读 Yjs 的论文。"]],
    13: [[day(9, 20, 22), "个人数据只有 3 千条时，优化出来的参数和默认参数差别不大。"]],
    16: [
      [
        day(9, 23, 22),
        "书里区分了「有效的直觉」和「启发式偏差」：关键看环境是否规律、反馈是否及时。",
      ],
    ],
  };
  questions.forEach(q => {
    const ev = [{ type: "create", time: q.createTime }];
    const end = q.resolvedTime || NOW;
    q.answers.forEach((mid, k) => {
      const m = matById(mid);
      const created = m.createTime >= q.createTime;
      const time = created
        ? m.createTime
        : Math.min(q.createTime + (k + 1) * 0.6 * D, end - (q.answers.length - k) * H);
      ev.push({ type: "link", mat: mid, created, time });
    });
    const firstLink = ev.filter(e => e.type === "link").sort((a, b) => a.time - b.time)[0];
    if (firstLink)
      ev.push({ type: "status", to: "in_progress", auto: true, time: firstLink.time + 1 });
    if (q.resolvedTime) ev.push({ type: "status", to: "resolved", time: q.resolvedTime + 2 });
    (NOTES[q.id] || []).forEach(([time, text]) => ev.push({ type: "note", text, time }));
    q.events = ev.sort((a, b) => a.time - b.time);
  });
  let tick = 0;
  const logEvent = (q, e) => (
    q.events.push({ ...e, time: NOW + ++tick * 60000 }),
    q.events[q.events.length - 1]
  );
  const dropEvent = (q, e) => q.events.splice(q.events.indexOf(e), 1);

  /* ============ 订阅 + 操作 ============ */
  const listeners = new Set();
  const on = fn => (listeners.add(fn), () => listeners.delete(fn));
  const emit = (type, payload) => listeners.forEach(fn => fn(type, payload));

  const qById = id => questions.find(q => q.id === id);
  const groupById = id => groups.find(g => g.id === id);
  const questionMaterials = q => q.answers.map(matById).filter(Boolean);
  const byGroup = gid => questions.filter(q => gid == null || q.groupId === gid);
  function counts(list = questions) {
    const c = { all: list.length, not_started: 0, in_progress: 0, resolved: 0 };
    list.forEach(q => c[q.status]++);
    return c;
  }
  /** 材料数最多的「探究中」排前，其次最近更新 */
  const sortQuestions = list =>
    [...list].sort((a, b) =>
      a.status === "resolved" && b.status === "resolved"
        ? b.resolvedTime - a.resolvedTime
        : b.updateTime - a.updateTime
    );

  function createQuestion({ title, groupId = 0, status = "not_started", desc = "" }) {
    const q = Q(groupId, title, status, NOW, [], { desc });
    q.createTime = q.updateTime = NOW + qid; // 保证新建排最前
    q.events = [{ type: "create", time: q.createTime }];
    questions.unshift(q);
    emit("create", q);
    return q;
  }
  let bump = 0;
  function updateQuestion(id, patch) {
    Object.assign(qById(id), patch, { updateTime: NOW + ++bump });
    emit("update", qById(id));
  }
  function setStatus(id, status, { silent } = {}) {
    const q = qById(id);
    if (!q || q.status === status) return;
    const prev = { status: q.status, resolvedTime: q.resolvedTime };
    q.status = status;
    q.resolvedTime = status === "resolved" ? NOW : null;
    q.updateTime = NOW + ++bump;
    const ev = logEvent(q, { type: "status", to: status });
    emit("status", q);
    if (!silent)
      toast(`已标为「${STATUS[status].label}」`, () => {
        dropEvent(q, ev);
        Object.assign(q, prev);
        emit("status", q);
      });
  }
  function moveToGroup(id, gid) {
    const q = qById(id);
    const prev = q.groupId;
    q.groupId = gid;
    emit("move", q);
    toast(`已移动到「${groupById(gid).title}」`, () => {
      q.groupId = prev;
      emit("move", q);
    });
  }
  function deleteQuestion(id) {
    const i = questions.findIndex(q => q.id === id);
    const [q] = questions.splice(i, 1);
    emit("delete", q);
    toast("已删除问题（材料本身不受影响）", () => {
      questions.splice(i, 0, q);
      emit("create", q);
    });
  }
  function linkMaterials(id, ids, { created = false } = {}) {
    const q = qById(id);
    const add = ids.filter(m => !q.answers.includes(m));
    q.answers.push(...add);
    q.updateTime = NOW + ++bump;
    add.forEach(mat => logEvent(q, { type: "link", mat, created }));
    // 第一份材料挂上时，待探究自动进入探究中（可撤销的轻推断）
    if (q.status === "not_started" && add.length) {
      q.status = "in_progress";
      logEvent(q, { type: "status", to: "in_progress", auto: true });
      emit("status", q);
    }
    emit("link", q);
    return add.length;
  }
  function unlinkMaterial(id, matId) {
    const q = qById(id);
    const i = q.answers.indexOf(matId);
    q.answers.splice(i, 1);
    const ev = logEvent(q, { type: "unlink", mat: matId });
    emit("link", q);
    toast(`已解除关联（${KIND[matById(matId).kind].label}仍保留在库中）`, () => {
      dropEvent(q, ev);
      q.answers.splice(i, 0, matId);
      emit("link", q);
    });
  }
  function createMaterial(kind, title, excerpt, extra = {}) {
    const m = M(kind, title, excerpt || "（空白内容）", NOW + ++bump, extra);
    materials.push(m);
    return m;
  }
  function addNote(id, text) {
    const q = qById(id);
    logEvent(q, { type: "note", text });
    q.updateTime = NOW + ++bump;
    emit("note", q);
  }
  /** 从问题里直接新建材料（白板 / 项目 / 文章）：新建后挂上，真实实现随即打开它 */
  function createFrom(id, kind) {
    const names = { whiteboard: "未命名白板", project: "未命名项目", article: "未命名文章" };
    const q = qById(id);
    const extra = kind === "article" ? {} : { meta: kind === "project" ? "0 篇文档" : "0 个元素" };
    const m = createMaterial(
      kind,
      `${names[kind]} · ${q.questionContent.slice(0, 14)}…`,
      "刚刚新建，还没有内容。",
      extra
    );
    linkMaterials(id, [m.id], { created: true });
    toast(`已新建${KIND[kind].label}并挂到问题上（真实实现会直接打开它）`);
  }
  function reorder(ids) {
    ids.forEach((id, i) => (qById(id).sortIndex = i));
    emit("reorder");
  }

  /* ============ 分组解析：快速收集「#分组」 ============ */
  function parseCapture(text, fallbackGroup) {
    let groupId = fallbackGroup;
    const m = text.match(/#(\S+)/);
    if (m) {
      const g = groups.find(g => g.title.startsWith(m[1]));
      if (g) {
        groupId = g.id;
        text = text.replace(m[0], "").trim();
      }
    }
    return { title: text.trim(), groupId };
  }

  /* ============ 壳层 ============ */
  const NAV = [
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
        ["pen", "日记"],
        ["presentation", "白板"],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["help", "问题", true],
        ["book-open", "微信读书"],
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
  function mountShell({ crumb = "问题", navChildren = "" } = {}) {
    injectSprite();
    const theme = localStorage.getItem("q-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const inProg = counts().in_progress;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? `<span class="badge num" id="nav-badge">${inProg}</span>` : ""}</button>${active ? `<div id="nav-children">${navChildren}</div>` : ""}`
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
            <button class="titlebar-btn" disabled title="后退 (Alt+←)">${icon("back")}</button>
            <button class="titlebar-btn" disabled title="前进 (Alt+→)">${icon("fwd")}</button>
            <span class="titlebar-crumb">${crumb}</span>
            <span class="titlebar-spacer"></span>
            <a class="mock-back" href="index.html">← 方案总览</a>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
        </main>
      </div>`;
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("q-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    on(() => (document.getElementById("nav-badge").textContent = counts().in_progress));
    return {
      page: document.getElementById("page-root"),
      navChildren: document.getElementById("nav-children"),
    };
  }

  /* ============ Menu ============ */
  let menuEl = null;
  function closeMenu() {
    menuEl?.remove();
    menuEl = null;
  }
  function place(el, anchor, placement = "bottom-start", gap = 6) {
    const r = anchor.getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const w = el.offsetWidth,
      h = el.offsetHeight;
    let x = placement.endsWith("end") ? r.right - w : r.left;
    let y = r.bottom + gap;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - gap);
    el.style.left = Math.max(8, x) + "px";
    el.style.top = y + "px";
  }
  /** entries: {label, icon?, k?, danger?, checked?, dot?, value} | "-" | {section} */
  function openMenu(anchor, entries, onPick, placement) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.section
            ? `<div class="menu-label">${e.section}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}${e.checked ? " checked" : ""}" data-i="${i}">${
                e.ring
                  ? statusRing(e.ring, "sm")
                  : e.dot
                    ? `<i class="pdot" style="--c:var(--pc-${e.dot})"></i>`
                    : e.icon
                      ? icon(e.icon)
                      : ""
              }${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    place(el, anchor, placement);
    requestAnimationFrame(() => el.classList.add("open"));
    el.addEventListener("click", ev => {
      const b = ev.target.closest("[data-i]");
      if (!b) return;
      closeMenu();
      onPick(entries[+b.dataset.i]);
    });
    menuEl = el;
    setTimeout(() => {
      const off = ev => {
        if (menuEl && !menuEl.contains(ev.target)) {
          closeMenu();
          document.removeEventListener("mousedown", off);
        }
      };
      document.addEventListener("mousedown", off);
    });
  }
  function statusMenu(anchor, q) {
    openMenu(
      anchor,
      [
        { section: "状态" },
        ...["not_started", "in_progress", "resolved"].map(s => ({
          label: STATUS[s].label,
          ring: s,
          checked: q.status === s,
          value: s,
        })),
      ],
      e => setStatus(q.id, e.value)
    );
  }
  function groupMenu(anchor, q) {
    openMenu(
      anchor,
      [
        { section: "移动到分组" },
        ...groups.map(g => ({
          label: g.title,
          dot: g.color,
          checked: q.groupId === g.id,
          value: g.id,
        })),
      ],
      e => e.value !== q.groupId && moveToGroup(q.id, e.value)
    );
  }
  /** 问题行的右键 / 更多菜单 */
  function questionMenu(anchor, q, { onOpen } = {}) {
    openMenu(
      anchor,
      [
        ...(onOpen ? [{ label: "打开", icon: "arrow-right", k: "↵", value: "open" }] : []),
        { label: "写一张卡片", icon: "layers", value: "card" },
        { label: "写答案", icon: "pen", value: "answer" },
        { label: "关联已有材料…", icon: "link", k: "L", value: "link" },
        "-",
        { section: "状态" },
        ...["not_started", "in_progress", "resolved"].map(s => ({
          label: STATUS[s].label,
          ring: s,
          checked: q.status === s,
          value: "s:" + s,
        })),
        "-",
        { label: "移动到…", icon: "folder", value: "move" },
        { label: "删除问题", icon: "trash", danger: true, k: "⌫", value: "del" },
      ],
      e => {
        if (e.value === "open") onOpen();
        else if (e.value === "card") openComposer(q.id, "card");
        else if (e.value === "answer") openComposer(q.id, "answer");
        else if (e.value === "link") openPicker(q.id);
        else if (e.value.startsWith("s:")) setStatus(q.id, e.value.slice(2));
        else if (e.value === "move") groupMenu(anchor, q);
        else if (e.value === "del") deleteQuestion(q.id);
      }
    );
  }

  /* ============ Toast（带撤销） ============ */
  let toastEl, toastTimer;
  function toast(msg, undo) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span class="${undo ? "" : "solo"}">${msg}</span>${undo ? `<button>撤销</button>` : ""}`;
    toastEl.classList.add("show");
    if (undo)
      toastEl.querySelector("button").onclick = () => {
        undo();
        toastEl.classList.remove("show");
      };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
  }

  /* ============ Dialog ============ */
  function openDialog({ title, body, width = 640, footer, onMount, className = "" }) {
    const mask = document.createElement("div");
    mask.className = "dlg-mask";
    mask.innerHTML = `<div class="dlg ${className}" style="width:min(92vw,${width}px)">
        <div class="dlg-head"><h3>${title}</h3><button class="icon-btn" data-close>${icon("x")}</button></div>
        <div class="dlg-body">${body}</div>
        ${footer ? `<div class="dlg-foot">${footer}</div>` : ""}
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add("open"));
    const close = () => {
      mask.classList.remove("open");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => mask.remove(), 180);
    };
    const onKey = e => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    mask.addEventListener("mousedown", e => e.target === mask && close());
    mask.querySelector("[data-close]").onclick = close;
    onMount?.(mask.querySelector(".dlg"), close);
    return close;
  }

  /* ============ 材料选择器：关联已有卡片 / 文章 / 项目文档 ============ */
  function openPicker(questionId) {
    const q = qById(questionId);
    let kind = "all",
      kw = "";
    const picked = new Set();
    openDialog({
      title: "关联已有材料",
      width: 720,
      className: "picker",
      body: `
        <div class="pk-top">
          <label class="pk-search">${icon("search")}<input placeholder="搜索卡片、文章、项目、白板…" autofocus></label>
          <div class="seg sm" id="pk-kind">
            <button class="on" data-k="all">全部</button><button data-k="card">卡片</button><button data-k="article">文章</button><button data-k="doc">项目文档</button><button data-k="project">项目</button><button data-k="whiteboard">白板</button>
          </div>
        </div>
        <div class="pk-q">为 <b>${esc(q.questionContent)}</b> 选择材料</div>
        <div class="pk-list scroller fade-y"></div>`,
      footer: `<span class="pk-count">未选择</span><span class="spacer"></span><button class="btn btn-ghost" data-close2>取消</button><button class="btn btn-primary" data-ok disabled>关联</button>`,
      onMount(root, close) {
        const list = root.querySelector(".pk-list");
        const render = () => {
          const k = kw.toLowerCase();
          const rows = materials
            .filter(m => m.kind !== "answer" && (kind === "all" || m.kind === kind))
            .filter(m => !k || (m.title + m.excerpt).toLowerCase().includes(k))
            .sort((a, b) => b.createTime - a.createTime);
          list.innerHTML = rows.length
            ? rows
                .map(m => {
                  const linked = q.answers.includes(m.id);
                  return `<button class="pk-row${picked.has(m.id) ? " on" : ""}${linked ? " linked" : ""}" data-id="${m.id}" ${linked ? "disabled" : ""}>
                    <span class="pk-box">${icon("check")}</span>
                    <span class="mat-kind">${icon(KIND[m.kind].icon)}</span>
                    <span class="pk-main"><span class="pk-t">${esc(m.title)}</span><span class="pk-x">${esc(m.excerpt)}</span></span>
                    <span class="pk-meta">${linked ? "已关联" : `${KIND[m.kind].label}${m.meta ? " · " + m.meta : ""} · ${relDate(m.createTime)}`}</span>
                  </button>`;
                })
                .join("")
            : `<div class="empty-note">没有匹配的材料</div>`;
        };
        render();
        root.querySelector("input").oninput = e => ((kw = e.target.value), render());
        root.querySelector("#pk-kind").onclick = e => {
          const b = e.target.closest("[data-k]");
          if (!b) return;
          kind = b.dataset.k;
          root.querySelectorAll("#pk-kind button").forEach(x => x.classList.toggle("on", x === b));
          render();
        };
        list.onclick = e => {
          const r = e.target.closest(".pk-row");
          if (!r || r.disabled) return;
          const id = +r.dataset.id;
          picked.has(id) ? picked.delete(id) : picked.add(id);
          r.classList.toggle("on");
          root.querySelector(".pk-count").textContent = picked.size
            ? `已选 ${picked.size} 项`
            : "未选择";
          root.querySelector("[data-ok]").disabled = !picked.size;
        };
        root.querySelector("[data-close2]").onclick = close;
        root.querySelector("[data-ok]").onclick = () => {
          const n = linkMaterials(questionId, [...picked]);
          close();
          toast(`已关联 ${n} 份材料`);
        };
      },
    });
  }

  /* ============ 写卡片 / 写答案（真实实现走 ContentEditor；此处以文本框示意） ============ */
  function openComposer(questionId, kind) {
    const q = qById(questionId);
    const isCard = kind === "card";
    openDialog({
      title: isCard ? "写一张卡片" : "写答案",
      width: 760,
      className: "composer",
      body: `
        <div class="cp-q">${statusRing(q.status, "sm")}<span>${esc(q.questionContent)}</span></div>
        <textarea class="cp-area" placeholder="${isCard ? "一张卡片只写一个知识点。首行即卡片标题…" : "用自己的话回答这个问题。可以引用上面的卡片与文章…"}" autofocus></textarea>
        <div class="cp-hint">${
          isCard
            ? `${icon("layers")}保存到卡片库，并自动挂为这个问题的材料（不自动加标签）`
            : `${icon("pen")}独立答案只属于这个问题，不进卡片库；之后可在材料菜单里「转为卡片」`
        }</div>`,
      footer: `<span class="spacer"></span><button class="btn btn-ghost" data-close2>取消</button><button class="btn btn-primary" data-ok>${isCard ? "保存卡片" : "保存答案"}</button>`,
      onMount(root, close) {
        const ta = root.querySelector("textarea");
        setTimeout(() => ta.focus(), 50);
        root.querySelector("[data-close2]").onclick = close;
        const save = () => {
          const text = ta.value.trim();
          if (!text) return close();
          const [first, ...rest] = text.split("\n");
          const m = createMaterial(kind, first.slice(0, 48), rest.join(" ") || first);
          linkMaterials(questionId, [m.id], { created: true });
          close();
          toast(isCard ? "卡片已保存并挂到问题上" : "答案已保存");
        };
        root.querySelector("[data-ok]").onclick = save;
        ta.addEventListener("keydown", e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        });
      },
    });
  }

  /* ============ 材料行（三方案共用外观） ============ */
  function materialHTML(m, { removable = true, compact = false } = {}) {
    const k = KIND[m.kind];
    const meta = [
      k.label,
      m.source,
      m.meta ||
        (m.kind === "article" || m.kind === "doc" ? `${(m.words / 1000).toFixed(1)}k 字` : null),
      relDate(m.createTime),
    ]
      .filter(Boolean)
      .join(" · ");
    return `<div class="mat${compact ? " compact" : ""}" data-mat="${m.id}" tabindex="0">
      <span class="mat-kind">${icon(k.icon)}</span>
      <div class="mat-main">
        <div class="mat-t">${esc(m.title)}</div>
        ${compact ? "" : `<div class="mat-x">${esc(m.excerpt)}</div>`}
        <div class="mat-meta">${meta}</div>
      </div>
      <div class="mat-acts">
        <button class="icon-btn sm" title="${m.kind === "answer" ? "编辑" : "打开" + k.label}">${icon(m.kind === "answer" ? "edit" : "external")}</button>
        ${removable ? `<button class="icon-btn sm" data-unlink="${m.id}" title="解除关联">${icon("unlink")}</button>` : ""}
      </div>
    </div>`;
  }
  /** 材料构成：各类型计数（卡片 3 · 文章 1 …） */
  function compositionHTML(q) {
    const c = {};
    questionMaterials(q).forEach(m => (c[m.kind] = (c[m.kind] || 0) + 1));
    return Object.entries(c)
      .map(([k, n]) => `<span class="comp">${icon(KIND[k].icon)}${n}</span>`)
      .join("");
  }

  /* ============ 探究轨迹渲染 ============ */
  const pad = n => String(n).padStart(2, "0");
  const hm = ts => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;
  function eventHTML(e) {
    const m = e.mat && matById(e.mat);
    const ref = m ? `<span class="tj-ref">${icon(KIND[m.kind].icon)}${esc(m.title)}</span>` : "";
    switch (e.type) {
      case "create":
        return { cls: "start", html: `提出问题` };
      case "link": {
        const verb = e.created
          ? {
              card: "写下卡片",
              article: "写了文章",
              doc: "写了项目文档",
              project: "新建项目",
              whiteboard: "画了白板",
              answer: "写下结论",
            }[m.kind]
          : `关联${KIND[m.kind].label}`;
        return { cls: e.created ? "made" : "", html: `${verb}${ref}` };
      }
      case "unlink":
        return { cls: "muted", html: `移除${KIND[m.kind].label}${ref}` };
      case "status":
        return e.to === "resolved"
          ? { cls: "done", html: `标为已解答` }
          : {
              cls: "",
              html: e.auto ? `挂上第一份材料，进入探究中` : `改为「${STATUS[e.to].label}」`,
            };
      case "note":
        return { cls: "note", html: `<div class="tj-note">${esc(e.text)}</div>` };
    }
  }
  function trajectoryHTML(q) {
    let lastDay = "";
    const items = q.events
      .map(e => {
        const d = fullDate(e.time);
        const head =
          d !== lastDay
            ? `<div class="tj-day">${relDate(e.time) === "今天" ? "今天" : d}</div>`
            : "";
        lastDay = d;
        const { cls, html } = eventHTML(e);
        return `${head}<div class="tj-i ${cls}${e.type === "note" ? "" : " auto"}"><span class="tj-t num">${hm(e.time)}</span><div class="tj-b">${html}</div></div>`;
      })
      .join("");
    return `<div class="tj">${items}</div>
      <label class="tj-add">${icon("note")}<input placeholder="记一笔：读到了什么、卡在哪、换了什么思路…" data-note><kbd>↵</kbd></label>`;
  }
  function trajectoryStats(q) {
    const days = daysBetween(q.createTime, q.resolvedTime || NOW);
    const notes = q.events.filter(e => e.type === "note").length;
    return `${q.status === "resolved" ? `用时 ${days} 天` : `第 ${days} 天`} · ${q.answers.length} 份材料 · ${notes} 条记录`;
  }
  /** 轨迹输入：Enter 写入手动记录 */
  function bindTrajectory(root, getQ) {
    root.addEventListener("keydown", e => {
      if (!e.target.matches("[data-note]") || e.key !== "Enter" || e.isComposing) return;
      const text = e.target.value.trim();
      if (!text) return;
      addNote(getQ().id, text);
      toast("已记入探究轨迹");
    });
  }
  function newMenu(anchor, q) {
    openMenu(
      anchor,
      [
        { section: "新建并挂到这个问题" },
        { label: "卡片", icon: "layers", value: "card" },
        { label: "文章", icon: "file-text", value: "article" },
        { label: "白板", icon: "presentation", value: "whiteboard" },
        { label: "项目", icon: "folder-kanban", value: "project" },
        "-",
        { label: "独立答案", icon: "pen", value: "answer" },
      ],
      e =>
        e.value === "card" || e.value === "answer"
          ? openComposer(q.id, e.value)
          : createFrom(q.id, e.value)
    );
  }

  /* ============ 快速收集输入（Enter 收集，#分组 指定分组） ============ */
  function captureHTML(placeholder = "记下一个问题… 回车收集，#分组 指定分组") {
    return `<div class="capture">
      ${icon("plus")}
      <input class="capture-input" placeholder="${placeholder}">
      <span class="capture-group"></span>
      <kbd>↵</kbd>
    </div>`;
  }
  function bindCapture(root, getGroup, onCreated) {
    const input = root.querySelector(".capture-input");
    const tag = root.querySelector(".capture-group");
    const sync = () => {
      const { groupId } = parseCapture(input.value, getGroup());
      const g = groupById(groupId);
      tag.innerHTML = `<i class="pdot" style="--c:var(--pc-${g.color})"></i>${esc(g.title)}`;
    };
    input.addEventListener("input", sync);
    input.addEventListener("keydown", e => {
      if (e.key !== "Enter" || e.isComposing) return;
      const { title, groupId } = parseCapture(input.value, getGroup());
      if (!title) return;
      const q = createQuestion({ title, groupId });
      input.value = "";
      sync();
      onCreated?.(q);
      toast(`已收集到「${groupById(groupId).title}」`);
    });
    sync();
    return { focus: () => input.focus(), sync };
  }

  window.QM = {
    icon,
    esc,
    NOW,
    D,
    relDate,
    fullDate,
    daysBetween,
    STATUS,
    STATUS_ORDER,
    statusRing,
    KIND,
    groups,
    questions,
    materials,
    qById,
    groupById,
    matById,
    questionMaterials,
    byGroup,
    counts,
    sortQuestions,
    on,
    emit,
    createQuestion,
    updateQuestion,
    setStatus,
    moveToGroup,
    deleteQuestion,
    linkMaterials,
    unlinkMaterial,
    reorder,
    mountShell,
    openMenu,
    closeMenu,
    statusMenu,
    groupMenu,
    questionMenu,
    toast,
    openDialog,
    openPicker,
    openComposer,
    materialHTML,
    compositionHTML,
    captureHTML,
    bindCapture,
    addNote,
    createFrom,
    newMenu,
    trajectoryHTML,
    trajectoryStats,
    bindTrajectory,
  };
})();
