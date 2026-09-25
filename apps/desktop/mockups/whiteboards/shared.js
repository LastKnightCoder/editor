/*
  白板列表三方案共用：mock 数据 + 画布缩略图渲染 + 壳层 / 浮层 / 动作（模拟 IPC）。
  数据形状对齐 types/white-board.ts：WhiteBoard { id, title, description, snapshot, createTime, updateTime,
  whiteBoardContentList: WhiteBoardContent[{ id, name, data.children: BoardElement[], data.presentationSequences }] }。
  列表接口本来就带回全部子白板与元素，所以缩略图直接由真实元素几何画出，不用占位图。
  视觉参考，非导出源（D-001）。
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
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-left": '<path d="m15 18-6-6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    "image-off":
      '<path d="m2 2 20 20"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><path d="M13.5 13.5 6 21"/><path d="M18 12l3 3"/><path d="M3.59 3.59A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    "external-link":
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    "app-window":
      '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4M2 8h20M6 4v4"/>',
    files:
      '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    "panels-top": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    rows: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
    "arrow-up-down": '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
    shapes:
      '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
    "sticky-note":
      '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    network:
      '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
    frame: '<path d="M22 6H2M22 18H2M6 2v20M18 2v20"/>',
    spline:
      '<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>',
    "move-right": '<path d="M18 8l4 4-4 4M2 12h20"/>',
    video:
      '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    globe:
      '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    "corner-down-left": '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
  };
  function injectSprite() {
    if (document.getElementById("wb-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "wb-sprite";
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
  const NOW = new Date(2026, 8, 25, 15, 20, 0).getTime();
  const pad = n => String(n).padStart(2, "0");
  function rel(ts) {
    const d = NOW - ts;
    if (d < MIN) return "刚刚";
    if (d < H) return `${Math.floor(d / MIN)} 分钟前`;
    if (d < D) return `${Math.floor(d / H)} 小时前`;
    if (d < 2 * D) return "昨天";
    if (d < 7 * D) return `${Math.floor(d / D)} 天前`;
    const t = new Date(ts);
    return t.getFullYear() === new Date(NOW).getFullYear()
      ? `${t.getMonth() + 1}月${t.getDate()}日`
      : `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
  }
  function fullDate(ts) {
    const t = new Date(ts);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }
  /** 时间分组（C 方案行列表用） */
  function bucket(ts) {
    const d = new Date(NOW);
    const today0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (ts >= today0) return "今天";
    if (ts >= today0 - 6 * D) return "近 7 天";
    if (ts >= today0 - 29 * D) return "近 30 天";
    return "更早";
  }

  /* ============ 元素生成（确定性随机） ============ */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  const SOFTS = ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "accent"];

  const T = {
    mind(r, ox, oy) {
      const kids = 4 + Math.floor(r() * 3);
      const tree = [];
      for (let i = 0; i < kids; i++) {
        const side = i % 2 ? -1 : 1;
        tree.push({ side, gk: 1 + Math.floor(r() * 3), c: SOFTS[i % 5] });
      }
      return [{ type: "mind", x: ox, y: oy, w: 900, h: 520, tree }];
    },
    flow(r, ox, oy) {
      const n = 4 + Math.floor(r() * 2);
      const out = [];
      let x = ox;
      const ys = [];
      for (let i = 0; i < n; i++) {
        const y = oy + (i % 2 ? 90 : 0) + r() * 40;
        const shape = i === 2 ? "diamond" : i === 0 ? "ellipse" : "rect";
        out.push({ type: "geometry", shape, x, y, w: 150, h: shape === "diamond" ? 110 : 76 });
        ys.push(y + (shape === "diamond" ? 55 : 38));
        if (i)
          out.push({
            type: "arrow",
            pts: [
              [x - 60, ys[i - 1]],
              [x, ys[i]],
            ],
          });
        x += 210;
      }
      out.push({ type: "richtext", x: ox, y: oy - 90, w: 320, h: 40, lines: 1, big: true });
      return out;
    },
    stickies(r, ox, oy) {
      const cols = 4,
        n = 6 + Math.floor(r() * 6);
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push({
          type: "card",
          x: ox + (i % cols) * 170 + r() * 14,
          y: oy + Math.floor(i / cols) * 150 + r() * 14,
          w: 146,
          h: 124,
          c: SOFTS[Math.floor(r() * 5)],
          lines: 2 + Math.floor(r() * 2),
        });
      }
      return out;
    },
    mood(r, ox, oy) {
      const out = [];
      const sizes = [
        [0, 0, 300, 220],
        [320, 0, 200, 280],
        [540, 0, 260, 170],
        [0, 240, 180, 160],
        [540, 190, 260, 210],
      ];
      sizes.forEach(([x, y, w, h], i) =>
        out.push({ type: "image", x: ox + x, y: oy + y, w, h, g: (i * 5 + 2) % 12 })
      );
      out.push({ type: "richtext", x: ox + 200, y: oy + 300, w: 300, h: 70, lines: 3 });
      return out;
    },
    lecture(r, ox, oy) {
      return [
        { type: "frame", x: ox, y: oy, w: 760, h: 460 },
        { type: "richtext", x: ox + 40, y: oy + 40, w: 380, h: 44, lines: 1, big: true },
        { type: "richtext", x: ox + 40, y: oy + 110, w: 360, h: 150, lines: 6 },
        { type: "image", x: ox + 440, y: oy + 100, w: 280, h: 190, g: Math.floor(r() * 12) },
        { type: "geometry", shape: "rect", x: ox + 40, y: oy + 300, w: 150, h: 70 },
        { type: "geometry", shape: "rect", x: ox + 250, y: oy + 300, w: 150, h: 70 },
        {
          type: "arrow",
          pts: [
            [ox + 190, oy + 335],
            [ox + 250, oy + 335],
          ],
        },
        { type: "handwrite", pts: squiggle(r, ox + 470, oy + 330, 230, 60) },
      ];
    },
    sketch(r, ox, oy) {
      const out = [];
      for (let i = 0; i < 3; i++)
        out.push({
          type: "handwrite",
          pts: squiggle(r, ox + r() * 300, oy + i * 120 + r() * 30, 260 + r() * 200, 70),
        });
      out.push({ type: "geometry", shape: "ellipse", x: ox + 520, y: oy + 40, w: 170, h: 120 });
      out.push({ type: "geometry", shape: "rect", x: ox + 480, y: oy + 220, w: 230, h: 140 });
      return out;
    },
    room(r, ox, oy) {
      return [
        { type: "geometry", shape: "rect", x: ox, y: oy, w: 720, h: 460 },
        { type: "geometry", shape: "rect", x: ox + 30, y: oy + 30, w: 260, h: 120 },
        { type: "geometry", shape: "rect", x: ox + 460, y: oy + 40, w: 220, h: 90 },
        { type: "geometry", shape: "ellipse", x: ox + 300, y: oy + 220, w: 140, h: 140 },
        { type: "geometry", shape: "rect", x: ox + 40, y: oy + 330, w: 180, h: 100 },
        { type: "handwrite", pts: squiggle(r, ox + 480, oy + 300, 200, 90) },
        { type: "richtext", x: ox + 460, y: oy + 170, w: 200, h: 40, lines: 2 },
      ];
    },
    video(r, ox, oy) {
      return [
        { type: "video", x: ox, y: oy, w: 420, h: 240 },
        { type: "richtext", x: ox + 460, y: oy + 10, w: 280, h: 200, lines: 7 },
      ];
    },
  };
  function squiggle(r, x, y, w, h) {
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++)
      pts.push([x + (w * i) / n, y + h / 2 + Math.sin(i * 1.3 + r() * 2) * h * 0.45]);
    return pts;
  }
  /** 一页 = 若干模板按位置拼起来 */
  function makePage(seed, parts) {
    const r = rng(seed);
    let els = [];
    parts.forEach((p, i) => {
      const ox = i % 2 ? 1020 : 0;
      const oy = i > 1 ? 640 : 0;
      els = els.concat(T[p](r, ox, oy));
    });
    return els;
  }

  const TYPE_META = {
    geometry: ["图形", "shapes"],
    arrow: ["连线", "move-right"],
    card: ["卡片", "sticky-note"],
    richtext: ["文本", "type"],
    image: ["图片", "image"],
    mind: ["思维导图", "network"],
    frame: ["画框", "frame"],
    handwrite: ["手绘", "spline"],
    video: ["视频", "video"],
  };

  /* ============ mock 数据（12 个白板） ============ */
  const RAW = [
    [
      "Transformer 结构拆解",
      "从注意力到位置编码，对着论文逐层画一遍。",
      40,
      2 * H,
      [
        ["总览", "mind"],
        ["注意力机制", "lecture"],
        ["位置编码", "lecture", "sketch"],
        ["训练技巧", "stickies"],
      ],
      2,
    ],
    [
      "Q4 产品规划",
      "季度目标、路线图与风险，周会上和团队对齐用。",
      12,
      26 * H,
      [
        ["目标", "stickies"],
        ["路线图", "flow", "stickies"],
        ["风险清单", "stickies"],
      ],
      1,
    ],
    [
      "编辑器架构草图",
      "Slate 插件体系与渲染管线的分层。",
      20,
      5 * H,
      [
        ["分层", "flow"],
        ["数据流", "flow", "sketch"],
      ],
      0,
    ],
    [
      "日语 N2 语法地图",
      "",
      70,
      3 * D,
      [
        ["助词", "mind"],
        ["敬语", "mind"],
        ["常用句型", "stickies"],
        ["错题", "sketch"],
      ],
      0,
    ],
    [
      "周会白板",
      "每周一复盘，一周一页。",
      30,
      20 * H,
      [
        ["9月第1周", "stickies"],
        ["9月第2周", "stickies"],
        ["9月第3周", "stickies"],
        ["9月第4周", "stickies"],
      ],
      0,
    ],
    [
      "旅行灵感 · 京都",
      "寺院、町屋、咖啡馆和路线草稿。",
      50,
      8 * D,
      [
        ["灵感板", "mood"],
        ["行程", "flow"],
      ],
      0,
      true,
    ],
    [
      "读书笔记 ·《思考，快与慢》",
      "",
      90,
      12 * D,
      [
        ["系统一与系统二", "mind"],
        ["偏差清单", "stickies"],
      ],
      0,
    ],
    ["未命名白板", "", 0.01, 10 * MIN, [["未命名"]], 0],
    [
      "React 渲染流程",
      "Fiber、调度与提交阶段，配讲解视频。",
      120,
      30 * D,
      [["渲染流程", "flow", "video"]],
      1,
    ],
    [
      "家里装修布局",
      "客厅与厨房的尺寸草图。",
      150,
      45 * D,
      [
        ["客厅", "room"],
        ["厨房", "room"],
      ],
      0,
      true,
    ],
    [
      "机器学习复习提纲",
      "",
      200,
      60 * D,
      [
        ["监督学习", "mind"],
        ["无监督学习", "mind"],
        ["评估指标", "lecture"],
      ],
      0,
    ],
    ["播客选题池", "想到就贴一张。", 260, 92 * D, [["选题", "stickies", "stickies"]], 0],
  ];
  /** 标签（WhiteBoard.tags 真实字段，string[]）+ 标签色（与日记 DiaryTagSetting 同形：name → Tag 七色） */
  const TAGS0 = [
    ["学习", "blue"],
    ["工作", "orange"],
    ["生活", "green"],
    ["读书", "purple"],
  ];
  const BOARD_TAGS = [
    ["学习"],
    ["工作"],
    ["工作"],
    ["学习"],
    ["工作"],
    ["生活"],
    ["读书", "学习"],
    [],
    ["学习"],
    ["生活"],
    ["学习"],
    [],
  ];
  /** 引用它的项目条目（get-project-item-by-ref("white-board", id) 已有接口） */
  const BOARD_REFS = {
    101: ["深度学习入门", "论文精读 2026"],
    103: ["Tau 编辑器"],
    109: ["前端进阶"],
    111: ["深度学习入门"],
  };
  function buildBoards() {
    return RAW.map(
      ([title, description, createdDaysAgo, updatedAgo, pages, sequences, cover], i) => {
        const id = 101 + i;
        return {
          id,
          title,
          description,
          snapshot: cover ? `cover-${id}` : "",
          createTime: NOW - createdDaysAgo * D,
          updateTime: NOW - updatedAgo,
          sequences,
          tags: BOARD_TAGS[i].slice(),
          refs: BOARD_REFS[id] || [],
          pages: pages.map(([name, ...parts], j) => ({
            id: id * 10 + j,
            name,
            elements: parts.length ? makePage(id * 31 + j * 7, parts) : [],
          })),
        };
      }
    );
  }

  const S = {
    boards: buildBoards(),
    sort: "updated",
    empty: false,
    tags: TAGS0.map(([name, color]) => ({ name, color })),
  };
  const listeners = [];
  const on = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn());

  const elementCount = b => b.pages.reduce((n, p) => n + p.elements.length, 0);
  function breakdown(b) {
    const m = {};
    b.pages.forEach(p => p.elements.forEach(e => (m[e.type] = (m[e.type] || 0) + 1)));
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => ({ type, n, label: TYPE_META[type][0], icon: TYPE_META[type][1] }));
  }
  function sorted() {
    if (S.empty) return [];
    const list = S.boards.slice();
    if (S.sort === "updated") list.sort((a, b) => b.updateTime - a.updateTime);
    else if (S.sort === "created") list.sort((a, b) => b.createTime - a.createTime);
    else list.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    return list;
  }
  const findB = id => S.boards.find(b => b.id === id);

  /* ============ 缩略图（SVG，按元素几何绘制） ============ */
  const COVER_GRADIENTS = [
    ["#e8c4a8", "#d9885f"],
    ["#ccd8c2", "#96ab8a"],
    ["#c8d2dd", "#92a5b8"],
    ["#e2cf9f", "#c0a05e"],
    ["#e5c9c4", "#c98d84"],
    ["#cfc8ba", "#a39682"],
    ["#eccaa2", "#d89a5e"],
    ["#d3dcc6", "#a3b58e"],
    ["#cfe0dc", "#9dbbb4"],
    ["#ddd4e0", "#b3a3c4"],
    ["#eed3c2", "#dd9a86"],
    ["#ddd8a5", "#b3a860"],
  ];
  function bbox(els) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const add = (x, y) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    els.forEach(e =>
      e.pts ? e.pts.forEach(([x, y]) => add(x, y)) : (add(e.x, e.y), add(e.x + e.w, e.y + e.h))
    );
    return { x0, y0, x1, y1 };
  }
  let gid = 0;
  function textBars(x, y, w, h, n, big) {
    const out = [];
    const lh = big ? h : Math.min(22, h / n);
    for (let i = 0; i < n; i++) {
      const ww = i === n - 1 && n > 1 ? w * 0.6 : w * (0.85 + ((i * 37) % 15) / 100);
      out.push(
        `<rect x="${x}" y="${y + i * lh + lh * 0.25}" width="${ww}" height="${big ? lh * 0.55 : lh * 0.42}" rx="${lh * 0.2}" style="fill:var(--${big ? "ink-3" : "th-bar"})"/>`
      );
    }
    return out.join("");
  }
  function drawEl(e, defs) {
    const sw = "vector-effect:non-scaling-stroke";
    switch (e.type) {
      case "geometry": {
        const st = `fill:var(--bg-surface);stroke:var(--ink-3);stroke-width:1.2;${sw}`;
        if (e.shape === "ellipse")
          return `<ellipse cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}" style="${st}"/>`;
        if (e.shape === "diamond") {
          const cx = e.x + e.w / 2,
            cy = e.y + e.h / 2;
          return `<path d="M${cx} ${e.y}L${e.x + e.w} ${cy}L${cx} ${e.y + e.h}L${e.x} ${cy}Z" style="${st}"/>`;
        }
        return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="10" style="${st}"/>`;
      }
      case "arrow": {
        const [[ax, ay], [bx, by]] = e.pts;
        const mx = (ax + bx) / 2;
        const ang = Math.atan2(by - ay, bx - mx);
        const hx = bx - 16 * Math.cos(ang - 0.45),
          hy = by - 16 * Math.sin(ang - 0.45);
        const kx = bx - 16 * Math.cos(ang + 0.45),
          ky = by - 16 * Math.sin(ang + 0.45);
        return `<path d="M${ax} ${ay}C${mx} ${ay} ${mx} ${by} ${bx} ${by}M${hx} ${hy}L${bx} ${by}L${kx} ${ky}" style="fill:none;stroke:var(--ink-3);stroke-width:1.2;${sw}"/>`;
      }
      case "card":
        return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="8" style="fill:var(--${e.c}-soft);stroke:color-mix(in srgb,var(--${e.c}) 30%,transparent);stroke-width:1;${sw}"/>${textBars(e.x + 16, e.y + 18, e.w - 32, 70, e.lines)}`;
      case "richtext":
        return textBars(e.x, e.y, e.w, e.h, e.lines, e.big);
      case "image": {
        const id = `g${++gid}`;
        const [a, b] = COVER_GRADIENTS[e.g % 12];
        defs.push(
          `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
        );
        return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="8" fill="url(#${id})"/><path d="M${e.x + e.w * 0.1} ${e.y + e.h * 0.85}L${e.x + e.w * 0.38} ${e.y + e.h * 0.5}L${e.x + e.w * 0.58} ${e.y + e.h * 0.72}L${e.x + e.w * 0.72} ${e.y + e.h * 0.58}L${e.x + e.w * 0.9} ${e.y + e.h * 0.85}Z" fill="rgba(255,255,255,.35)"/>`;
      }
      case "video":
        return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="10" style="fill:var(--ink-2);opacity:.85"/><path d="M${e.x + e.w / 2 - 22} ${e.y + e.h / 2 - 28}l54 28-54 28z" style="fill:var(--bg-surface)"/>`;
      case "frame":
        return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="14" style="fill:color-mix(in srgb,var(--bg-surface) 70%,transparent);stroke:var(--line-1);stroke-width:1.2;stroke-dasharray:5 4;${sw}"/>`;
      case "handwrite": {
        const d = e.pts.map(([x, y], i) => (i ? `L${x} ${y}` : `M${x} ${y}`)).join("");
        return `<path d="${d}" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;${sw}"/>`;
      }
      case "mind": {
        const cx = e.x + e.w / 2,
          cy = e.y + e.h / 2;
        const out = [];
        const per = { 1: [], [-1]: [] };
        e.tree.forEach(k => per[k.side].push(k));
        [1, -1].forEach(side => {
          const ks = per[side];
          ks.forEach((k, i) => {
            const ky = e.y + ((i + 0.5) / ks.length) * e.h;
            const kx = cx + side * 250;
            out.push(
              `<path d="M${cx + side * 80} ${cy}C${cx + side * 170} ${cy} ${cx + side * 160} ${ky} ${kx - side * 60} ${ky}" style="fill:none;stroke:var(--${k.c});stroke-width:1.6;opacity:.7;${sw}"/>`
            );
            out.push(
              `<rect x="${kx - 60}" y="${ky - 20}" width="120" height="40" rx="20" style="fill:var(--${k.c}-soft);stroke:var(--${k.c});stroke-width:1;${sw}"/>`
            );
            for (let g = 0; g < k.gk; g++) {
              const gy = ky + (g - (k.gk - 1) / 2) * 34;
              const gx = kx + side * 170;
              out.push(
                `<path d="M${kx + side * 60} ${ky}C${kx + side * 90} ${ky} ${kx + side * 90} ${gy} ${gx - side * 45} ${gy}" style="fill:none;stroke:var(--${k.c});stroke-width:1;opacity:.5;${sw}"/>`
              );
              out.push(
                `<rect x="${gx - 45}" y="${gy - 6}" width="90" height="12" rx="6" style="fill:var(--th-bar)"/>`
              );
            }
          });
        });
        out.push(
          `<rect x="${cx - 80}" y="${cy - 28}" width="160" height="56" rx="14" style="fill:var(--accent)"/>`
        );
        out.push(
          `<rect x="${cx - 48}" y="${cy - 6}" width="96" height="12" rx="6" style="fill:var(--ink-inverse);opacity:.85"/>`
        );
        return out.join("");
      }
    }
    return "";
  }
  /** 一页画布的缩略图；等比 fit 进 16:10 视窗（与画布「适应全部」同口径） */
  function pageSVG(page, { ratio = 1.6 } = {}) {
    if (!page.elements.length)
      return `<div class="thumb-empty">${icon("presentation")}<span>空白画布</span></div>`;
    const { x0, y0, x1, y1 } = bbox(page.elements);
    let w = x1 - x0,
      h = y1 - y0;
    const padd = Math.max(w, h) * 0.08;
    let vx = x0 - padd,
      vy = y0 - padd;
    w += padd * 2;
    h += padd * 2;
    if (w / h > ratio) {
      const nh = w / ratio;
      vy -= (nh - h) / 2;
      h = nh;
    } else {
      const nw = h * ratio;
      vx -= (nw - w) / 2;
      w = nw;
    }
    const defs = [];
    const body = page.elements.map(e => drawEl(e, defs)).join("");
    return `<svg class="thumb-svg" viewBox="${vx} ${vy} ${w} ${h}" preserveAspectRatio="xMidYMid meet"><defs>${defs.join("")}</defs>${body}</svg>`;
  }
  /** 白板封面：有用户封面用封面，否则用第 N 页（默认第一页）的画布缩略图 */
  function coverHTML(b, pageIdx = 0) {
    if (b.snapshot) {
      const [a, c] = COVER_GRADIENTS[(b.id * 7 + 3) % 12];
      return `<div class="thumb-cover" style="background:radial-gradient(120% 90% at 20% 15%, rgba(255,255,255,.45), transparent 55%),linear-gradient(150deg, ${a}, ${c})"><span class="cover-note">${icon("image")}自定义封面</span></div>`;
    }
    return pageSVG(b.pages[pageIdx] || b.pages[0]);
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
        ["presentation", "白板", true],
      ],
    ],
    [
      "学习",
      [
        ["folder-kanban", "项目"],
        ["repeat", "闪卡复习"],
        ["help", "问题管理"],
      ],
    ],
  ];
  function mountShell({ demos = [] } = {}) {
    injectSprite();
    const theme = localStorage.getItem("wb-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section"><div class="nav-label">${label}</div>${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}"${active ? ' id="nav-self"' : ""}>${icon(ic)}${name}</button>${active ? '<div id="nav-sub"></div>' : ""}`
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
            <span class="titlebar-crumb">白板</span>
            <span class="titlebar-spacer"></span>
            <div class="demo" title="mockup 演示控制，非产品 UI"><span>演示</span>
              <button data-demo="normal" class="on">正常</button><button data-demo="empty">空态</button>
              ${demos.length ? '<span class="sep"></span>' : ""}${demos.map((d, i) => `<button data-xdemo="${i}">${d.label}</button>`).join("")}
            </div>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root" style="min-height:0"></div>
        </main>
      </div>`;
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("wb-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    document.querySelectorAll("[data-demo]").forEach(
      b =>
        (b.onclick = () => {
          S.empty = b.dataset.demo === "empty";
          document.querySelectorAll("[data-demo]").forEach(x => x.classList.toggle("on", x === b));
          emit();
        })
    );
    document
      .querySelectorAll("[data-xdemo]")
      .forEach(b => (b.onclick = () => demos[+b.dataset.xdemo].run(b)));
    return { page: document.getElementById("page-root") };
  }

  /* ============ Menu / Toast / Dialog ============ */
  let menuEl = null,
    menuCleanup = null;
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    if (menuCleanup) menuCleanup();
    menuCleanup = null;
  }
  function place(el, anchor, placement, gap = 6) {
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    let x = placement.endsWith("end") ? r.right - w : r.left;
    let y = placement.startsWith("top") ? r.top - h - gap : r.bottom + gap;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - gap);
    el.style.left = Math.max(8, x) + "px";
    el.style.top = y + "px";
  }
  /** anchor 可为元素或 {left,right,top,bottom}（右键菜单） */
  function openMenu(anchor, entries, opts = {}) {
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : `<button class="menu-item${e.danger ? " danger" : ""}" data-i="${i}"${e.disabled ? " disabled" : ""}>${e.icon ? icon(e.icon) : ""}${e.label}${e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
    document.body.appendChild(el);
    place(el, anchor, opts.placement || "bottom-end");
    requestAnimationFrame(() => el.classList.add("open"));
    const host = anchor.closest && anchor.closest(".hover-host");
    host && host.classList.add("menu-on");
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const entry = entries[+b.dataset.i];
      closeMenu();
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
      host && host.classList.remove("menu-on");
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
    document.body.appendChild(el);
    const draw = () => {
      el.innerHTML = render(close);
      opts.bind && opts.bind(el, close, draw);
    };
    const onDown = ev => {
      if (dialogs.length) return;
      if (!el.contains(ev.target) && !(anchor.contains && anchor.contains(ev.target))) close();
    };
    const onKey = ev => {
      if (ev.key === "Escape" && !dialogs.length) {
        ev.stopPropagation();
        close();
      }
    };
    function close() {
      el.remove();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      if (popClose === close) popClose = null;
      opts.onClose && opts.onClose();
    }
    draw();
    place(el, anchor, opts.placement || "bottom-start", 8);
    requestAnimationFrame(() => el.classList.add("open"));
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey, true);
    });
    popClose = close;
    return close;
  }

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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), undo ? 5000 : 2400);
  }

  const dialogs = [];
  function openDialog(render, opts = {}) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="dlg" style="${opts.width ? `width:${opts.width}px` : ""}"></div>`;
    const box = ov.firstElementChild;
    document.body.appendChild(ov);
    function close() {
      const i = dialogs.indexOf(close);
      if (i >= 0) dialogs.splice(i, 1);
      ov.classList.remove("open");
      setTimeout(() => ov.remove(), 180);
    }
    box.innerHTML = render(close);
    opts.bind && opts.bind(box, close);
    ov.addEventListener("mousedown", ev => ev.target === ov && close());
    dialogs.push(close);
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
  const dialogOpen = () => dialogs.length > 0 || !!menuEl;

  /* ============ 动作（模拟 IPC） ============ */
  function open(b, pageIdx = 0) {
    const p = b.pages[pageIdx];
    toast(
      `打开「${esc(b.title || "未命名白板")}」${b.pages.length > 1 ? ` · ${esc(p.name)}` : ""}（mock：进入白板页）`
    );
  }
  function present(b) {
    toast(`从头演示「${esc(b.title)}」· ${b.sequences} 个演示序列（mock）`);
  }
  /** 新建 / 编辑信息：标题 + 描述（封面在卡片菜单里换，不塞进表单） */
  function editDialog(b) {
    const creating = !b;
    openDialog(
      close => `
      <h3>${creating ? "新建白板" : "编辑信息"}</h3>
      <div class="field" style="margin-top:16px"><label>标题</label><input class="input" id="f-title" autofocus placeholder="未命名白板" value="${esc(b ? b.title : "")}"></div>
      <div class="field"><label>描述 <span class="muted" style="font-weight:400">· 可选</span></label><textarea class="input ta" id="f-desc" rows="3" placeholder="这块白板用来做什么">${esc(b ? b.description : "")}</textarea></div>
      <div class="dfoot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-primary" data-ok>${creating ? "创建并打开" : "保存"}</button></div>`,
      {
        width: 440,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          const ok = () => {
            const title = box.querySelector("#f-title").value.trim() || "未命名白板";
            const description = box.querySelector("#f-desc").value.trim();
            if (creating) {
              const id = Math.max(...S.boards.map(x => x.id)) + 1;
              const nb = {
                id,
                title,
                description,
                snapshot: "",
                createTime: NOW,
                updateTime: NOW,
                sequences: 0,
                tags: S.newTags ? S.newTags() : [],
                refs: [],
                pages: [{ id: id * 10, name: title, elements: [] }],
              };
              S.boards.push(nb);
              S.lastCreated = id;
              emit();
              open(nb);
            } else {
              Object.assign(b, { title, description, updateTime: NOW });
              emit();
              toast("已保存");
            }
            close();
          };
          box.querySelector("[data-ok]").onclick = ok;
          box
            .querySelector("#f-title")
            .addEventListener("keydown", ev => ev.key === "Enter" && ok());
        },
      }
    );
  }
  function setCover(b) {
    b.snapshot = `cover-${b.id}`;
    emit();
    toast("已更换封面（mock：系统文件选择器 → 本地图片）");
  }
  function clearCover(b) {
    const prev = b.snapshot;
    b.snapshot = "";
    emit();
    toast("已改用画布缩略图", () => {
      b.snapshot = prev;
      emit();
    });
  }
  function remove(b) {
    const n = elementCount(b);
    openDialog(
      close => `
      <h3>删除「${esc(b.title)}」？</h3>
      <p class="dsub">${b.pages.length} 页、共 ${n} 个元素会一起删除，删除后无法恢复。</p>
      ${b.refs && b.refs.length ? `<div class="refs"><div class="refs-h">${icon("folder-kanban")}被 ${b.refs.length} 个项目引用</div>${b.refs.map(r => `<div class="refs-i">${esc(r)}</div>`).join("")}<div class="refs-f">删除后，这些项目里的白板条目会解除关联。</div></div>` : ""}
      <div class="dfoot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-danger" data-ok>删除</button></div>`,
      {
        width: 400,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            S.boards = S.boards.filter(x => x !== b);
            close();
            emit();
            toast(`已删除「${esc(b.title)}」`);
          };
        },
      }
    );
  }
  function addPage(b) {
    const name = `第 ${b.pages.length + 1} 页`;
    b.pages.push({ id: b.id * 10 + b.pages.length, name, elements: [] });
    b.updateTime = NOW;
    emit();
    open(b, b.pages.length - 1);
  }
  /** 卡片「更多」菜单（三方案共用） */
  function boardMenu(anchor, b, opts = {}) {
    openMenu(
      anchor,
      [
        { label: "打开", icon: "corner-down-left", k: "↵", run: () => open(b) },
        {
          label: "在新窗口打开",
          icon: "app-window",
          run: () => toast("在新窗口打开（Electron 专属，Web 端不渲染此项）"),
        },
        ...(b.sequences ? [{ label: "从头演示", icon: "play", run: () => present(b) }] : []),
        "-",
        { label: "编辑信息", icon: "edit", run: () => editDialog(b) },
        ...(opts.extra || []),
        { label: b.snapshot ? "更换封面" : "设置封面", icon: "image", run: () => setCover(b) },
        ...(b.snapshot ? [{ label: "移除封面", icon: "image-off", run: () => clearCover(b) }] : []),
        "-",
        { label: "删除", icon: "trash", danger: true, run: () => remove(b) },
      ],
      opts
    );
  }

  /** 空态（三方案共用） */
  const emptyHTML = () => `
    <div class="empty fade-in">
      <div class="glyph">${icon("presentation")}</div>
      <h3>还没有白板</h3>
      <p>白板适合画结构、贴想法、做演示。一块白板可以有多页。</p>
      <div class="acts"><button class="btn btn-soft" data-new>${icon("plus")}新建白板</button></div>
    </div>`;

  /** 排序 Segmented */
  const sortSeg = () => `
    <div class="seg" id="sort">
      <button data-s="updated" class="${S.sort === "updated" ? "on" : ""}">最近更新</button>
      <button data-s="created" class="${S.sort === "created" ? "on" : ""}">创建时间</button>
      <button data-s="title" class="${S.sort === "title" ? "on" : ""}">名称</button>
    </div>`;
  function bindSort(root) {
    root.querySelectorAll("#sort [data-s]").forEach(
      b =>
        (b.onclick = () => {
          S.sort = b.dataset.s;
          emit();
        })
    );
  }
  const summary = () => {
    if (S.empty) return "";
    const pages = S.boards.reduce((n, b) => n + b.pages.length, 0);
    return `<b>${S.boards.length}</b> 个白板<span class="sep">·</span><b>${pages}</b> 页`;
  };

  window.WB = {
    S,
    on,
    emit,
    icon,
    esc,
    rel,
    fullDate,
    bucket,
    NOW,
    sorted,
    findB,
    elementCount,
    breakdown,
    pageSVG,
    coverHTML,
    mountShell,
    openMenu,
    closeMenu,
    openPop,
    toast,
    openDialog,
    dialogOpen,
    open,
    present,
    editDialog,
    setCover,
    clearCover,
    remove,
    addPage,
    boardMenu,
    emptyHTML,
    sortSeg,
    bindSort,
    summary,
    TYPE_META,
  };
})();
