/*
  白板画布 chrome 换皮 · 三方案共用逻辑。
  画布世界（元素按真实类型画出，可选中 / 拖动 / 框选 / 平移 / 缩放）+ 工具条 / 属性 / 状态栏 / 元素树 / 右键菜单 / 插入弹窗 / 演示序列。
  三方案只在两处不同：工具条形态（top / left / dock）与属性形态（float / rail / inspector），由 WBC.mount(opts) 传入。
  元素本身的画法沿用现状（不在本轮范围）；标题栏「主题化元素」开关只用来预览「如果连默认样式一起换」的样子。
  视觉参考，非导出源（D-001）。
*/
(function () {
  "use strict";
  const X = window.WB;
  const { icon, esc } = X;

  /* ───────── 图标补充（lucide 线性） ───────── */
  const EXTRA = {
    filter: '<path d="M3 6h18M7 12h10M10 18h4"/>',
    "panel-left": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    listtree: '<path d="M21 12h-8M21 6H8M21 18h-8M3 6v4c0 1.1.9 2 2 2h3M3 10v6c0 1.1.9 2 2 2h3"/>',
    minus: '<path d="M5 12h14"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    square: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    heart:
      '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    triangle: '<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
    "arrow-up-right": '<path d="M7 7h10v10M7 17 17 7"/>',
    pencil:
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    "audio-lines": '<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    clapperboard:
      '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sparkles:
      '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v4M21 5h-4"/>',
    tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
    youtube:
      '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
    "volume-2":
      '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.8"/>',
    "square-plus": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/>',
    library: '<path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/>',
    "line-w":
      '<path d="M3 6h18" stroke-width="1"/><path d="M3 12h18" stroke-width="2"/><path d="M3 18h18" stroke-width="3.2"/>',
    corner: '<path d="M4 20V10a6 6 0 0 1 6-6h10"/>',
    "align-center": '<path d="M17 12H7M19 18H5M21 6H3"/>',
    "align-left": '<path d="M15 12H3M17 18H3M21 6H3"/>',
    "align-right": '<path d="M21 12H9M21 18H7M21 6H3"/>',
    scribble: '<path d="M3 17c3-7 5-10 7-10s-1 8 1 8 4-6 6-6-1 4 1 4 3-2 3-2"/>',
    "l-straight": '<path d="M5 19 19 5"/>',
    "l-curve": '<path d="M4 19c8 0 8-14 16-14"/>',
    "l-ortho": '<path d="M4 19h8V5h8"/>',
    "m-start": '<path d="M21 12H6"/><path d="m10 7-5 5 5 5"/>',
    "m-end": '<path d="M3 12h15"/><path d="m14 7 5 5-5 5"/>',
    dash: '<path d="M3 12h4M10 12h4M17 12h4"/>',
    waves: '<path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
    padding:
      '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    shadow: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M21 7v12a2 2 0 0 1-2 2H7"/>',
    "fold-v":
      '<path d="M12 22v-6M12 8V2M4 12H2M10 12H8M16 12h-2M22 12h-2M15 19l-3-3-3 3M15 5l-3 3-3-3"/>',
    "fold-h":
      '<path d="M2 12h6M22 12h-6M12 2v2M12 8v2M12 14v2M12 20v2M19 9l-3 3 3 3M5 15l3-3-3-3"/>',
    palette:
      '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.7h2c3 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/>',
    droplet:
      '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    brush:
      '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    signature: '<path d="M3 17c4-4 6-11 3-11s-3 6 2 10 7-3 7-3"/><path d="M15 17h6"/>',
    captions:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
    heading: '<path d="M6 12h12M6 20V4M18 20V4"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
    ungroup:
      '<rect x="5" y="4" width="6" height="6" rx="1"/><rect x="13" y="14" width="6" height="6" rx="1"/><path d="M5 14v6h6M19 10V4h-6"/>',
    "al-left":
      '<path d="M4 2v20"/><rect x="8" y="5" width="12" height="5" rx="1"/><rect x="8" y="14" width="7" height="5" rx="1"/>',
    "al-right":
      '<path d="M20 2v20"/><rect x="4" y="5" width="12" height="5" rx="1"/><rect x="9" y="14" width="7" height="5" rx="1"/>',
    "al-top":
      '<path d="M2 4h20"/><rect x="5" y="8" width="5" height="12" rx="1"/><rect x="14" y="8" width="5" height="7" rx="1"/>',
    "al-bottom":
      '<path d="M2 20h20"/><rect x="5" y="4" width="5" height="12" rx="1"/><rect x="14" y="9" width="5" height="7" rx="1"/>',
    "dist-h":
      '<rect x="3" y="7" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="17" y="8" width="4" height="8" rx="1"/>',
    "dist-v":
      '<rect x="7" y="3" width="10" height="4" rx="1"/><rect x="5" y="10" width="14" height="4" rx="1"/><rect x="8" y="17" width="8" height="4" rx="1"/>',
    merge: '<path d="m8 6 4-4 4 4M12 2v10.3a4 4 0 0 1-1.17 2.87L4 22M20 22l-5-5"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    clipboard:
      '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    "file-html":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    "scan-eye":
      '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.9 12.4a1 1 0 0 0 0-.8 7.5 7.5 0 0 0-13.8 0 1 1 0 0 0 0 .8 7.5 7.5 0 0 0 13.8 0"/>',
  };
  function injectExtra() {
    const s = document.getElementById("wb-sprite");
    s.innerHTML += Object.entries(EXTRA)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    // 草图风格滤镜（元素级，沿用现状效果示意）
    const f = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    f.setAttribute("width", "0");
    f.setAttribute("height", "0");
    f.style.position = "absolute";
    f.innerHTML =
      '<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3.4"/></filter>';
    document.body.appendChild(f);
  }

  /* ───────── 数据色（用户内容：完整保留现状色板） ───────── */
  const GEO_PAIRS = [
    ["红", "#FFD0CE", "#FF6A63"],
    ["橙", "#FFCDAC", "#FB6C0C"],
    ["黄", "#FFE8BF", "#FFA02C"],
    ["绿", "#D6F2E9", "#24B079"],
    ["蓝", "#B8D9FF", "#3F71FB"],
    ["紫", "#E8E4FF", "#A67FFF"],
    ["粉", "#FFE6F2", "#FF6A63"],
    ["灰", "#F2F2F2", "#808080"],
  ];
  const GEO_SOLID = [
    ["红", "#FF6A63"],
    ["橙", "#FB6C0C"],
    ["黄", "#FFA02C"],
    ["绿", "#24B079"],
    ["蓝", "#3F71FB"],
    ["紫", "#A67FFF"],
    ["粉", "#F45FA6"],
    ["灰", "#808080"],
  ];
  const LINE_COLORS = [
    ["primary", "主色调", "#3b82f6", "#60a5fa"],
    ["success", "成功", "#10b981", "#34d399"],
    ["warning", "警告", "#f59e0b", "#fbbf24"],
    ["error", "错误", "#ef4444", "#f87171"],
    ["purple", "紫色", "#9333ea", "#a855f7"],
    ["pink", "粉色", "#db2777", "#ec4899"],
    ["indigo", "靛蓝", "#4f46e5", "#818cf8"],
    ["cyan", "青色", "#06b6d4", "#22d3ee"],
    ["orange", "橙色", "#ea580c", "#f97316"],
    ["lime", "柠檬绿", "#65a30d", "#a3e635"],
    ["gray", "灰色", "#6b7280", "#9ca3af"],
  ];
  const CARD_BG = [
    ["红", "#FFF1F0"],
    ["橙", "#FFF7E6"],
    ["黄", "#FEFFE6"],
    ["绿", "#F6FFED"],
    ["蓝", "#E6F4FF"],
    ["紫", "#F9F0FF"],
    ["灰", "#F5F5F5"],
  ];
  const MIND_THEMES = [
    { id: "default", name: "默认" },
    {
      id: "ocean",
      name: "海洋",
      root: "#1f6feb",
      rootInk: "#fff",
      line: "#1f6feb",
      node: "#e8f1ff",
      nodeLine: "#9ec1ff",
    },
    {
      id: "forest",
      name: "森林",
      root: "#2f855a",
      rootInk: "#fff",
      line: "#48bb78",
      node: "#e6f6ed",
      nodeLine: "#9ae6b4",
    },
    {
      id: "sunset",
      name: "日落",
      root: "#dd6b20",
      rootInk: "#fff",
      line: "#ed8936",
      node: "#fff1e6",
      nodeLine: "#fbd38d",
    },
    {
      id: "grape",
      name: "葡萄",
      root: "#6b46c1",
      rootInk: "#fff",
      line: "#9f7aea",
      node: "#f1ebff",
      nodeLine: "#c4b5fd",
    },
    {
      id: "ink",
      name: "水墨",
      root: "#2d2d2d",
      rootInk: "#fff",
      line: "#6b6b6b",
      node: "#f2f2f2",
      nodeLine: "#bdbdbd",
    },
  ];
  const FRAME_STYLES = [
    { id: "default", name: "默认" },
    { id: "paper", name: "纸张", bg: "#fffaf0", line: "#e8dcc4" },
    { id: "sky", name: "天空", bg: "#eef5ff", line: "#b9d3f7" },
    { id: "mint", name: "薄荷", bg: "#ecf8f1", line: "#b5e0c8" },
  ];
  const GRADS = [
    ["#e8c4a8", "#d9885f"],
    ["#ccd8c2", "#96ab8a"],
    ["#c8d2dd", "#92a5b8"],
    ["#e2cf9f", "#c0a05e"],
    ["#e5c9c4", "#c98d84"],
    ["#cfe0dc", "#9dbbb4"],
  ];
  const SHADOWS = {
    none: "none",
    sm: "var(--el-card-shadow)",
    md: "0 6px 18px rgba(0,0,0,.16)",
    lg: "0 14px 36px rgba(0,0,0,.24)",
  };
  const DASH = {
    dash: w => `${6 + w} ${4 + w}`,
    dot: w => `0 ${w * 2.4}`,
    long: w => `${14 + w} ${6 + w}`,
    dashdot: w => `${10 + w} ${4 + w} 0 ${4 + w}`,
    dense: w => `${3} ${2 + w / 2}`,
  };
  const TYPE = {
    frame: ["画框", "frame"],
    geometry: ["图形", "shapes"],
    richtext: ["文本", "type"],
    card: ["卡片", "sticky-note"],
    image: ["图片", "image"],
    mind: ["思维导图", "network"],
    handwrite: ["手写", "pencil"],
    arrow: ["箭头", "arrow-up-right"],
    webview: ["网页", "globe"],
    board: ["白板", "presentation"],
  };
  const isDark = () => document.documentElement.dataset.theme === "cocoa";
  const lineColor = id => {
    const c = LINE_COLORS.find(x => x[0] === id);
    return c ? (isDark() ? c[3] : c[2]) : "var(--el-arrow)";
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ───────── mock 画布：「Transformer 结构拆解 / 注意力机制」 ───────── */
  function initEls() {
    const geo = (id, x, y, w, h, text, shape = "rect", c) => ({
      id,
      type: "geometry",
      shape,
      x,
      y,
      w,
      h,
      text,
      fill: c ? c[1] : null,
      stroke: c ? c[2] : null,
      color: c ? "#000" : null,
      sw: 2,
      radius: 10,
      align: "center",
      valign: "middle",
      sketch: false,
      fillStyle: "hachure",
      rough: 1.2,
    });
    const arrow = (id, a, as, b, bs) => ({
      id,
      type: "arrow",
      from: { id: a, side: as },
      to: { id: b, side: bs },
      line: "curve",
      start: "none",
      end: "arrow",
      color: null,
      width: 2,
      dash: false,
      dashStyle: "dash",
      sketch: false,
      flow: false,
      speed: 1,
    });
    const hw = [];
    for (let i = 0; i <= 14; i++) hw.push([i * 10, 7 + Math.sin(i * 1.25) * 5]);
    return [
      {
        id: "f1",
        type: "frame",
        x: 0,
        y: 40,
        w: 600,
        h: 520,
        title: "缩放点积注意力",
        titlePos: "top",
        fstyle: "default",
      },
      {
        id: "t1",
        type: "richtext",
        x: 28,
        y: 70,
        w: 548,
        h: 40,
        big: true,
        text: "Attention(Q, K, V) = softmax(QKᵀ / √dₖ) · V",
        bg: null,
        bgMode: "none",
        padX: 0,
        padY: 0,
        shadow: "none",
      },
      {
        id: "h1",
        type: "handwrite",
        x: 318,
        y: 112,
        w: 140,
        h: 14,
        pts: hw,
        color: "#FF6A63",
        width: 3,
        opacity: 100,
        smooth: 50,
        thin: 40,
        pressure: true,
      },
      geo("q", 40, 170, 110, 56, "Q", "rect", GEO_PAIRS[4]),
      geo("k", 40, 262, 110, 56, "K", "rect", GEO_PAIRS[3]),
      geo("v", 40, 440, 110, 56, "V", "rect", GEO_PAIRS[2]),
      geo("g4", 230, 230, 140, 56, "MatMul · 缩放"),
      geo("g5", 420, 322, 130, 62, "Softmax", "ellipse"),
      geo("g6", 230, 440, 140, 56, "MatMul"),
      arrow("a1", "q", "r", "g4", "l"),
      arrow("a2", "k", "r", "g4", "l"),
      arrow("a3", "g4", "r", "g5", "t"),
      arrow("a4", "g5", "b", "g6", "r"),
      arrow("a5", "v", "r", "g6", "l"),
      {
        id: "c1",
        type: "card",
        x: 650,
        y: 40,
        w: 230,
        h: 164,
        title: "为什么除以 √dₖ",
        text: "点积的方差随维度增长；不缩放时 softmax 被推到饱和区，梯度接近 0。",
        bg: null,
        bgMode: "solid",
        padX: 16,
        padY: 14,
        shadow: "sm",
      },
      {
        id: "c2",
        type: "card",
        x: 650,
        y: 226,
        w: 230,
        h: 140,
        title: "掩码",
        text: "解码器里把未来位置置为 −∞，softmax 之后权重为 0。",
        bg: "#F9F0FF",
        bgMode: "solid",
        padX: 16,
        padY: 14,
        shadow: "sm",
      },
      {
        id: "im1",
        type: "image",
        x: 904,
        y: 40,
        w: 196,
        h: 250,
        g: 2,
        desc: "论文 图 2 · 缩放点积注意力",
        showDesc: true,
        descPos: "bottom",
        descAlign: "left",
        shadow: "none",
        bg: null,
      },
      {
        id: "m0",
        type: "mind",
        root: true,
        x: 650,
        y: 452,
        w: 128,
        h: 44,
        text: "多头注意力",
        theme: "default",
      },
      { id: "m1", type: "mind", parent: "m0", x: 834, y: 404, w: 150, h: 34, text: "拆成 h 个头" },
      {
        id: "m2",
        type: "mind",
        parent: "m0",
        x: 834,
        y: 457,
        w: 150,
        h: 34,
        text: "各自做缩放点积",
      },
      {
        id: "m3",
        type: "mind",
        parent: "m0",
        x: 834,
        y: 510,
        w: 150,
        h: 34,
        text: "拼接后线性变换",
      },
    ];
  }
  const SEQS = [
    {
      name: "论文讲解",
      frames: [
        { ids: ["f1"], pad: 30 },
        { ids: ["q", "k", "g4"], pad: 40 },
        { ids: ["g5", "g6", "v"], pad: 40 },
        { ids: ["c1", "c2"], pad: 30 },
        { ids: ["m0", "m1", "m2", "m3"], pad: 40 },
      ],
    },
    {
      name: "快速回顾",
      frames: [
        { ids: "*", pad: 40 },
        { ids: ["im1"], pad: 30 },
      ],
    },
  ];
  const CARDS = [
    ["自注意力的计算复杂度", "序列长度为 n 时，注意力矩阵是 n×n，时间与显存都是 O(n²·d)。"],
    ["LayerNorm 放在哪里", "Pre-LN 把归一化放在子层之前，深层训练更稳定，常可去掉 warmup。"],
    ["残差连接", "每个子层输出与输入相加，梯度可以绕过子层直接回传。"],
    ["位置编码的两种做法", "正弦编码可外推到更长序列；可学习编码更灵活但长度固定。"],
    ["Warmup 为什么有用", "早期梯度方差大，Adam 的二阶矩估计不准，小学习率先把统计量养稳。"],
    ["KV Cache", "解码时缓存已算过的 K、V，每步只算新 token，推理从 O(n²) 降到 O(n)。"],
  ];

  const S = {
    opt: null,
    els: [],
    sel: [],
    zoom: 1,
    px: 0,
    py: 0,
    grid: true,
    gridSize: 20,
    tool: null,
    outline: false,
    olQuery: "",
    olShut: new Set(),
    elsMode: "legacy",
    moving: false,
    ver: 0,
  };
  const byId = id => S.els.find(e => e.id === id);
  const selEls = () => S.sel.map(byId).filter(Boolean);
  let $canvas, $world, $ov, $sheet, $attr, $status, $tb, $outline;

  /* ───────── 几何 ───────── */
  function anchor(end) {
    if (end.id) {
      const e = byId(end.id);
      if (!e) return { x: 0, y: 0, nx: 0, ny: 0 };
      const { x, y, w, h } = e;
      switch (end.side) {
        case "r":
          return { x: x + w, y: y + h / 2, nx: 1, ny: 0 };
        case "l":
          return { x, y: y + h / 2, nx: -1, ny: 0 };
        case "t":
          return { x: x + w / 2, y, nx: 0, ny: -1 };
        default:
          return { x: x + w / 2, y: y + h, nx: 0, ny: 1 };
      }
    }
    return { x: end.x, y: end.y, nx: 0, ny: 0 };
  }
  function arrowGeom(a) {
    const A = anchor(a.from),
      B = anchor(a.to);
    let d, t0, t1;
    if (a.line === "straight") {
      d = `M${A.x} ${A.y}L${B.x} ${B.y}`;
      t0 = t1 = { x: B.x - A.x, y: B.y - A.y };
    } else if (a.line === "curve") {
      const dist = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const k = Math.max(30, dist / 2.4);
      const nA = A.nx || A.ny ? A : { nx: (B.x - A.x) / dist, ny: (B.y - A.y) / dist };
      const nB = B.nx || B.ny ? B : { nx: (A.x - B.x) / dist, ny: (A.y - B.y) / dist };
      const c1 = { x: A.x + nA.nx * k, y: A.y + nA.ny * k };
      const c2 = { x: B.x + nB.nx * k, y: B.y + nB.ny * k };
      d = `M${A.x} ${A.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${B.x} ${B.y}`;
      t0 = { x: c1.x - A.x, y: c1.y - A.y };
      t1 = { x: B.x - c2.x, y: B.y - c2.y };
    } else {
      let pts;
      const hA = A.ny === 0,
        hB = B.ny === 0;
      if (hA && hB) {
        const mx = (A.x + B.x) / 2;
        pts = [A, { x: mx, y: A.y }, { x: mx, y: B.y }, B];
      } else if (!hA && !hB) {
        const my = (A.y + B.y) / 2;
        pts = [A, { x: A.x, y: my }, { x: B.x, y: my }, B];
      } else if (hA) pts = [A, { x: B.x, y: A.y }, B];
      else pts = [A, { x: A.x, y: B.y }, B];
      d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
      t0 = { x: pts[1].x - A.x, y: pts[1].y - A.y };
      const p = pts[pts.length - 2];
      t1 = { x: B.x - p.x, y: B.y - p.y };
    }
    return { d, A, B, t0, t1 };
  }
  function bboxOf(e) {
    if (e.type === "arrow") {
      const g = arrowGeom(e);
      return {
        x: Math.min(g.A.x, g.B.x),
        y: Math.min(g.A.y, g.B.y),
        w: Math.abs(g.A.x - g.B.x),
        h: Math.abs(g.A.y - g.B.y),
      };
    }
    return { x: e.x, y: e.y, w: e.w, h: e.h };
  }
  function union(list) {
    if (!list.length) return null;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    list.forEach(b => {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const contains = (f, b) =>
    b.x >= f.x - 1 && b.y >= f.y - 1 && b.x + b.w <= f.x + f.w + 1 && b.y + b.h <= f.y + f.h + 1;
  const toS = p => ({ x: p.x * S.zoom + S.px, y: p.y * S.zoom + S.py });
  const toSB = b => ({
    x: b.x * S.zoom + S.px,
    y: b.y * S.zoom + S.py,
    w: b.w * S.zoom,
    h: b.h * S.zoom,
  });
  function toW(cx, cy) {
    const r = $canvas.getBoundingClientRect();
    return { x: (cx - r.left - S.px) / S.zoom, y: (cy - r.top - S.py) / S.zoom };
  }
  function frameIds(fr) {
    return fr.ids === "*" ? S.els.map(e => e.id) : fr.ids;
  }
  function frameBox(fr) {
    const b = union(frameIds(fr).map(byId).filter(Boolean).map(bboxOf));
    if (!b) return { x: 0, y: 0, w: 10, h: 10 };
    return { x: b.x - fr.pad, y: b.y - fr.pad, w: b.w + fr.pad * 2, h: b.h + fr.pad * 2 };
  }
  function descendants(e) {
    const out = [];
    if (e.type === "frame")
      S.els.forEach(o => o !== e && o.type !== "arrow" && contains(e, bboxOf(o)) && out.push(o));
    if (e.type === "mind" && e.root) S.els.forEach(o => o.parent === e.id && out.push(o));
    return out;
  }
  function nameOf(e) {
    if (e.label) return e.label;
    switch (e.type) {
      case "frame":
        return e.title;
      case "geometry":
        return e.text || "图形";
      case "richtext":
        return e.text;
      case "card":
        return e.title;
      case "image":
        return e.desc || "图片";
      case "mind":
        return e.text;
      case "handwrite":
        return "手写笔迹";
      case "arrow":
        return `${e.from.id ? nameOf(byId(e.from.id) || {}) : "·"} → ${e.to.id ? nameOf(byId(e.to.id) || {}) : "·"}`;
      case "webview":
        return e.url.replace(/^https?:\/\//, "");
      case "board":
        return e.title;
    }
    return TYPE[e.type]?.[0] || "元素";
  }

  /* ───────── 元素渲染（沿用现状画法；默认色由 data-els 切换） ───────── */
  function boxBg(e, def) {
    const c = e.bg || def;
    if (e.bgMode === "none") return "transparent";
    if (e.bgMode === "gradient")
      return `linear-gradient(160deg, ${c}, color-mix(in srgb, ${c} 45%, var(--el-card)))`;
    if (e.bgMode === "top")
      return `linear-gradient(color-mix(in srgb, ${e.bg || "var(--el-ink)"} ${e.bg ? 100 : 8}%, transparent) 0 34px, var(--el-card) 34px)`;
    return c;
  }
  const HEART =
    "M 0.50 0.12 C 0.54 0.07 0.61 0.03 0.70 0.03 C 0.84 0.03 0.97 0.14 0.97 0.30 C 0.97 0.50 0.84 0.73 0.62 0.88 C 0.57 0.92 0.53 0.95 0.50 0.95 C 0.47 0.95 0.43 0.92 0.38 0.88 C 0.16 0.73 0.03 0.50 0.03 0.30 C 0.03 0.14 0.16 0.03 0.30 0.03 C 0.39 0.03 0.46 0.07 0.50 0.12 Z";
  function elHTML(e) {
    const pos = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`;
    switch (e.type) {
      case "frame": {
        const st = FRAME_STYLES.find(s => s.id === e.fstyle) || FRAME_STYLES[0];
        return `<div class="el el-frame${e.titlePos === "inner" ? " inner" : ""}" style="${pos}background:${st.bg || "var(--el-frame-bg)"};box-shadow:inset 0 0 0 1.5px ${st.line || "var(--el-frame-line)"};pointer-events:none"><span class="ftitle" data-id="${e.id}" style="pointer-events:auto">${esc(e.title)}</span></div>`;
      }
      case "geometry": {
        const fill = e.fill ?? "var(--el-geo-fill)";
        const stroke = e.stroke ?? "var(--el-geo-stroke)";
        const st = `fill:${fill};stroke:${stroke};stroke-width:${e.sw}px`;
        const sw = e.sw;
        let shape;
        if (e.shape === "ellipse")
          shape = `<ellipse cx="${e.w / 2}" cy="${e.h / 2}" rx="${Math.max(1, e.w / 2 - sw / 2)}" ry="${Math.max(1, e.h / 2 - sw / 2)}" style="${st}"/>`;
        else if (e.shape === "heart")
          shape = `<path d="${HEART}" transform="scale(${e.w} ${e.h})" vector-effect="non-scaling-stroke" style="${st}"/>`;
        else if (e.shape === "triangle")
          shape = `<path d="M0.5 0 1 1 0 1Z" transform="scale(${e.w} ${e.h})" vector-effect="non-scaling-stroke" style="${st}"/>`;
        else
          shape = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(1, e.w - sw)}" height="${Math.max(1, e.h - sw)}" rx="${e.radius}" style="${st}"/>`;
        const va = { top: "flex-start", middle: "center", bottom: "flex-end" }[e.valign];
        return `<div class="el el-geometry${e.sketch ? " sketch" : ""}" data-id="${e.id}" style="${pos}align-items:${va};text-align:${e.align};color:${e.color || "var(--el-ink)"}"><svg>${shape}</svg><span>${esc(e.text)}</span></div>`;
      }
      case "richtext":
        return `<div class="el el-richtext${e.big ? " big" : ""}" data-id="${e.id}" style="${pos}background:${boxBg(e, "var(--el-card)")};padding:${e.padY}px ${e.padX}px;box-shadow:${SHADOWS[e.shadow]};border-radius:8px">${esc(e.text)}</div>`;
      case "card":
        return `<div class="el el-card" data-id="${e.id}" style="${pos}background:${boxBg(e, "var(--el-card)")};padding:${e.padY}px ${e.padX}px;box-shadow:${SHADOWS[e.shadow]}${e.bg ? ";color:#2b2b2b" : ""}"><b>${esc(e.title)}</b>${esc(e.text)}</div>`;
      case "image": {
        const [a, b] = GRADS[e.g % GRADS.length];
        const desc = e.showDesc
          ? `<div class="desc" style="${e.descPos === "top" ? `bottom:${e.h + 6}px` : `top:${e.h + 6}px`};text-align:${e.descAlign}${e.bg ? `;background:${e.bg};color:#2b2b2b;opacity:1;padding:4px 8px;border-radius:6px` : ""}">${esc(e.desc)}</div>`
          : "";
        return `<div class="el el-image" data-id="${e.id}" style="${pos}"><div class="pic" style="background:linear-gradient(150deg,${a},${b});box-shadow:${SHADOWS[e.shadow]}"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M8 88 L36 52 L54 72 L70 58 L92 88Z" fill="rgba(255,255,255,.38)"/><circle cx="72" cy="26" r="7" fill="rgba(255,255,255,.5)"/></svg></div>${desc}</div>`;
      }
      case "mind": {
        const th = mindTheme(e);
        const st = e.root
          ? `background:${th.root};color:${th.rootInk}`
          : `background:${th.node};box-shadow:inset 0 0 0 1px ${th.nodeLine}`;
        return `<div class="el el-mind${e.root ? " root" : ""}" data-id="${e.id}" style="${pos}${st}">${esc(e.text)}</div>`;
      }
      case "webview":
        return `<div class="el el-webview" data-id="${e.id}" style="${pos}"><div class="bar"><i></i><i></i><i></i><span>${esc(e.url)}</span></div><div class="body"><i style="width:60%"></i><i style="width:88%"></i><i style="width:74%"></i><i style="width:40%"></i></div></div>`;
      case "board":
        return `<div class="el el-board" data-id="${e.id}" style="${pos}"><span class="bt">${esc(e.title)}</span>${X.pageSVG(e.page, { ratio: e.w / e.h })}</div>`;
    }
    return "";
  }
  function mindTheme(e) {
    const root = e.root ? e : byId(e.parent);
    const th = MIND_THEMES.find(t => t.id === (root && root.theme)) || MIND_THEMES[0];
    if (th.id === "default")
      return {
        root: "var(--el-mind-root)",
        rootInk: "var(--el-mind-root-ink)",
        line: "var(--el-mind-line)",
        node: "var(--el-mind-node)",
        nodeLine: "var(--el-mind-node-line)",
      };
    return th;
  }
  function marker(kind, P, t, color, w) {
    if (!kind || kind === "none") return "";
    const len = Math.hypot(t.x, t.y) || 1;
    const ux = t.x / len,
      uy = t.y / len,
      px = -uy,
      py = ux;
    const L = 9 + w * 1.6,
      W = 4.5 + w * 1.1;
    const bx = P.x - ux * L,
      by = P.y - uy * L;
    const f = `style="fill:${color};stroke:${color};stroke-width:${w}px;stroke-linejoin:round"`;
    const o = `style="fill:none;stroke:${color};stroke-width:${w}px;stroke-linecap:round;stroke-linejoin:round"`;
    const h = `style="fill:var(--canvas);stroke:${color};stroke-width:${w}px;stroke-linejoin:round"`;
    switch (kind) {
      case "arrow":
        return `<path d="M${P.x} ${P.y}L${bx + px * W} ${by + py * W}L${bx - px * W} ${by - py * W}Z" ${f}/>`;
      case "open":
        return `<path d="M${bx + px * W} ${by + py * W}L${P.x} ${P.y}L${bx - px * W} ${by - py * W}" ${o}/>`;
      case "closed":
        return `<path d="M${P.x} ${P.y}L${bx + px * W} ${by + py * W}L${bx - px * W} ${by - py * W}Z" ${h}/>`;
      case "diamond": {
        const mx = P.x - ux * L * 0.9,
          my = P.y - uy * L * 0.9;
        return `<path d="M${P.x} ${P.y}L${mx + px * W * 0.9} ${my + py * W * 0.9}L${P.x - ux * L * 1.8} ${P.y - uy * L * 1.8}L${mx - px * W * 0.9} ${my - py * W * 0.9}Z" ${f}/>`;
      }
      case "circle":
        return `<circle cx="${P.x - ux * W}" cy="${P.y - uy * W}" r="${W * 0.8}" ${f}/>`;
    }
    return "";
  }
  function arrowSVG(a) {
    const g = arrowGeom(a);
    const c = a.color ? lineColor(a.color) : "var(--el-arrow)";
    const dash = a.dash ? DASH[a.dashStyle](a.width) : "";
    let s = `<path d="${g.d}" style="fill:none;stroke:${c};stroke-width:${a.width}px;stroke-linecap:round;stroke-linejoin:round${dash ? `;stroke-dasharray:${dash}` : ""}${a.flow && a.dash ? `;animation-duration:${(1 / a.speed).toFixed(2)}s` : ""}"${a.sketch ? ' filter="url(#rough)"' : ""}${a.flow && a.dash ? ' class="flowing"' : ""}/>`;
    s +=
      marker(a.end, g.B, g.t1, c, a.width) +
      marker(a.start, g.A, { x: -g.t0.x, y: -g.t0.y }, c, a.width);
    if (a.flow && !a.dash)
      s += `<circle r="${a.width + 1.5}" style="fill:${c}"><animateMotion dur="${(1.8 / a.speed).toFixed(2)}s" repeatCount="indefinite" path="${g.d}"/></circle>`;
    s += `<path class="hit" data-id="${a.id}" d="${g.d}" style="fill:none;stroke:transparent;stroke-width:14px"/>`;
    return s;
  }
  function inkSVG(e) {
    const p = e.pts.map(([x, y]) => [e.x + x, e.y + y]);
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2,
        my = (p[i][1] + p[i + 1][1]) / 2;
      d += `Q${p[i][0]} ${p[i][1]} ${mx} ${my}`;
    }
    if (p.length > 1) d += `L${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
    const c = e.color || "var(--el-ink)";
    return `<path d="${d}" style="fill:none;stroke:${c};stroke-width:${e.width}px;opacity:${e.opacity / 100};stroke-linecap:round;stroke-linejoin:round"/><path class="hit" data-id="${e.id}" d="${d}" style="fill:none;stroke:transparent;stroke-width:16px"/>`;
  }
  function mindLinks() {
    return S.els
      .filter(e => e.type === "mind" && e.parent)
      .map(c => {
        const p = byId(c.parent);
        if (!p) return "";
        const th = mindTheme(c);
        const ax = p.x + p.w,
          ay = p.y + p.h / 2,
          bx = c.x,
          by = c.y + c.h / 2,
          mx = (ax + bx) / 2;
        return `<path d="M${ax} ${ay}C${mx} ${ay} ${mx} ${by} ${bx} ${by}" style="fill:none;stroke:${th.line};stroke-width:1.8px;opacity:.8"/>`;
      })
      .join("");
  }
  function drawWorld() {
    $world.dataset.els = S.elsMode;
    $world.style.transform = `translate(${S.px}px, ${S.py}px) scale(${S.zoom})`;
    const gs = S.gridSize * S.zoom;
    $canvas.classList.toggle("grid", S.grid && gs >= 6);
    $canvas.style.backgroundSize = `${gs}px ${gs}px`;
    $canvas.style.backgroundPosition = `${S.px}px ${S.py}px`;
    const frames = S.els.filter(e => e.type === "frame");
    const nodes = S.els.filter(e => !["frame", "arrow", "handwrite"].includes(e.type));
    $world.innerHTML =
      frames.map(elHTML).join("") +
      `<svg class="layer">${mindLinks()}${S.els
        .filter(e => e.type === "arrow")
        .map(arrowSVG)
        .join("")}</svg>` +
      nodes.map(elHTML).join("") +
      `<svg class="layer">${S.els
        .filter(e => e.type === "handwrite")
        .map(inkSVG)
        .join("")}</svg>`;
  }

  /* ───────── 选区叠层 ───────── */
  let marq = null;
  function drawOverlay() {
    let h = "";
    if (C && !P) {
      C.frames.forEach((fr, i) => {
        const b = toSB(frameBox(fr));
        h += `<div class="frame-hl${i === C.cur ? " on" : ""}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"><b>${i + 1}</b></div>`;
      });
    }
    const sel = selEls();
    const corners =
      '<i class="hd" style="left:-5px;top:-5px"></i><i class="hd" style="right:-5px;top:-5px"></i><i class="hd" style="left:-5px;bottom:-5px"></i><i class="hd" style="right:-5px;bottom:-5px"></i>';
    sel.forEach(e => {
      if (e.type === "arrow") {
        const g = arrowGeom(e);
        [g.A, g.B].forEach(p => {
          const s = toS(p);
          h += `<div class="selbox" style="left:${s.x}px;top:${s.y}px;width:0;height:0;box-shadow:none"><i class="hd round" style="left:-5px;top:-5px"></i></div>`;
        });
        return;
      }
      const b = toSB(bboxOf(e));
      h += `<div class="selbox${sel.length > 1 ? " multi" : ""}" style="left:${b.x - 3}px;top:${b.y - 3}px;width:${b.w + 6}px;height:${b.h + 6}px">${sel.length === 1 ? corners : ""}</div>`;
    });
    if (sel.length > 1) {
      const u = toSB(union(sel.map(bboxOf)));
      h += `<div class="selgroup" style="left:${u.x - 4}px;top:${u.y - 4}px;width:${u.w + 8}px;height:${u.h + 8}px"></div>`;
    }
    if (marq) {
      const a = toS(marq.a),
        b = toS(marq.b);
      h += `<div class="marquee" style="left:${Math.min(a.x, b.x)}px;top:${Math.min(a.y, b.y)}px;width:${Math.abs(a.x - b.x)}px;height:${Math.abs(a.y - b.y)}px"></div>`;
    }
    $ov.innerHTML = h;
  }

  /* ───────── 定位 / 浮层底盘 ───────── */
  function place2(el, r, pl, gap = 8) {
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const fits = {
      top: r.top - h - gap > 8,
      bottom: r.bottom + h + gap < innerHeight - 8,
      left: r.left - w - gap > 8,
      right: r.right + w + gap < innerWidth - 8,
    };
    const flip = { top: "bottom", bottom: "top", left: "right", right: "left" };
    if (!fits[pl] && fits[flip[pl]]) pl = flip[pl];
    let x, y;
    if (pl === "top" || pl === "bottom") {
      x = r.left + r.width / 2 - w / 2;
      y = pl === "top" ? r.top - h - gap : r.bottom + gap;
    } else {
      y = r.top + r.height / 2 - h / 2;
      x = pl === "left" ? r.left - w - gap : r.right + gap;
    }
    el.style.left = clamp(x, 8, innerWidth - w - 8) + "px";
    el.style.top = clamp(y, 8, innerHeight - h - 8) + "px";
  }

  /* Tooltip */
  let tipEl = null,
    tipFor = null,
    tipT = 0;
  function hideTip() {
    clearTimeout(tipT);
    tipFor = null;
    if (tipEl) tipEl.classList.remove("show");
  }
  document.addEventListener("mouseover", ev => {
    const t = ev.target.closest && ev.target.closest("[data-tip]");
    if (!t || t === tipFor) return;
    hideTip();
    tipFor = t;
    tipT = setTimeout(() => {
      if (t.classList.contains("open") || !document.body.contains(t)) return;
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "tip";
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = esc(t.dataset.tip) + (t.dataset.k ? `<kbd>${t.dataset.k}</kbd>` : "");
      place2(tipEl, t.getBoundingClientRect(), t.dataset.tp || "bottom", 6);
      tipEl.classList.add("show");
    }, 380);
  });
  document.addEventListener("mouseout", ev => {
    const t = ev.target.closest && ev.target.closest("[data-tip]");
    if (t && !t.contains(ev.relatedTarget)) hideTip();
  });
  document.addEventListener("mousedown", hideTip, true);

  /* Menu（支持描述、子菜单、自定义内容；右键菜单同底盘） */
  const MS = [];
  let lastClosed = { anchor: null, t: 0 };
  const justClosed = a => lastClosed.anchor === a && Date.now() - lastClosed.t < 250;
  function closeMenus(from = 0) {
    while (MS.length > from) {
      const m = MS.pop();
      if (m.level === 0) lastClosed = { anchor: m.anchor, t: Date.now() };
      m.el.remove();
      m.onClose && m.onClose();
    }
  }
  function menuHTML(entries) {
    return entries
      .map((e, i) =>
        e === "-"
          ? '<div class="menu-sep"></div>'
          : e.label0
            ? `<div class="menu-label">${e.label0}</div>`
            : `<button class="menu-item${e.danger ? " danger" : ""}${e.d ? " tall" : ""}" data-i="${i}"${e.disabled ? " disabled" : ""}>${e.icon ? icon(e.icon) : ""}<span>${e.label}${e.d ? `<span class="d">${e.d}</span>` : ""}</span>${e.children ? icon("chev-right", "chev") : e.k ? `<span class="k">${e.k}</span>` : ""}</button>`
      )
      .join("");
  }
  function pushMenu(rect, entries, placement, level, opts = {}) {
    const el = document.createElement("div");
    el.className = "menu";
    el.innerHTML = opts.html || menuHTML(entries);
    document.body.appendChild(el);
    const w = el.offsetWidth,
      h = el.offsetHeight;
    if (placement === "point") {
      let x = rect.left,
        y = rect.top;
      if (x + w > innerWidth - 8) x = x - w;
      if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
      el.style.left = x + "px";
      el.style.top = y + "px";
    } else if (placement === "sub") {
      let x = rect.right + 6;
      if (x + w > innerWidth - 8) x = rect.left - w - 6;
      el.style.left = x + "px";
      el.style.top = clamp(rect.top - 6, 8, innerHeight - h - 8) + "px";
    } else place2(el, rect, placement, 8);
    setTimeout(() => el.classList.add("open"));
    const m = { el, level, anchor: opts.anchor, onClose: opts.onClose };
    el.addEventListener("mouseover", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b) return;
      const e = entries[+b.dataset.i];
      if (MS.length > level + 1 && MS[level + 1].from !== b) closeMenus(level + 1);
      if (e && e.children && MS.length === level + 1) {
        b.classList.add("hl");
        const sm = pushMenu(b.getBoundingClientRect(), e.children, "sub", level + 1, {
          onClose: () => b.classList.remove("hl"),
        });
        sm.from = b;
      }
    });
    el.addEventListener("click", ev => {
      const b = ev.target.closest(".menu-item");
      if (!b || b.disabled || b.dataset.i == null) return;
      const e = entries[+b.dataset.i];
      if (!e || e.children) return;
      closeMenus(0);
      e.run && e.run();
    });
    MS.push(m);
    opts.bind && opts.bind(el, () => closeMenus(0));
    return m;
  }
  function openMenu(anchorEl, entries, placement, opts = {}) {
    closeMenus(0);
    closeCPop();
    anchorEl.classList.add("open");
    return pushMenu(anchorEl.getBoundingClientRect(), entries, placement, 0, {
      ...opts,
      anchor: anchorEl,
      onClose: () => anchorEl.classList.remove("open"),
    });
  }
  function ctxMenu(x, y, entries) {
    closeMenus(0);
    closeCPop();
    pushMenu({ left: x, top: y, right: x, bottom: y, width: 0, height: 0 }, entries, "point", 0);
  }
  document.addEventListener(
    "mousedown",
    ev => {
      if (MS.length && !MS.some(m => m.el.contains(ev.target))) closeMenus(0);
    },
    true
  );

  /* 属性弹层（A 浮动条 / B 竖条的每一项） */
  let cp = null;
  function closeCPop() {
    if (!cp) return;
    lastClosed = { anchor: cp.key, t: Date.now() };
    cp.el.remove();
    cp = null;
    document.querySelectorAll(".ab.open").forEach(b => b.classList.remove("open"));
  }
  function openCPop(anchorEl, placement, key, item, el) {
    closeMenus(0);
    closeCPop();
    const pop = document.createElement("div");
    pop.className = "cpop";
    document.body.appendChild(pop);
    const draw = () => {
      const it = item();
      pop.innerHTML = `<div class="pt">${head(it, el)}</div>${it.body ? it.body() : ""}`;
      bindBody(pop, el, () => {
        draw();
      });
    };
    const rect = anchorEl.getBoundingClientRect();
    const drawAt = () => {
      draw();
      place2(pop, rect, placement, 10);
    };
    drawAt();
    setTimeout(() => {
      place2(pop, rect, placement, 10);
      pop.classList.add("open");
    });
    anchorEl.classList.add("open");
    cp = { el: pop, key, draw: drawAt };
  }
  document.addEventListener(
    "mousedown",
    ev => {
      if (
        cp &&
        !cp.el.contains(ev.target) &&
        !ev.target.closest(".ab") &&
        !ev.target.closest(".tip")
      )
        closeCPop();
    },
    true
  );
  document.addEventListener(
    "keydown",
    ev => {
      if (ev.key !== "Escape") return;
      if (MS.length) {
        ev.stopPropagation();
        closeMenus(MS.length - 1);
      } else if (cp) {
        ev.stopPropagation();
        closeCPop();
      }
    },
    true
  );

  /* ───────── 属性控件 ───────── */
  const J = o => JSON.stringify(o).replace(/'/g, "&#39;");
  function cf(label, html, v) {
    return `<div class="cf">${label ? `<div class="lb">${label}${v != null ? `<span class="v">${v}</span>` : ""}</div>` : ""}${html}</div>`;
  }
  function sw(name, f, s, patch, on, cls = "") {
    return `<button class="sw ${cls}${on ? " on" : ""}" style="--f:${f};--s:${s}" data-p='${J(patch)}' data-tip="${name}" data-tp="top"></button>`;
  }
  function slider(prop, min, max, val, unit = "", step = 1) {
    const p = ((val - min) / (max - min)) * 100;
    return `<div class="slider"><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-r="${prop}" data-u="${unit}" style="--p:${p}%"><span class="v">${val}${unit}</span></div>`;
  }
  function seg(prop, options, cur) {
    return `<div class="seg full">${options.map(([v, label, ic]) => `<button class="${v === cur ? "on" : ""}" data-p='${J({ [prop]: v })}'${ic ? ` data-tip="${label}" data-tp="top"` : ""}>${ic ? icon(ic) : label}</button>`).join("")}</div>`;
  }
  function toggle(prop, label, on) {
    return `<button class="swrow" data-t="${prop}"><span>${label}</span><span class="spacer"></span><span class="switch${on ? " on" : ""}"></span></button>`;
  }
  function opt(patch, on, inner, tip) {
    return `<button class="opt${on ? " on" : ""}" data-p='${J(patch)}'${tip ? ` data-tip="${tip}" data-tp="top"` : ""}>${inner}</button>`;
  }
  const glyph = d => `<svg class="g" viewBox="0 0 28 14">${d}</svg>`;
  const MARKERS = [
    ["none", "无箭头", '<path d="M3 7H25"/>'],
    ["arrow", "标准箭头", '<path d="M3 7H20"/><path class="f" d="M25 7 19 3.5v7z"/>'],
    ["open", "开放式箭头", '<path d="M3 7H24M19 3.5 25 7 19 10.5"/>'],
    ["closed", "闭合式箭头", '<path d="M3 7H19"/><path d="M25 7 19 3.5v7z"/>'],
    ["diamond", "菱形箭头", '<path d="M3 7H15"/><path class="f" d="M15 7l5-3.5 5 3.5-5 3.5z"/>'],
    ["circle", "圆形箭头", '<path d="M3 7H19"/><circle class="f" cx="22" cy="7" r="3"/>'],
  ];
  const DASHES = [
    ["dash", "标准虚线", "5 3"],
    ["dot", "点线", "0 3.5"],
    ["long", "长虚线", "9 3"],
    ["dashdot", "点划线", "7 3 0 3"],
    ["dense", "密集虚线", "2 1.6"],
  ];
  const act = (k, label, ic, run) => ({ k, label, icon: ic, run });
  /** 分区头：标题；开关型分区把开关放在标题右侧（不在下面再写一遍同名开关） */
  const head = (it, e) =>
    `${it.label}${it.toggle ? `<span class="spacer"></span><button class="switch${e && e[it.toggle] ? " on" : ""}" data-t="${it.toggle}" aria-label="${it.label}"></button>` : ""}`;

  function geoColorBody(e) {
    const is = (f, s) => e.fill === f && e.stroke === s;
    return (
      cf(
        "浅底 + 描边",
        `<div class="sw-row">${sw("默认", "", "", { fill: null, stroke: null, color: null }, is(null, null), "def")}${GEO_PAIRS.map(([n, f, s]) => sw(n, f, s, { fill: f, stroke: s, color: "#000" }, is(f, s))).join("")}</div>`
      ) +
      cf(
        "实心",
        `<div class="sw-row">${GEO_SOLID.map(([n, c]) => sw(n, c, c, { fill: c, stroke: "transparent", color: "#fff" }, is(c, "transparent"))).join("")}</div>`
      ) +
      cf(
        "仅描边",
        `<div class="sw-row">${GEO_SOLID.map(([n, c]) => sw(n, "var(--bg-surface)", c, { fill: "transparent", stroke: c, color: null }, is("transparent", c))).join("")}<span class="sw custom" data-tip="自定义颜色" data-tp="top"><input type="color" data-c="geo" value="#3F71FB"></span></div>`
      )
    );
  }
  const SET = {
    geometry: e => [
      {
        k: "color",
        label: "颜色",
        dot:
          e.fill == null && e.stroke == null
            ? { f: "var(--bg-surface)", s: "var(--ink-1)" }
            : {
                f: e.fill === "transparent" ? "var(--bg-surface)" : e.fill,
                s: e.stroke === "transparent" ? e.fill : e.stroke,
              },
        body: () => geoColorBody(e),
      },
      { k: "sw", label: "边框粗细", icon: "line-w", body: () => slider("sw", 0, 8, e.sw, "px") },
      ...(e.shape === "rect"
        ? [
            {
              k: "radius",
              label: "圆角",
              icon: "corner",
              body: () => slider("radius", 0, 40, e.radius, "px"),
            },
          ]
        : []),
      {
        k: "align",
        label: "文字对齐",
        icon: "align-center",
        body: () =>
          cf(
            "水平",
            seg(
              "align",
              [
                ["left", "左对齐", "align-left"],
                ["center", "居中", "align-center"],
                ["right", "右对齐", "align-right"],
              ],
              e.align
            )
          ) +
          cf(
            "垂直",
            seg(
              "valign",
              [
                ["top", "顶部"],
                ["middle", "居中"],
                ["bottom", "底部"],
              ],
              e.valign
            )
          ),
      },
      {
        k: "sketch",
        label: "草图风格",
        icon: "scribble",
        toggle: "sketch",
        body: () =>
          e.sketch
            ? cf(
                "填充样式",
                `<div class="opt-row">${[
                  ["hachure", "锯齿"],
                  ["solid", "实心"],
                  ["cross", "交叉"],
                  ["dots", "点状"],
                  ["dashed", "虚线"],
                ]
                  .map(([v, n]) => opt({ fillStyle: v }, e.fillStyle === v, n))
                  .join("")}</div>`
              ) + cf("粗糙度", slider("rough", 0, 3, e.rough, "", 0.1))
            : "",
      },
    ],
    arrow: e => [
      {
        k: "line",
        label: "线型",
        icon: { straight: "l-straight", curve: "l-curve", ortho: "l-ortho" }[e.line],
        body: () =>
          `<div class="opt-row g3">${[
            ["straight", "直线", '<path d="M3 11 25 3"/>'],
            ["curve", "曲线", '<path d="M3 11C14 11 14 3 25 3"/>'],
            ["ortho", "正交线", '<path d="M3 11H14V3H25"/>'],
          ]
            .map(([v, n, d]) => opt({ line: v }, e.line === v, glyph(d) + `<span>${n}</span>`))
            .join("")}</div>`,
      },
      {
        k: "start",
        label: "起点箭头",
        icon: "m-start",
        body: () =>
          `<div class="opt-row g6">${MARKERS.map(([v, n, d]) => opt({ start: v }, e.start === v, glyph(`<g transform="translate(28 0) scale(-1 1)">${d}</g>`), n)).join("")}</div>`,
      },
      {
        k: "end",
        label: "终点箭头",
        icon: "m-end",
        body: () =>
          `<div class="opt-row g6">${MARKERS.map(([v, n, d]) => opt({ end: v }, e.end === v, glyph(d), n)).join("")}</div>`,
      },
      {
        k: "color",
        label: "颜色",
        dot: { f: lineColor(e.color), s: lineColor(e.color) },
        body: () =>
          `<div class="sw-row">${sw("默认", "", "", { color: null }, e.color == null, "def")}${LINE_COLORS.map(([id, n, l, d]) => sw(n, isDark() ? d : l, isDark() ? d : l, { color: id }, e.color === id)).join("")}</div>`,
      },
      {
        k: "width",
        label: "粗细",
        icon: "line-w",
        body: () => slider("width", 1, 10, e.width, "px"),
      },
      {
        k: "dash",
        label: "虚线",
        icon: "dash",
        toggle: "dash",
        body: () =>
          e.dash
            ? cf(
                "样式",
                `<div class="opt-row g5">${DASHES.map(([v, n, da]) => opt({ dashStyle: v }, e.dashStyle === v, glyph(`<path d="M3 7H25" stroke-dasharray="${da}"/>`), n)).join("")}</div>`
              )
            : "",
      },
      { k: "sketch", label: "草图风格", icon: "scribble", toggle: "sketch" },
      {
        k: "flow",
        label: "流动动画",
        icon: "waves",
        toggle: "flow",
        body: () => (e.flow ? cf("动画速度", slider("speed", 0.5, 3, e.speed, "×", 0.5)) : ""),
      },
    ],
    richtext: e => boxSetters(e),
    card: e => boxSetters(e),
    mind: e => [
      {
        k: "theme",
        label: "导图主题",
        icon: "palette",
        body: () => {
          const root = e.root ? e : byId(e.parent);
          return `<div class="opt-row">${MIND_THEMES.map(t => {
            const th = t.id === "default" ? mindTheme({ root: true, theme: "default" }) : t;
            const mini = `<span class="mini"><svg viewBox="0 0 44 26" width="44" height="26"><path d="M18 13C24 13 22 6 28 6M18 13H28M18 13C24 13 22 20 28 20" style="fill:none;stroke:${th.line};stroke-width:1.2"/><rect x="2" y="8" width="16" height="10" rx="3" style="fill:${th.root}"/><rect x="28" y="3" width="14" height="6" rx="3" style="fill:${th.node};stroke:${th.nodeLine};stroke-width:.8"/><rect x="28" y="10" width="14" height="6" rx="3" style="fill:${th.node};stroke:${th.nodeLine};stroke-width:.8"/><rect x="28" y="17" width="14" height="6" rx="3" style="fill:${th.node};stroke:${th.nodeLine};stroke-width:.8"/></svg></span>`;
            return `<button class="opt tile${root.theme === t.id ? " on" : ""}" data-root-theme="${t.id}">${mini}${t.name}</button>`;
          }).join("")}</div>`;
        },
      },
    ],
    handwrite: e => [
      {
        k: "color",
        label: "颜色",
        dot: { f: e.color || "var(--ink-1)", s: e.color || "var(--ink-1)" },
        body: () =>
          `<div class="sw-row">${sw("默认", "", "", { color: null }, e.color == null, "def")}${GEO_SOLID.map(([n, c]) => sw(n, c, c, { color: c }, e.color === c)).join("")}</div>`,
      },
      {
        k: "width",
        label: "线宽",
        icon: "line-w",
        body: () => slider("width", 1, 12, e.width, "px"),
      },
      {
        k: "opacity",
        label: "透明度",
        icon: "droplet",
        body: () => slider("opacity", 10, 100, e.opacity, "%", 5),
      },
      {
        k: "brush",
        label: "笔刷参数",
        icon: "brush",
        body: () =>
          cf("平滑", slider("smooth", 0, 100, e.smooth, "")) +
          cf("细化", slider("thin", 0, 100, e.thin, "")),
      },
      { k: "pressure", label: "压感模拟", icon: "signature", toggle: "pressure" },
    ],
    image: e => [
      { k: "shadow", label: "阴影", icon: "shadow", body: () => shadowOpts(e) },
      {
        k: "desc",
        label: "描述",
        icon: "captions",
        toggle: "showDesc",
        body: () =>
          e.showDesc
            ? cf(
                "位置",
                seg(
                  "descPos",
                  [
                    ["top", "上方"],
                    ["bottom", "下方"],
                  ],
                  e.descPos
                )
              ) +
              cf(
                "对齐",
                seg(
                  "descAlign",
                  [
                    ["left", "左对齐", "align-left"],
                    ["center", "居中", "align-center"],
                    ["right", "右对齐", "align-right"],
                  ],
                  e.descAlign
                )
              )
            : "",
      },
      {
        k: "bg",
        label: "描述背景",
        dot: e.bg ? { f: e.bg, s: e.bg } : "none",
        body: () =>
          `<div class="sw-row">${sw("无", "", "", { bg: null }, e.bg == null, "none")}${CARD_BG.map(([n, c]) => sw(n, c, `color-mix(in srgb, ${c}, #000 12%)`, { bg: c }, e.bg === c)).join("")}</div>`,
      },
    ],
    frame: e => [
      {
        k: "style",
        label: "画框样式",
        icon: "palette",
        body: () =>
          `<div class="opt-row">${FRAME_STYLES.map(s =>
            opt(
              { fstyle: s.id },
              e.fstyle === s.id,
              `<span class="mini" style="background:${s.bg || "var(--canvas)"};box-shadow:inset 0 0 0 1.5px ${s.line || "var(--line-1)"}"></span>${s.name}`
            )
          )
            .join("")
            .replace(/class="opt/g, 'class="opt tile')}</div>`,
      },
      {
        k: "titlePos",
        label: "标题位置",
        icon: "heading",
        body: () =>
          seg(
            "titlePos",
            [
              ["top", "上方"],
              ["inner", "内嵌"],
            ],
            e.titlePos
          ),
      },
      act("fit", "适应内容", "scan", () => fitFrame(e)),
      act("dissolve", "解散画框", "ungroup", () => dissolve(e)),
    ],
  };
  function shadowOpts(e) {
    return `<div class="opt-row">${[
      ["none", "无"],
      ["sm", "小"],
      ["md", "中"],
      ["lg", "大"],
    ]
      .map(([v, n]) => opt({ shadow: v }, e.shadow === v, n))
      .join("")}</div>`;
  }
  function boxSetters(e) {
    const def = e.type === "card" ? "var(--el-card)" : "var(--bg-surface)";
    return [
      {
        k: "bg",
        label: "背景",
        dot: e.bgMode === "none" ? "none" : { f: e.bg || def, s: e.bg || "var(--line-1)" },
        body: () =>
          seg(
            "bgMode",
            [
              ["none", "透明"],
              ["solid", "纯色"],
              ["gradient", "渐变"],
              ["top", "顶部"],
            ],
            e.bgMode
          ) +
          (e.bgMode !== "none"
            ? cf(
                "颜色",
                `<div class="sw-row">${sw("默认", "", "", { bg: null }, e.bg == null, "def")}${CARD_BG.map(([n, c]) => sw(n, c, `color-mix(in srgb, ${c}, #000 12%)`, { bg: c }, e.bg === c)).join("")}</div>`
              )
            : ""),
      },
      {
        k: "pad",
        label: "内边距",
        icon: "padding",
        body: () =>
          cf("水平", slider("padX", 0, 40, e.padX, "px")) +
          cf("垂直", slider("padY", 0, 40, e.padY, "px")),
      },
      { k: "shadow", label: "阴影", icon: "shadow", body: () => shadowOpts(e) },
      act("fitH", "适应高度", "fold-v", () => X.toast("已按内容调整高度（mock）")),
      act("fitW", "适应宽度", "fold-h", () => X.toast("已按内容调整宽度（mock）")),
    ];
  }

  function setProp(e, patch, silent) {
    Object.assign(e, patch);
    drawWorld();
    drawOverlay();
    if (!silent) {
      S.ver++;
      drawAttr();
    }
  }
  function bindBody(root, e, redraw) {
    root.querySelectorAll("[data-p]").forEach(
      b =>
        (b.onclick = () => {
          setProp(e, JSON.parse(b.dataset.p));
          redraw();
        })
    );
    root.querySelectorAll("[data-t]").forEach(
      b =>
        (b.onclick = () => {
          setProp(e, { [b.dataset.t]: !e[b.dataset.t] });
          redraw();
        })
    );
    root.querySelectorAll("[data-root-theme]").forEach(
      b =>
        (b.onclick = () => {
          const r = e.root ? e : byId(e.parent);
          setProp(r, { theme: b.dataset.rootTheme });
          redraw();
        })
    );
    root.querySelectorAll("input[data-r]").forEach(inp => {
      inp.oninput = () => {
        const v = +inp.value;
        inp.style.setProperty("--p", ((v - +inp.min) / (+inp.max - +inp.min)) * 100 + "%");
        inp.nextElementSibling.textContent = v + inp.dataset.u;
        setProp(e, { [inp.dataset.r]: v }, true);
      };
    });
    root.querySelectorAll("input[data-c]").forEach(inp => {
      inp.oninput = () => setProp(e, { fill: "transparent", stroke: inp.value, color: null }, true);
      inp.onchange = () => {
        setProp(e, {});
        redraw();
      };
    });
  }

  /* ───────── 属性：模型 + 三种形态 ───────── */
  function attrModel() {
    if (C || P || S.moving) return null;
    const sel = selEls().filter(e => sel1(e));
    if (!sel.length) return null;
    if (sel.length > 1) {
      const objs = sel.filter(e => e.type !== "arrow");
      if (objs.length < 2) return null;
      const hws = sel.filter(e => e.type === "handwrite").length;
      return {
        title: `${sel.length} 个元素`,
        icon: "layers",
        multi: true,
        items: [
          act("al-l", "左对齐", "al-left", () => alignSel("l")),
          act("al-r", "右对齐", "al-right", () => alignSel("r")),
          act("al-t", "顶部对齐", "al-top", () => alignSel("t")),
          act("al-b", "底部对齐", "al-bottom", () => alignSel("b")),
          ...(objs.length >= 3
            ? [
                act("ds-h", "横向均分", "dist-h", () => alignSel("dh")),
                act("ds-v", "纵向均分", "dist-v", () => alignSel("dv")),
              ]
            : []),
          ...(hws >= 2
            ? [act("merge", "合并手写", "merge", () => X.toast("已合并为一组手写（mock）"))]
            : []),
        ],
      };
    }
    const e = sel[0];
    const f = SET[e.type];
    if (!f) return null;
    return { title: TYPE[e.type][0], icon: TYPE[e.type][1], el: e, items: f(e) };
  }
  const sel1 = e => !!e;
  function alignSel(kind) {
    const els = selEls().filter(e => e.type !== "arrow");
    const u = union(els.map(bboxOf));
    if (kind === "l") els.forEach(e => (e.x = u.x));
    if (kind === "r") els.forEach(e => (e.x = u.x + u.w - e.w));
    if (kind === "t") els.forEach(e => (e.y = u.y));
    if (kind === "b") els.forEach(e => (e.y = u.y + u.h - e.h));
    if (kind === "dh" || kind === "dv") {
      const hz = kind === "dh";
      const s = els.slice().sort((a, b) => (hz ? a.x - b.x : a.y - b.y));
      const total = s.reduce((n, e) => n + (hz ? e.w : e.h), 0);
      const gap = ((hz ? u.w : u.h) - total) / (s.length - 1);
      let c = hz ? u.x : u.y;
      s.forEach(e => {
        if (hz) e.x = c;
        else e.y = c;
        c += (hz ? e.w : e.h) + gap;
      });
    }
    draw();
  }
  function fitFrame(f) {
    const kids = descendants(f);
    if (!kids.length) return X.toast("画框里还没有元素");
    const u = union(kids.map(bboxOf));
    Object.assign(f, { x: u.x - 28, y: u.y - 28, w: u.w + 56, h: u.h + 56 });
    draw();
  }
  function dissolve(f) {
    const snap = S.els.slice();
    S.els = S.els.filter(e => e !== f);
    S.sel = [];
    draw();
    X.toast(`已解散「${esc(f.title)}」，里面的元素保留`, () => {
      S.els = snap;
      draw();
    });
  }

  let attrSig = "";
  function itemBtn(it, pl) {
    const inner = it.dot
      ? `<span class="dot${it.dot === "none" ? " none" : ""}" style="${it.dot === "none" ? "" : `--f:${it.dot.f};--s:${it.dot.s}`}"></span>`
      : icon(it.icon);
    const on = it.toggle && !it.body && attrModel()?.el?.[it.toggle];
    return `<button class="ibtn ab${cp && cp.key === it.k ? " open" : ""}${on ? " on" : ""}" data-k="${it.k}" data-tip="${it.label}" data-tp="${pl}">${inner}</button>`;
  }
  function drawAttr() {
    if (!$attr) return;
    const m = attrModel();
    const mode = S.opt.attr;
    if (!m) {
      $attr.classList.add("gone");
      if (attrSig) closeCPop();
      attrSig = "";
      return;
    }
    const sig = S.sel.join(",") + "|" + S.ver;
    const selChanged = attrSig.split("|")[0] !== S.sel.join(",");
    if (sig !== attrSig) {
      if (selChanged) closeCPop();
      attrSig = sig;
      if (mode === "inspector") renderInspector(m);
      else {
        const tp = mode === "rail" ? "left" : "top";
        const acts = m.items.filter(i => i.run),
          pops = m.items.filter(i => !i.run);
        $attr.innerHTML =
          pops.map(i => itemBtn(i, tp)).join("") +
          (acts.length && pops.length ? '<span class="gap"></span>' : "") +
          acts.map(i => itemBtn(i, tp)).join("");
        $attr.querySelectorAll(".ab").forEach(b => {
          const k = b.dataset.k;
          b.onclick = () => {
            const it = attrModel()?.items.find(i => i.k === k);
            if (!it) return;
            if (it.run) return it.run();
            if (it.toggle && !it.body) return setProp(m.el, { [it.toggle]: !m.el[it.toggle] });
            if (cp && cp.key === k) return closeCPop();
            if (justClosed(k)) return;
            const place = mode === "rail" ? "left" : $attr.dataset.below === "1" ? "bottom" : "top";
            openCPop(b, place, k, () => attrModel().items.find(i => i.k === k), m.el);
          };
        });
      }
      if (cp && !selChanged) cp.draw();
    }
    $attr.classList.remove("gone");
    if (mode === "float") positionFloat();
  }
  function positionFloat() {
    const sel = selEls();
    const r = $canvas.getBoundingClientRect();
    const b = toSB(union(sel.map(bboxOf)));
    const bw = $attr.offsetWidth,
      bh = $attr.offsetHeight;
    const top0 = S.opt.toolbar === "top" ? 60 : 10;
    let top = b.y - bh - 14,
      below = false;
    if (top < top0) {
      top = b.y + b.h + 14;
      below = true;
    }
    top = clamp(top, top0, r.height - bh - 60);
    const left = clamp(b.x + b.w / 2 - bw / 2, 10, r.width - bw - 10);
    $attr.style.left = left + "px";
    $attr.style.top = top + "px";
    $attr.dataset.below = below ? "1" : "0";
  }
  function renderInspector(m) {
    const body = $attr.querySelector(".ins-body");
    const st = body ? body.scrollTop : 0;
    const pops = m.items.filter(i => !i.run),
      acts = m.items.filter(i => i.run);
    $attr.innerHTML = `
      <div class="ins-head">${icon(m.icon)}<span>${m.title}</span><span class="spacer"></span><button class="ibtn" data-x data-tip="取消选择" data-k="Esc" data-tp="bottom">${icon("x")}</button></div>
      <div class="ins-body">
        ${pops.map(i => `<div class="ins-sec" data-k="${i.k}"><div class="lb">${head(i, m.el)}</div>${i.body ? i.body() : ""}</div>`).join("")}
        ${acts.length ? `<div class="ins-sec"><div class="lb">${m.multi ? "对齐与分布" : "操作"}</div><div class="ins-acts">${acts.map(a => `<button class="btn btn-ghost" data-a="${a.k}">${icon(a.icon)}${a.label}</button>`).join("")}</div></div>` : ""}
      </div>`;
    $attr.querySelector(".ins-body").scrollTop = st;
    $attr.querySelector("[data-x]").onclick = () => setSel([]);
    acts.forEach(a => ($attr.querySelector(`[data-a="${a.k}"]`).onclick = a.run));
    if (m.el)
      bindBody($attr, m.el, () => {
        attrSig = "";
        drawAttr();
      });
  }

  /* ───────── 工具条 ───────── */
  const TOOLS = [
    [
      { k: "geometry", label: "形状", icon: "shapes", sub: "shapes" },
      { k: "arrow", label: "箭头", icon: "arrow-up-right", place: true },
      { k: "handwrite", label: "手写", icon: "pencil", place: true },
      { k: "text", label: "文本", icon: "type", place: true },
      { k: "mind", label: "思维导图", icon: "network", place: true },
    ],
    [
      {
        k: "image",
        label: "图片",
        icon: "image",
        sub: [
          {
            label: "本地上传",
            icon: "upload",
            d: "从电脑选择图片文件",
            run: () => X.toast("打开系统文件选择（mock）"),
          },
          { label: "输入 URL", icon: "link", d: "粘贴网络图片地址", run: () => imageUrlDialog() },
          {
            label: "AI 图片生成",
            icon: "sparkles",
            d: "描述画面，生成后插入",
            run: () => aiDialog(),
          },
        ],
      },
      {
        k: "video",
        label: "视频",
        icon: "video",
        sub: [
          { label: "本地上传", icon: "upload", run: () => X.toast("打开系统文件选择（mock）") },
          {
            label: "网络地址",
            icon: "link",
            run: () =>
              urlDialog({
                title: "添加视频",
                label: "视频地址",
                ph: "https://example.com/video.mp4",
              }),
          },
          {
            label: "Bilibili",
            icon: "tv",
            run: () =>
              urlDialog({
                title: "添加 Bilibili 视频",
                label: "视频链接或 BV 号",
                ph: "https://www.bilibili.com/video/BV…",
              }),
          },
          {
            label: "YouTube",
            icon: "youtube",
            run: () =>
              urlDialog({
                title: "添加 YouTube 视频",
                label: "视频链接",
                ph: "https://www.youtube.com/watch?v=…",
              }),
          },
        ],
      },
      {
        k: "audio",
        label: "音频",
        icon: "audio-lines",
        sub: [
          { label: "本地上传", icon: "upload", run: () => X.toast("打开系统文件选择（mock）") },
          {
            label: "网络地址",
            icon: "link",
            run: () =>
              urlDialog({
                title: "添加音频",
                label: "音频地址",
                ph: "https://example.com/audio.mp3",
              }),
          },
          { label: "文本转语音", icon: "volume-2", run: () => X.toast("文本转语音（mock）") },
        ],
      },
      { k: "webview", label: "网页", icon: "globe", run: () => webDialog() },
    ],
    [
      { k: "card", label: "卡片", icon: "sticky-note", run: () => cardDialog() },
      {
        k: "board",
        label: "白板",
        icon: "presentation",
        sub: [
          {
            label: "创建新白板",
            icon: "square-plus",
            d: "新建一块独立白板并嵌入",
            run: () => insertBoard(null),
          },
          {
            label: "引用已有白板",
            icon: "library",
            d: "选择一块白板里的某一页",
            run: () => boardDialog(),
          },
        ],
      },
    ],
    [
      { k: "frame", label: "画框", icon: "frame", place: true },
      { k: "column", label: "分栏", icon: "columns", place: true },
    ],
  ];
  const SHAPES = [
    ["rect", "矩形", "square"],
    ["ellipse", "圆形", "circle"],
    ["heart", "心形", "heart"],
    ["triangle", "三角形", "triangle"],
  ];
  function toolbarHTML() {
    const pl = { top: "bottom", left: "right", dock: "top" }[S.opt.toolbar];
    const tree =
      S.opt.toolbar === "left"
        ? `<button class="ibtn tbtn" id="ol-btn" data-tip="元素树" data-tp="right">${icon("listtree")}</button><span class="gap"></span>`
        : "";
    return (
      tree +
      TOOLS.map(g =>
        g
          .map(
            t =>
              `<button class="ibtn tbtn${t.sub ? " sub" : ""}" data-tool="${t.k}" data-tip="${t.label}" data-tp="${pl}">${icon(t.icon)}</button>`
          )
          .join("")
      ).join('<span class="gap"></span>')
    );
  }
  function bindToolbar() {
    const pl = { top: "bottom", left: "right", dock: "top" }[S.opt.toolbar];
    $tb.querySelectorAll("[data-tool]").forEach(b => {
      const t = TOOLS.flat().find(x => x.k === b.dataset.tool);
      b.onclick = () => {
        if (justClosed(b)) return;
        if (t.sub === "shapes") {
          openMenu(b, [], pl, {
            html: `<div class="shape-grid">${SHAPES.map(([k, n, ic]) => `<button class="shape-tile" data-s="${k}">${icon(ic)}${n}</button>`).join("")}</div>`,
            bind: (el, close) =>
              el.querySelectorAll("[data-s]").forEach(
                x =>
                  (x.onclick = () => {
                    close();
                    setTool("geometry:" + x.dataset.s);
                  })
              ),
          });
        } else if (t.sub) openMenu(b, t.sub, pl);
        else if (t.run) t.run();
        else setTool(t.k);
      };
    });
  }
  function setTool(k) {
    S.tool = S.tool === k ? null : k;
    $canvas.classList.toggle("placing", !!S.tool);
    $tb
      .querySelectorAll("[data-tool]")
      .forEach(b => b.classList.toggle("on", !!S.tool && S.tool.split(":")[0] === b.dataset.tool));
  }
  let seq = 1;
  const uid = p => `${p}${Date.now().toString(36)}${seq++}`;
  function placeTool(w) {
    const [k, shape] = S.tool.split(":");
    let e;
    if (k === "geometry")
      e = {
        id: uid("g"),
        type: "geometry",
        shape,
        x: w.x - 60,
        y: w.y - 40,
        w: 120,
        h: shape === "rect" ? 72 : 100,
        text: "",
        fill: null,
        stroke: null,
        color: null,
        sw: 2,
        radius: 10,
        align: "center",
        valign: "middle",
        sketch: false,
        fillStyle: "hachure",
        rough: 1.2,
      };
    if (k === "arrow")
      e = {
        id: uid("a"),
        type: "arrow",
        from: { x: w.x, y: w.y },
        to: { x: w.x + 160, y: w.y },
        line: "straight",
        start: "none",
        end: "arrow",
        color: null,
        width: 2,
        dash: false,
        dashStyle: "dash",
        sketch: false,
        flow: false,
        speed: 1,
      };
    if (k === "text")
      e = {
        id: uid("t"),
        type: "richtext",
        x: w.x,
        y: w.y - 14,
        w: 200,
        h: 30,
        text: "双击编辑文本",
        bg: null,
        bgMode: "none",
        padX: 0,
        padY: 0,
        shadow: "none",
      };
    if (k === "mind")
      e = {
        id: uid("m"),
        type: "mind",
        root: true,
        x: w.x - 60,
        y: w.y - 22,
        w: 120,
        h: 44,
        text: "中心主题",
        theme: "default",
      };
    if (k === "frame" || k === "column")
      e = {
        id: uid("f"),
        type: "frame",
        x: w.x,
        y: w.y,
        w: k === "frame" ? 360 : 480,
        h: k === "frame" ? 240 : 280,
        title: k === "frame" ? "画框" : "分栏",
        titlePos: "top",
        fstyle: "default",
      };
    if (!e) return;
    S.els[k === "frame" || k === "column" ? "unshift" : "push"](e);
    setTool(null);
    setSel([e.id]);
  }
  function insertAtCenter(e) {
    const r = $canvas.getBoundingClientRect();
    const c = toW(r.left + r.width / 2, r.top + r.height / 2);
    e.x = c.x - e.w / 2;
    e.y = c.y - e.h / 2;
    S.els.push(e);
    setSel([e.id]);
  }

  /* ───────── 状态栏 ───────── */
  function statusHTML() {
    return `
      <button class="ibtn" id="grid-btn" data-tip="网格" data-tp="top">${icon("hash")}</button><span class="gap" style="width:4px"></span>
      <button class="ibtn" id="z-out" data-tip="缩小" data-tp="top">${icon("minus")}</button><button class="zoom" id="z-val">100%</button><button class="ibtn" id="z-in" data-tip="放大" data-tp="top">${icon("plus")}</button>
      <button class="ibtn" id="z-fit" data-tip="全览" data-tp="top">${icon("maximize")}</button><span class="gap" style="width:4px"></span>
      <button class="btn btn-ghost" id="seq-btn">${icon("play")}演示</button>`;
  }
  function bindStatus() {
    const g = $status.querySelector("#grid-btn");
    g.onclick = () => {
      if (justClosed(g)) return;
      openMenu(g, [], "top", {
        html: `<div style="padding:6px 8px 8px;width:220px">${toggle("grid", "显示网格", S.grid)}<div class="cf" style="margin-top:8px"><div class="lb">网格大小</div><div class="chips" style="margin-top:0">${[10, 20, 40, 80].map(n => `<button class="chip${S.gridSize === n ? " on" : ""}" data-gs="${n}">${n}</button>`).join("")}</div></div></div>`,
        bind: el => {
          el.querySelector("[data-t]").onclick = ev => {
            S.grid = !S.grid;
            ev.currentTarget.querySelector(".switch").classList.toggle("on", S.grid);
            draw();
          };
          el.querySelectorAll("[data-gs]").forEach(
            b =>
              (b.onclick = () => {
                S.gridSize = +b.dataset.gs;
                el.querySelectorAll("[data-gs]").forEach(x => x.classList.toggle("on", x === b));
                draw();
              })
          );
        },
      });
    };
    $status.querySelector("#z-in").onclick = () => zoomBy(1.25);
    $status.querySelector("#z-out").onclick = () => zoomBy(0.8);
    $status.querySelector("#z-fit").onclick = () => fitAll(true);
    const zv = $status.querySelector("#z-val");
    zv.onclick = () => {
      if (justClosed(zv)) return;
      openMenu(
        zv,
        [
          ...[0.5, 0.75, 1, 1.5, 2].map(z => ({
            label: `${z * 100}%`,
            icon: Math.abs(S.zoom - z) < 0.005 ? "check" : "",
            run: () => zoomTo(z),
          })),
          "-",
          { label: "适应全部", icon: "maximize", run: () => fitAll(true) },
        ],
        "top"
      );
    };
    const sb = $status.querySelector("#seq-btn");
    sb.onclick = () => {
      if (!justClosed(sb)) seqMenu(sb);
    };
  }
  function drawStatus() {
    if (!$status) return;
    $status.querySelector("#z-val").textContent = Math.round(S.zoom * 100) + "%";
    $status.querySelector("#grid-btn").classList.toggle("on", S.grid);
  }
  function zoomTo(z, cx, cy, anim) {
    const r = $canvas.getBoundingClientRect();
    cx = cx ?? r.width / 2;
    cy = cy ?? r.height / 2;
    z = clamp(z, 0.1, 4);
    const nx = cx - ((cx - S.px) * z) / S.zoom,
      ny = cy - ((cy - S.py) * z) / S.zoom;
    setView(z, nx, ny, anim ?? true);
  }
  const zoomBy = f => zoomTo(S.zoom * f);
  let animT = 0;
  function setView(z, px, py, anim) {
    if (anim) {
      $world.classList.add("anim");
      $canvas.classList.add("anim");
      clearTimeout(animT);
      animT = setTimeout(() => {
        $world.classList.remove("anim");
        $canvas.classList.remove("anim");
      }, 540);
    }
    S.zoom = z;
    S.px = px;
    S.py = py;
    draw();
  }
  function fitBox(b, pad, anim) {
    const r = $canvas.getBoundingClientRect();
    const t = P ? 40 : S.opt.toolbar === "top" ? 64 : 24;
    const bt = P ? 80 : S.opt.toolbar === "dock" ? 72 : 64;
    const l = P ? 40 : S.opt.toolbar === "left" ? 72 : 32;
    const W = r.width - l - 32,
      H = r.height - t - bt;
    const z = clamp(Math.min(W / (b.w + pad * 2), H / (b.h + pad * 2)), 0.1, P ? 3 : 1);
    setView(z, l + W / 2 - (b.x + b.w / 2) * z, t + H / 2 - (b.y + b.h / 2) * z, anim);
  }
  const fitAll = anim => {
    const u = union(
      S.els.map(e => (e.type === "frame" ? { ...bboxOf(e), y: e.y - 26, h: e.h + 26 } : bboxOf(e)))
    );
    if (u) fitBox(u, 20, anim);
  };

  /* ───────── 选择 / 删除 / 右键 ───────── */
  function setSel(ids) {
    S.sel = ids;
    draw();
  }
  function removeSel() {
    const sel = selEls();
    if (!sel.length) return;
    const snap = S.els.slice();
    const gone = new Set(sel.map(e => e.id));
    sel.forEach(e => descendants(e).forEach(d => e.type === "mind" && gone.add(d.id)));
    S.els = S.els.filter(
      e => !gone.has(e.id) && !(e.type === "arrow" && (gone.has(e.from.id) || gone.has(e.to.id)))
    );
    S.sel = [];
    draw();
    X.toast(
      sel.length > 1
        ? `已删除 ${sel.length} 个元素`
        : `已删除「${esc(nameOf(sel[0]).slice(0, 16))}」`,
      () => {
        S.els = snap;
        draw();
      }
    );
  }
  function layer(kind) {
    const sel = selEls();
    sel.forEach(e => {
      const i = S.els.indexOf(e);
      S.els.splice(i, 1);
      const j =
        kind === "top"
          ? S.els.length
          : kind === "bottom"
            ? 0
            : kind === "up"
              ? Math.min(S.els.length, i + 1)
              : Math.max(0, i - 1);
      S.els.splice(j, 0, e);
    });
    draw();
  }
  function layerEntries() {
    return [
      { label: "上移一层", icon: "chev-right", k: "⌘]", run: () => layer("up") },
      { label: "下移一层", icon: "chev-left", k: "⌘[", run: () => layer("down") },
      { label: "移至顶层", icon: "arrow-up-down", k: "⌥⌘]", run: () => layer("top") },
      { label: "移至底层", icon: "arrow-up-down", k: "⌥⌘[", run: () => layer("bottom") },
    ];
  }
  function elementMenu(x, y) {
    const sel = selEls();
    const one = sel.length === 1 ? sel[0] : null;
    const typed = [];
    if (one && one.type === "richtext")
      typed.push({
        label: "创建为",
        icon: "arrow-up-right",
        children: [
          { label: "卡片", icon: "sticky-note", run: () => X.toast("已创建为卡片（mock）") },
          { label: "文章", icon: "file-text", run: () => X.toast("已创建为文章（mock）") },
          {
            label: "项目文档",
            icon: "folder-kanban",
            run: () => X.toast("已创建为项目文档（mock）"),
          },
        ],
      });
    if (one && one.type === "card")
      typed.push({
        label: "打开笔记",
        icon: "external-link",
        run: () => X.toast("打开卡片笔记（mock）"),
      });
    if (one && one.type === "image")
      typed.push(
        { label: "复制图片", icon: "copy", run: () => X.toast("已复制图片") },
        { label: "下载图片", icon: "download", run: () => X.toast("已下载（mock）") }
      );
    if (one && one.type === "handwrite")
      typed.push(
        { label: "线宽 +1", icon: "plus", run: () => setProp(one, { width: one.width + 1 }) },
        {
          label: "线宽 −1",
          icon: "minus",
          run: () => setProp(one, { width: Math.max(1, one.width - 1) }),
        }
      );
    if (one && one.type === "mind")
      typed.push(
        {
          label: "添加节点",
          icon: "plus",
          children: [
            { label: "子节点", k: "Tab", run: () => X.toast("添加子节点（mock）") },
            { label: "下兄弟节点", k: "↵", run: () => X.toast("添加兄弟节点（mock）") },
          ],
        },
        { label: "重新布局", icon: "network", run: () => X.toast("已重新布局（mock）") }
      );
    if (one && one.type === "frame")
      typed.push(
        { label: "适应内容", icon: "scan", run: () => fitFrame(one) },
        { label: "解散画框", icon: "ungroup", run: () => dissolve(one) }
      );
    if (sel.filter(e => e.type === "handwrite").length >= 2)
      typed.push({
        label: "合并手写",
        icon: "merge",
        run: () => X.toast("已合并为一组手写（mock）"),
      });
    ctxMenu(x, y, [
      {
        label: sel.length > 1 ? "复制选中" : "复制元素",
        icon: "copy",
        k: "⌘C",
        run: () => X.toast("已复制"),
      },
      { label: "图层", icon: "layers", children: layerEntries() },
      ...(typed.length ? ["-", ...typed] : []),
      "-",
      {
        label: sel.length > 1 ? "导出选中为图片" : "导出元素为图片",
        icon: "image",
        run: () => exportDialog(true),
      },
      "-",
      {
        label: sel.length > 1 ? "删除选中" : "删除元素",
        icon: "trash",
        danger: true,
        k: "⌫",
        run: removeSel,
      },
    ]);
  }
  function blankMenu(x, y) {
    ctxMenu(x, y, [
      { label: "粘贴", icon: "clipboard", k: "⌘V", run: () => X.toast("剪贴板为空（mock）") },
      {
        label: "全选",
        icon: "scan",
        k: "⌘A",
        run: () => setSel(S.els.filter(e => e.type !== "frame").map(e => e.id)),
      },
      "-",
      { label: "导出白板为图片", icon: "image", run: () => exportDialog(false) },
    ]);
  }

  /* ───────── 画布手势 ───────── */
  let G = null,
    spaceDown = false;
  function bindCanvas() {
    $canvas.addEventListener("pointerdown", ev => {
      if (P || ev.button === 2) return;
      closeCPop();
      const w = toW(ev.clientX, ev.clientY);
      $canvas.setPointerCapture(ev.pointerId);
      if (ev.button === 1 || spaceDown) {
        G = { kind: "pan", sx: ev.clientX, sy: ev.clientY, px: S.px, py: S.py };
        $canvas.classList.add("panning");
        return;
      }
      if (S.tool === "handwrite") {
        const e = {
          id: uid("h"),
          type: "handwrite",
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          pts: [[w.x, w.y]],
          abs: true,
          color: null,
          width: 3,
          opacity: 100,
          smooth: 50,
          thin: 40,
          pressure: true,
        };
        G = { kind: "ink", e };
        return;
      }
      if (S.tool) {
        placeTool(w);
        G = null;
        return;
      }
      const hit = ev.target.closest("[data-id]");
      if (hit) {
        const id = hit.dataset.id;
        if (ev.shiftKey) setSel(S.sel.includes(id) ? S.sel.filter(x => x !== id) : [...S.sel, id]);
        else if (!S.sel.includes(id)) setSel([id]);
        const moved = new Map();
        selEls().forEach(e => {
          moved.set(e, snapPos(e));
          descendants(e).forEach(d => moved.set(d, snapPos(d)));
        });
        G = { kind: "drag", a: w, moved, go: false };
        return;
      }
      G = { kind: "marq", a: w, shift: ev.shiftKey };
    });
    $canvas.addEventListener("pointermove", ev => {
      if (P) return laserMove(ev);
      if (!G) return;
      const w = toW(ev.clientX, ev.clientY);
      if (G.kind === "pan") {
        S.px = G.px + ev.clientX - G.sx;
        S.py = G.py + ev.clientY - G.sy;
        draw();
        return;
      }
      if (G.kind === "ink") {
        G.e.pts.push([w.x, w.y]);
        if (!S.els.includes(G.e)) S.els.push(G.e);
        drawWorld();
        return;
      }
      if (G.kind === "drag") {
        const dx = w.x - G.a.x,
          dy = w.y - G.a.y;
        if (!G.go && Math.hypot(dx, dy) * S.zoom < 3) return;
        if (!G.go) {
          G.go = true;
          S.moving = true;
          closeCPop();
          drawAttr();
        }
        G.moved.forEach((o, e) => applyPos(e, o, dx, dy));
        drawWorld();
        drawOverlay();
        return;
      }
      if (G.kind === "marq") {
        marq = { a: G.a, b: w };
        drawOverlay();
      }
    });
    const end = ev => {
      if (!G) return;
      const g = G;
      G = null;
      $canvas.classList.remove("panning");
      if (g.kind === "ink") {
        const e = g.e;
        if (e.pts.length < 3) {
          S.els = S.els.filter(x => x !== e);
          drawWorld();
          return;
        }
        const xs = e.pts.map(p => p[0]),
          ys = e.pts.map(p => p[1]);
        e.x = Math.min(...xs);
        e.y = Math.min(...ys);
        e.w = Math.max(...xs) - e.x || 1;
        e.h = Math.max(...ys) - e.y || 1;
        e.pts = e.pts.map(([x, y]) => [x - e.x, y - e.y]);
        setTool(null);
        setSel([e.id]);
        return;
      }
      if (g.kind === "drag") {
        S.moving = false;
        attrSig = "";
        draw();
        return;
      }
      if (g.kind === "marq") {
        const m = marq;
        marq = null;
        if (!m || Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) * S.zoom < 4) {
          if (!g.shift) setSel([]);
          else drawOverlay();
          return;
        }
        const box = {
          x: Math.min(m.a.x, m.b.x),
          y: Math.min(m.a.y, m.b.y),
          w: Math.abs(m.a.x - m.b.x),
          h: Math.abs(m.a.y - m.b.y),
        };
        const ids = S.els.filter(e => contains(box, bboxOf(e))).map(e => e.id);
        setSel(g.shift ? [...new Set([...S.sel, ...ids])] : ids);
      }
    };
    $canvas.addEventListener("pointerup", end);
    $canvas.addEventListener("pointercancel", end);
    $canvas.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      if (P) return;
      const hit = ev.target.closest("[data-id]");
      if (hit) {
        if (!S.sel.includes(hit.dataset.id)) setSel([hit.dataset.id]);
        elementMenu(ev.clientX, ev.clientY);
      } else blankMenu(ev.clientX, ev.clientY);
    });
    $canvas.addEventListener("dblclick", ev => {
      if (P) return;
      const hit = ev.target.closest("[data-id]");
      if (hit) X.toast("进入元素编辑（元素本身不在本轮换皮范围）");
    });
    $canvas.addEventListener(
      "wheel",
      ev => {
        ev.preventDefault();
        if (P) return presentWheel(ev);
        const r = $canvas.getBoundingClientRect();
        if (ev.ctrlKey || ev.metaKey)
          zoomTo(
            S.zoom * Math.exp(-ev.deltaY * 0.01),
            ev.clientX - r.left,
            ev.clientY - r.top,
            false
          );
        else {
          S.px -= ev.deltaX;
          S.py -= ev.deltaY;
          draw();
        }
      },
      { passive: false }
    );
    addEventListener("keydown", ev => {
      const typing = ev.target.closest && ev.target.closest("input,textarea");
      if (typing || X.dialogOpen()) return;
      if (P) return presentKey(ev);
      if (ev.key === " " && !spaceDown) {
        spaceDown = true;
        $canvas.style.cursor = "grab";
        ev.preventDefault();
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && S.sel.length) {
        ev.preventDefault();
        removeSel();
      }
      if (ev.key === "Escape") {
        if (S.tool) setTool(null);
        else if (S.sel.length) setSel([]);
        else if (S.outline && !S.opt.dock) toggleOutline(false);
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "a") {
        ev.preventDefault();
        setSel(S.els.filter(e => e.type !== "frame").map(e => e.id));
      }
      if (ev.shiftKey && ev.key === "!") fitAll(true);
    });
    addEventListener("keyup", ev => {
      if (ev.key === " ") {
        spaceDown = false;
        $canvas.style.cursor = "";
      }
    });
  }
  function snapPos(e) {
    if (e.type === "arrow") return { from: { ...e.from }, to: { ...e.to } };
    return { x: e.x, y: e.y };
  }
  function applyPos(e, o, dx, dy) {
    if (e.type === "arrow") {
      if (!e.from.id) e.from = { x: o.from.x + dx, y: o.from.y + dy };
      if (!e.to.id) e.to = { x: o.to.x + dx, y: o.to.y + dy };
      return;
    }
    e.x = o.x + dx;
    e.y = o.y + dy;
  }

  /* ───────── 元素树浮层 ───────── */
  function toggleOutline(v) {
    S.outline = v ?? !S.outline;
    if (S.opt.dock) {
      $sheet.classList.toggle("ol-closed", !S.outline);
      const b = document.getElementById("ol-btn");
      b.classList.toggle("on", S.outline);
      b.dataset.tip = S.outline ? "收起元素树" : "展开元素树";
      if (S.outline) drawOutline();
      return;
    }
    $outline.classList.toggle("open", S.outline);
    document.getElementById("ol-btn").classList.toggle("on", S.outline);
    if (S.outline) drawOutline();
  }
  function treeRows() {
    const frames = S.els.filter(e => e.type === "frame");
    const parentOf = new Map();
    S.els.forEach(e => {
      if (e.type === "mind" && e.parent) return parentOf.set(e.id, e.parent);
      if (e.type === "frame") return;
      const b = bboxOf(e);
      const f = frames.find(f => contains(f, b));
      if (f) parentOf.set(e.id, f.id);
    });
    const kids = id => S.els.filter(e => parentOf.get(e.id) === id);
    const rows = [];
    const walk = (list, lv) =>
      list.forEach(e => {
        const ks = kids(e.id);
        rows.push({ e, lv, has: ks.length > 0 });
        if (ks.length && !S.olShut.has(e.id)) walk(ks, lv + 1);
      });
    walk(
      S.els.filter(e => !parentOf.has(e.id)),
      0
    );
    return rows;
  }
  /* 停靠式元素树（dock 方案）的行首与副信息 */
  // B：按类型取 tag 色；连线类（箭头 / 手写）中性，自动退后
  const GROUP = {
    geometry: "t2",
    richtext: "t4",
    card: "t3",
    board: "t3",
    image: "t1",
    webview: "t1",
    mind: "t5",
    frame: "box",
    arrow: "line",
    handwrite: "line",
  };
  function kidCount(e) {
    if (e.type === "frame")
      return S.els.filter(
        x => x.type !== "frame" && !(x.type === "mind" && x.parent) && contains(e, bboxOf(x))
      ).length;
    if (e.type === "mind" && e.root) {
      let n = 0;
      const walk = id => S.els.forEach(x => x.parent === id && (n++, walk(x.id)));
      walk(e.id);
      return n;
    }
    return 0;
  }
  function subOf(e) {
    const n = kidCount(e);
    switch (e.type) {
      case "frame":
        return `画框 · ${n} 个元素`;
      case "mind":
        return e.root ? `思维导图 · ${n} 个节点` : "";
      case "card":
        return e.text;
      case "geometry":
        return `图形 · ${{ rect: "矩形", ellipse: "椭圆" }[e.shape] || "图形"}`;
      case "richtext":
        return "文本";
      case "image":
        return "图片";
      case "arrow":
        return "箭头";
      case "handwrite":
        return "手写";
      case "webview":
        return "网页";
      case "board":
        return "白板";
    }
    return "";
  }
  function thumbOf(e) {
    const ink = "var(--el-ink)";
    let inner = "";
    switch (e.type) {
      case "geometry": {
        const r = e.shape === "ellipse" ? "50%" : "3px";
        inner = `<i style="position:absolute;inset:3px 2px;border-radius:${r};background:${e.fill || "transparent"};border:1.5px solid ${e.stroke || ink}"></i>`;
        break;
      }
      case "richtext":
        inner = `<b class="th-t">Aa</b>`;
        break;
      case "card":
        inner = `<i style="position:absolute;inset:2px 3px;border-radius:3px;background:${e.bg || "var(--el-card)"};box-shadow:var(--el-card-shadow)"></i><i class="th-ln" style="top:6px;right:9px"></i><i class="th-ln" style="top:10px;right:6px"></i>`;
        break;
      case "image": {
        const [a, b] = GRADS[e.g % GRADS.length];
        inner = `<i style="position:absolute;inset:0;background:linear-gradient(150deg,${a},${b})"></i><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%"><path d="M8 88 L36 52 L54 72 L70 58 L92 88Z" fill="rgba(255,255,255,.45)"/></svg>`;
        break;
      }
      case "mind":
        inner = e.root
          ? `<i style="position:absolute;inset:5px 3px;border-radius:5px;background:var(--el-mind-root)"></i>`
          : `<i style="position:absolute;inset:6px 3px;border-radius:4px;background:var(--el-mind-node);border:1px solid var(--el-mind-node-line)"></i>`;
        break;
      case "handwrite":
        inner = `<svg viewBox="0 0 26 20"><path d="M3 13c3-5 5-7 7-7s-1 6 1 6 4-5 6-5-1 4 1 4 4-2 4-2" fill="none" stroke="${e.color}" stroke-width="2" stroke-linecap="round"/></svg>`;
        break;
      case "arrow":
        inner = `<svg viewBox="0 0 26 20"><path d="M4 15C11 15 14 5 21 5" fill="none" stroke="${lineColor(e.color)}" stroke-width="1.8" stroke-linecap="round"/><path d="M17 3l4 2-2.6 3.6" fill="none" stroke="${lineColor(e.color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        break;
      case "frame":
        inner = `<i style="position:absolute;inset:2px;border-radius:3px;border:1.5px dashed var(--el-frame-line);background:var(--el-frame-bg)"></i><i class="th-ln" style="top:5px;left:5px;right:12px;background:var(--el-frame-title)"></i>`;
        break;
      default:
        inner = icon(TYPE[e.type][1]);
    }
    return `<span class="th">${inner}</span>`;
  }
  function drawOutline() {
    const q = S.olQuery.trim().toLowerCase();
    const hl = s => {
      const t = esc(s);
      if (!q) return t;
      const i = s.toLowerCase().indexOf(q);
      return i < 0
        ? t
        : esc(s.slice(0, i)) +
            `<mark>${esc(s.slice(i, i + q.length))}</mark>` +
            esc(s.slice(i + q.length));
    };
    const rows = q
      ? S.els.filter(e => nameOf(e).toLowerCase().includes(q)).map(e => ({ e, lv: 0, has: false }))
      : treeRows();
    const body = $outline.querySelector(".ol-body");
    const dk = S.opt.dock;
    if (dk) $outline.dataset.els = S.elsMode;
    const rowHTML = ({ e, lv, has }) => {
      const tw = `<span class="tw${S.olShut.has(e.id) ? " shut" : ""}" data-tw>${has ? icon("chev-down") : ""}</span>`;
      const more = `<button class="more" data-more>${icon("more")}</button>`;
      const cls = `ol-row${S.sel.includes(e.id) ? " on" : ""}${dk ? " dk-" + dk : ""}`;
      if (dk === "c") {
        const sub = subOf(e);
        return `<div class="${cls}" data-id="${e.id}" style="--lv:${lv}">${tw}${thumbOf(e)}<span class="tx"><span class="nm">${hl(nameOf(e))}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</span>${more}</div>`;
      }
      const lead =
        dk === "b"
          ? `<span class="lt g-${GROUP[e.type] || "line"}">${icon(TYPE[e.type][1])}</span>`
          : icon(TYPE[e.type][1]);
      const n = dk ? kidCount(e) : 0;
      return `<div class="${cls}" data-id="${e.id}" style="--lv:${lv}">${tw}${lead}<span class="nm">${hl(nameOf(e))}</span>${n ? `<span class="cnt">${n}</span>` : ""}${more}</div>`;
    };
    body.innerHTML = rows.length
      ? rows.map(rowHTML).join("")
      : `<div class="muted" style="padding:12px 8px;font-size:12.5px">${q ? "没有匹配的元素" : "这一页还是空的"}</div>`;
    $outline.querySelector(".ol-head small").textContent = S.els.length;
    body.querySelectorAll(".ol-row").forEach(r => {
      const id = r.dataset.id;
      r.onclick = ev => {
        if (ev.target.closest("[data-tw]") && r.querySelector("[data-tw] .icon")) {
          S.olShut.has(id) ? S.olShut.delete(id) : S.olShut.add(id);
          return drawOutline();
        }
        if (ev.target.closest("[data-more]")) return rowMenu(r, ev.target.closest("[data-more]"));
        setSel([id]);
        reveal(byId(id));
      };
      r.oncontextmenu = ev => {
        ev.preventDefault();
        setSel([id]);
        rowMenu(r, null, ev);
      };
      r.ondblclick = () => rename(r, id);
    });
  }
  function rowMenu(row, btn, ev) {
    const id = row.dataset.id;
    if (!S.sel.includes(id)) setSel([id]);
    const entries = [
      {
        label: "重命名",
        icon: "edit",
        run: () => rename($outline.querySelector(`.ol-row[data-id="${id}"]`), id),
      },
      "-",
      ...layerEntries(),
      "-",
      { label: "删除", icon: "trash", danger: true, k: "⌫", run: removeSel },
    ];
    if (btn) {
      row.classList.add("menu-on");
      openMenu(btn, entries, "right", { onClose: () => row.classList.remove("menu-on") });
    } else ctxMenu(ev.clientX, ev.clientY, entries);
  }
  function rename(row, id) {
    const e = byId(id);
    const nm = row.querySelector(".nm");
    const inp = document.createElement("input");
    inp.className = "input";
    inp.style.cssText = "height:24px;padding:0 6px;font-size:12.5px";
    inp.value = nameOf(e);
    nm.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const fin = ok => {
      if (done) return;
      done = true;
      if (ok && inp.value.trim()) e.label = inp.value.trim();
      drawOutline();
    };
    inp.onkeydown = ev => {
      ev.stopPropagation();
      if (ev.key === "Enter") fin(true);
      if (ev.key === "Escape") fin(false);
    };
    inp.onblur = () => fin(true);
    inp.onclick = ev => ev.stopPropagation();
  }
  function reveal(e) {
    const r = $canvas.getBoundingClientRect();
    const b = toSB(bboxOf(e));
    const left = S.opt.dock ? 60 : 300;
    if (b.x > left && b.y > 60 && b.x + b.w < r.width - 60 && b.y + b.h < r.height - 60) return;
    const cx = r.width / 2 + (S.opt.dock ? 0 : 130),
      cy = r.height / 2;
    setView(S.zoom, S.px + cx - (b.x + b.w / 2), S.py + cy - (b.y + b.h / 2), true);
  }

  /* ───────── 插入弹窗 ───────── */
  function urlDialog({ title, label, ph, extra = "", ok = "添加", onOk, preview, bindExtra }) {
    X.openDialog(
      () => `
      <h3>${title}</h3>
      <div class="field" style="margin-top:16px"><label>${label}</label><input class="input" id="u" placeholder="${ph}" autofocus></div>
      ${preview ? `<div class="img-preview" id="pv"><div class="ph">${icon("image")}<span>粘贴地址后在这里预览</span></div></div>` : ""}
      ${extra}
      <div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-primary" data-ok disabled>${ok}</button></div>`,
      {
        width: 460,
        bind(box, close) {
          const u = box.querySelector("#u"),
            okb = box.querySelector("[data-ok]");
          u.oninput = () => {
            const v = /^https?:\/\/\S+\.\S+/.test(u.value.trim());
            okb.disabled = !v;
            if (preview) {
              const pv = box.querySelector("#pv");
              pv.innerHTML = v
                ? `<div style="position:absolute;inset:0;background:linear-gradient(150deg,${GRADS[1][0]},${GRADS[1][1]})"></div>`
                : `<div class="ph">${icon("image")}<span>${u.value.trim() ? "地址看起来不完整" : "粘贴地址后在这里预览"}</span></div>`;
            }
          };
          u.onkeydown = ev => ev.key === "Enter" && !okb.disabled && okb.click();
          box.querySelector("[data-x]").onclick = close;
          okb.onclick = () => {
            close();
            (onOk || (() => X.toast(`已添加（mock）`)))(u.value.trim());
          };
          bindExtra && bindExtra(box, close);
        },
      }
    );
  }
  function imageUrlDialog() {
    urlDialog({
      title: "插入图片",
      label: "图片地址",
      ph: "https://example.com/image.png",
      ok: "插入",
      preview: true,
      onOk: () =>
        insertAtCenter({
          id: uid("i"),
          type: "image",
          w: 240,
          h: 170,
          g: 1,
          desc: "",
          showDesc: false,
          descPos: "bottom",
          descAlign: "left",
          shadow: "none",
          bg: null,
        }),
    });
  }
  function webDialog() {
    urlDialog({
      title: "添加网页",
      label: "网页地址",
      ph: "在此粘贴网址，例如：https://www.example.com",
      extra: `<div class="or-line">或者</div><button class="btn btn-secondary" id="local" style="margin-top:8px">${icon("file-html")}选择本地 HTML 文件…</button>`,
      onOk: url => insertAtCenter({ id: uid("w"), type: "webview", w: 420, h: 280, url }),
      bindExtra: (box, close) =>
        (box.querySelector("#local").onclick = () => {
          close();
          insertAtCenter({
            id: uid("w"),
            type: "webview",
            w: 420,
            h: 280,
            url: "file:///demo/attention.html",
          });
        }),
    });
  }
  function aiDialog() {
    X.openDialog(
      () => `
      <h3>AI 图片生成</h3>
      <div class="field" style="margin-top:16px"><label>生成要求</label><textarea class="input" id="pr" rows="4" autofocus placeholder="例如：一张干净的产品架构示意图，浅色背景，包含数据流、服务层和用户端"></textarea></div>
      <div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-primary" data-ok disabled>生成并插入</button></div>`,
      {
        width: 480,
        bind(box, close) {
          const pr = box.querySelector("#pr"),
            okb = box.querySelector("[data-ok]");
          pr.oninput = () => (okb.disabled = !pr.value.trim());
          box.querySelector("[data-x]").onclick = close;
          okb.onclick = () => {
            okb.disabled = true;
            okb.innerHTML = `${icon("clock", "spin")}生成中…`;
            setTimeout(() => {
              close();
              insertAtCenter({
                id: uid("i"),
                type: "image",
                w: 260,
                h: 180,
                g: 4,
                desc: pr.value.trim().slice(0, 24),
                showDesc: true,
                descPos: "bottom",
                descAlign: "left",
                shadow: "none",
                bg: null,
              });
            }, 1100);
          };
        },
      }
    );
  }
  function cardDialog() {
    const picked = new Set();
    X.openDialog(
      () => `
      <h3>选择卡片</h3>
      <div class="search" style="width:100%;margin-top:14px">${icon("search")}<input id="q" placeholder="搜索卡片" autofocus></div>
      <div class="pick-list" id="list"></div>
      <div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-primary" data-ok disabled>插入</button></div>`,
      {
        width: 480,
        bind(box, close) {
          const list = box.querySelector("#list"),
            okb = box.querySelector("[data-ok]"),
            q = box.querySelector("#q");
          const render = () => {
            const k = q.value.trim();
            const rows = CARDS.map((c, i) => [c, i]).filter(
              ([c]) => !k || c[0].includes(k) || c[1].includes(k)
            );
            list.innerHTML = rows.length
              ? rows
                  .map(
                    ([c, i]) =>
                      `<button class="pick-row${picked.has(i) ? " on" : ""}" data-i="${i}"><span class="ck">${icon("check")}</span><span class="tx">${esc(c[0])}<small>${esc(c[1])}</small></span></button>`
                  )
                  .join("")
              : '<div class="muted" style="padding:16px 10px">没有匹配的卡片</div>';
            list.querySelectorAll("[data-i]").forEach(
              b =>
                (b.onclick = () => {
                  const i = +b.dataset.i;
                  picked.has(i) ? picked.delete(i) : picked.add(i);
                  render();
                })
            );
            okb.disabled = !picked.size;
            okb.textContent = picked.size > 1 ? `插入 ${picked.size} 张` : "插入";
          };
          q.oninput = render;
          render();
          box.querySelector("[data-x]").onclick = close;
          okb.onclick = () => {
            close();
            const ids = [];
            [...picked].forEach((i, n) => {
              const e = {
                id: uid("c"),
                type: "card",
                w: 230,
                h: 150,
                title: CARDS[i][0],
                text: CARDS[i][1],
                bg: null,
                bgMode: "solid",
                padX: 16,
                padY: 14,
                shadow: "sm",
              };
              insertAtCenter(e);
              e.x += n * 250 - (picked.size - 1) * 125;
              ids.push(e.id);
            });
            setSel(ids);
          };
        },
      }
    );
  }
  function insertBoard(b, page) {
    if (!b)
      return insertAtCenter({
        id: uid("b"),
        type: "board",
        w: 300,
        h: 190,
        title: "未命名白板",
        page: { elements: [] },
      });
    insertAtCenter({
      id: uid("b"),
      type: "board",
      w: 300,
      h: 190,
      title: b.pages.length > 1 ? `${b.title} · ${page.name}` : b.title,
      page,
    });
  }
  function boardDialog() {
    let board = null,
      page = null;
    X.openDialog(() => `<div id="bd"></div>`, {
      width: 500,
      bind(box, close) {
        const bd = box.querySelector("#bd");
        const render = () => {
          const list = board
            ? board.pages.map((p, i) => ({
                id: i,
                t: p.name,
                s: `${p.elements.length} 个元素`,
                th: X.pageSVG(p, { ratio: 1.6 }),
              }))
            : X.S.boards
                .filter(b => b.id !== 101)
                .map(b => ({
                  id: b.id,
                  t: b.title,
                  s: `${b.pages.length} 页`,
                  th: X.coverHTML(b),
                }));
          bd.innerHTML = `
              <h3 style="display:flex;align-items:center;gap:6px">${board ? `<button class="ibtn" data-back style="margin-left:-6px">${icon("chev-left")}</button>${esc(board.title)}` : "引用已有白板"}</h3>
              <div class="dlg-sub">${board ? "选择要嵌入的一页" : "嵌入后会随原白板更新"}</div>
              <div class="pick-list" style="margin-top:0">${list.map(r => `<button class="pick-row${(board ? page === r.id : false) ? " on" : ""}" data-id="${r.id}"><span class="th">${r.th}</span><span class="tx">${esc(r.t)}<small>${r.s}</small></span>${board ? "" : icon("chev-right", "muted")}</button>`).join("")}</div>
              <div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-primary" data-ok ${board && page != null ? "" : "disabled"}>插入</button></div>`;
          bd.querySelector("[data-x]").onclick = close;
          const back = bd.querySelector("[data-back]");
          if (back)
            back.onclick = () => {
              board = null;
              page = null;
              render();
            };
          bd.querySelectorAll("[data-id]").forEach(
            r =>
              (r.onclick = () => {
                if (!board) {
                  const b = X.findB(+r.dataset.id);
                  if (b.pages.length === 1) {
                    close();
                    return insertBoard(b, b.pages[0]);
                  }
                  board = b;
                  page = null;
                } else page = +r.dataset.id;
                render();
              })
          );
          bd.querySelector("[data-ok]").onclick = () => {
            close();
            insertBoard(board, board.pages[page]);
          };
        };
        render();
      },
    });
  }
  function exportDialog(selection) {
    const st = { bg: "light", scale: 2, pad: 24 };
    X.openDialog(() => `<div id="ex"></div>`, {
      width: 440,
      bind(box, close) {
        const ex = box.querySelector("#ex");
        const render = () => {
          const bg = { light: "#ffffff", dark: "#1f1f1f", clear: "transparent" }[st.bg];
          const page = { elements: [] };
          ex.innerHTML = `
              <h3>${selection ? "导出元素为图片" : "导出白板为图片"}</h3>
              <div class="dlg-sub">${selection ? `选中的 ${S.sel.length} 个元素` : "这一页的全部元素"}</div>
              <div class="export-prev ${st.bg === "clear" ? "checker" : ""}" style="background-color:${st.bg === "clear" ? "var(--bg-surface)" : "var(--canvas)"}"><div class="inner" style="background:${bg};padding:${st.pad / 4}px;box-shadow:${st.bg === "clear" ? "none" : "var(--shadow-lift)"}">${exportThumb(selection)}</div></div>
              <div class="field"><label>背景</label>${seg(
                "bg",
                [
                  ["light", "白色"],
                  ["dark", "深色"],
                  ["clear", "透明"],
                ],
                st.bg
              )}</div>
              <div class="field"><label>放大倍数</label>${seg(
                "scale",
                [
                  [1, "1×"],
                  [2, "2×"],
                  [3, "3×"],
                ],
                st.scale
              )}</div>
              <div class="field"><label>边距</label>${slider("pad", 0, 80, st.pad, "px")}</div>
              <div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-primary" data-ok>${icon("download")}导出</button></div>`;
          ex.querySelectorAll("[data-p]").forEach(
            b =>
              (b.onclick = () => {
                Object.assign(st, JSON.parse(b.dataset.p));
                render();
              })
          );
          const r = ex.querySelector("input[data-r]");
          r.oninput = () => {
            st.pad = +r.value;
            r.style.setProperty("--p", (st.pad / 80) * 100 + "%");
            r.nextElementSibling.textContent = st.pad + "px";
            ex.querySelector(".inner").style.padding = st.pad / 4 + "px";
          };
          ex.querySelector("[data-x]").onclick = close;
          ex.querySelector("[data-ok]").onclick = () => {
            close();
            X.toast(`已导出 PNG · ${st.scale}×（mock）`);
          };
        };
        render();
      },
    });
  }
  function exportThumb(selection) {
    const list = selection ? selEls() : S.els;
    const u = union(list.map(bboxOf));
    if (!u) return "";
    return `<svg viewBox="${u.x - 10} ${u.y - 10} ${u.w + 20} ${u.h + 20}" preserveAspectRatio="xMidYMid meet">${list.map(e => `<rect x="${e.x ?? bboxOf(e).x}" y="${e.y ?? bboxOf(e).y}" width="${bboxOf(e).w || 2}" height="${bboxOf(e).h || 2}" rx="6" style="fill:${e.type === "frame" ? "none" : "rgba(128,128,128,.22)"};stroke:rgba(128,128,128,.4);stroke-width:1.5" vector-effect="non-scaling-stroke"/>`).join("")}</svg>`;
  }

  /* ───────── 演示序列：列表 / 创建面板 / 放映 ───────── */
  function seqMenu(anchor) {
    openMenu(anchor, [], "top", {
      html: `<div style="padding:8px 10px 10px;width:268px">
        <div class="pt" style="font-size:12.5px;font-weight:600;margin:0 0 8px">演示序列</div>
        <div class="seq-list">${SEQS.length ? SEQS.map((s, i) => `<div class="seq-row" data-i="${i}"><button class="play" data-play data-tip="从这里开始放映" data-tp="left">${icon("play", "fill")}</button><span class="nm">${esc(s.name)}<small>${s.frames.length} 帧</small></span><span class="acts"><button class="ibtn" data-edit data-tip="编辑" data-tp="top">${icon("edit")}</button><button class="ibtn" data-del data-tip="删除" data-tp="top">${icon("trash")}</button></span></div>`).join("") : '<div class="muted" style="padding:6px 8px 10px;font-size:12.5px">还没有演示序列</div>'}</div>
        <button class="btn btn-soft" data-new style="width:100%;margin-top:8px">${icon("plus")}新建演示序列</button></div>`,
      bind(el, close) {
        el.querySelectorAll(".seq-row").forEach(r => {
          const i = +r.dataset.i;
          r.onclick = ev => {
            close();
            if (ev.target.closest("[data-edit]")) return openCreator(i);
            if (ev.target.closest("[data-del]")) return delSeq(i);
            present(SEQS[i].frames, false, SEQS[i].name);
          };
        });
        el.querySelector("[data-new]").onclick = () => {
          close();
          openCreator(null);
        };
      },
    });
  }
  function delSeq(i) {
    const s = SEQS[i];
    X.openDialog(
      () =>
        `<h3>删除「${esc(s.name)}」？</h3><p class="dsub">这个序列的 ${s.frames.length} 帧会一起删除，画布上的元素不受影响。</p><div class="dfoot"><button class="btn btn-secondary" data-x>取消</button><button class="btn btn-danger" data-ok>删除</button></div>`,
      {
        width: 400,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            SEQS.splice(i, 1);
            close();
            X.toast(`已删除「${esc(s.name)}」`);
          };
        },
      }
    );
  }
  let C = null,
    $creator = null;
  function openCreator(i) {
    const s = i == null ? null : SEQS[i];
    C = {
      idx: i,
      name: s ? s.name : "",
      frames: s ? s.frames.map(f => ({ ...f })) : [],
      cur: s ? 0 : -1,
      adjusting: false,
      dirty: false,
    };
    S.sel = [];
    if (S.outline) toggleOutline(false);
    $creator.hidden = false;
    renderCreator();
    draw();
  }
  function closeCreator() {
    C = null;
    $creator.hidden = true;
    $creator.innerHTML = "";
    attrSig = "";
    draw();
  }
  function miniMap(fr) {
    const all = union(S.els.map(bboxOf));
    const b = frameBox(fr);
    return `<svg viewBox="${all.x - 40} ${all.y - 40} ${all.w + 80} ${all.h + 80}" preserveAspectRatio="xMidYMid meet">${S.els
      .filter(e => e.type !== "arrow" && e.type !== "frame")
      .map(
        e =>
          `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="10" style="fill:var(--th-bar)"/>`
      )
      .join(
        ""
      )}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function renderCreator() {
    const f = C.frames[C.cur];
    $creator.innerHTML = `
      <div class="cr-head"><input id="cr-name" placeholder="演示序列名称" value="${esc(C.name)}"><button class="ibtn" id="cr-x" data-tip="关闭" data-tp="bottom">${icon("x")}</button></div>
      <div class="cr-tools">
        <button class="btn btn-soft" id="cr-add" data-tip="把画布上选中的元素加为一帧" data-tp="bottom">${icon("plus")}添加帧</button>
        <button class="btn btn-ghost${C.adjusting ? " open" : ""}" id="cr-adj" ${f ? "" : "disabled"}>${icon("scan-eye")}${C.adjusting ? "完成" : "调整视口"}</button>
        <button class="btn btn-ghost" id="cr-pv" ${C.frames.length ? "" : "disabled"}>${icon("eye")}预览</button>
      </div>
      ${C.adjusting && f ? `<div class="cr-pad">${cf("视口留白", slider("pad", 0, 200, f.pad, "px"))}</div>` : ""}
      <div class="cr-list">${
        C.frames.length
          ? C.frames
              .map(
                (fr, i) =>
                  `<div class="fr-row${i === C.cur ? " on" : ""}" data-i="${i}"><span class="ix">${i + 1}</span><span class="mini">${miniMap(fr)}</span><span class="nm">第 ${i + 1} 帧<small>${frameIds(fr).length} 个元素</small></span><span class="acts"><button class="ibtn" data-pv data-tip="预览此帧" data-tp="top">${icon("eye")}</button><button class="ibtn" data-rm data-tip="删除此帧" data-tp="top">${icon("trash")}</button></span></div>`
              )
              .join("")
          : `<div class="cr-empty">${icon("film")}选中画布上的元素，点「添加帧」</div>`
      }</div>
      <div class="cr-foot"><button class="btn btn-secondary" id="cr-cancel">取消</button><button class="btn btn-primary" id="cr-save" ${C.frames.length ? "" : "disabled"}>${C.idx == null ? "保存" : "更新"}</button></div>`;
    const q = s => $creator.querySelector(s);
    q("#cr-name").oninput = ev => {
      C.name = ev.target.value;
      C.dirty = true;
    };
    q("#cr-x").onclick = q("#cr-cancel").onclick = cancelCreator;
    q("#cr-add").onclick = () => {
      if (!S.sel.length) return X.toast("先在画布上选中要放进这一帧的元素");
      C.frames.push({ ids: S.sel.slice(), pad: 40 });
      C.cur = C.frames.length - 1;
      C.dirty = true;
      renderCreator();
      drawOverlay();
    };
    q("#cr-adj").onclick = () => {
      C.adjusting = !C.adjusting;
      renderCreator();
    };
    q("#cr-pv").onclick = () => present(C.frames, true, C.name || "预览");
    const pad = $creator.querySelector("input[data-r]");
    if (pad)
      pad.oninput = () => {
        f.pad = +pad.value;
        pad.style.setProperty("--p", (f.pad / 200) * 100 + "%");
        pad.nextElementSibling.textContent = f.pad + "px";
        drawOverlay();
      };
    $creator.querySelectorAll(".fr-row").forEach(r => {
      const i = +r.dataset.i;
      r.onclick = ev => {
        if (ev.target.closest("[data-rm]")) {
          C.frames.splice(i, 1);
          C.cur = Math.min(C.cur, C.frames.length - 1);
          C.dirty = true;
          renderCreator();
          drawOverlay();
          return;
        }
        C.cur = i;
        renderCreator();
        fitBox(frameBox(C.frames[i]), 20, true);
      };
    });
    q("#cr-save").onclick = () => {
      const name = C.name.trim() || `演示序列 ${SEQS.length + 1}`;
      const data = { name, frames: C.frames };
      if (C.idx == null) SEQS.push(data);
      else SEQS[C.idx] = data;
      const n = C.frames.length;
      closeCreator();
      X.toast(`已保存「${esc(name)}」· ${n} 帧`);
    };
  }
  function cancelCreator() {
    if (!C.dirty) return closeCreator();
    X.openDialog(
      () =>
        `<h3>放弃这次编辑？</h3><p class="dsub">已添加的 ${C.frames.length} 帧不会保存。</p><div class="dfoot"><button class="btn btn-secondary" data-x>继续编辑</button><button class="btn btn-danger" data-ok>放弃</button></div>`,
      {
        width: 380,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            close();
            closeCreator();
          };
        },
      }
    );
  }

  let P = null,
    $pctl = null,
    $ptip = null,
    $laser = null;
  function present(frames, preview, name) {
    if (!frames.length) return;
    closeMenus(0);
    closeCPop();
    P = {
      frames,
      i: 0,
      preview,
      laser: false,
      saved: { z: S.zoom, x: S.px, y: S.py },
      sel: S.sel,
      wheelT: 0,
    };
    S.sel = [];
    document.body.classList.add("presenting");
    $pctl = document.createElement("div");
    $pctl.className = "fl present-ctl";
    $sheet.appendChild($pctl);
    $ptip = document.createElement("div");
    $ptip.className = "present-tip";
    $ptip.textContent = `${name} · ← → 或滚轮翻页，Esc 退出`;
    $sheet.appendChild($ptip);
    setTimeout(() => $ptip && $ptip.classList.add("hide"), 2600);
    setTimeout(() => showFrame(false));
  }
  function showFrame(anim = true) {
    renderPctl();
    fitBox(frameBox(P.frames[P.i]), 0, anim);
  }
  function renderPctl() {
    $pctl.innerHTML = `
      <button class="ibtn" data-prev ${P.i === 0 ? "disabled style='opacity:.35'" : ""}>${icon("chev-left")}</button>
      <span class="count"><b>${P.i + 1}</b> / ${P.frames.length}</span>
      <button class="ibtn" data-next ${P.i === P.frames.length - 1 ? "disabled style='opacity:.35'" : ""}>${icon("chev-right")}</button>
      <span class="gap"></span>
      <button class="ibtn${P.laser ? " on" : ""}" data-laser data-tip="${P.laser ? "切换为普通鼠标" : "切换为激光笔"}" data-tp="top">${icon("crosshair")}</button>
      <button class="btn btn-ghost" data-exit>${icon("x")}${P.preview ? "退出预览" : "退出"}</button>`;
    $pctl.querySelector("[data-prev]").onclick = () => step(-1);
    $pctl.querySelector("[data-next]").onclick = () => step(1);
    $pctl.querySelector("[data-laser]").onclick = () => {
      P.laser = !P.laser;
      $canvas.classList.toggle("laser-on", P.laser);
      if (!P.laser && $laser) {
        $laser.remove();
        $laser = null;
      }
      renderPctl();
    };
    $pctl.querySelector("[data-exit]").onclick = exitPresent;
  }
  function step(d) {
    const n = clamp(P.i + d, 0, P.frames.length - 1);
    if (n === P.i) return;
    P.i = n;
    showFrame();
  }
  function presentKey(ev) {
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(ev.key)) {
      ev.preventDefault();
      step(1);
    }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(ev.key)) {
      ev.preventDefault();
      step(-1);
    }
    if (ev.key === "Escape") exitPresent();
  }
  function presentWheel(ev) {
    if (Date.now() - P.wheelT < 450 || Math.abs(ev.deltaY) < 8) return;
    P.wheelT = Date.now();
    step(ev.deltaY > 0 ? 1 : -1);
  }
  function laserMove(ev) {
    if (!P || !P.laser) return;
    const r = $canvas.getBoundingClientRect();
    const x = ev.clientX - r.left,
      y = ev.clientY - r.top;
    if (!$laser) {
      $laser = document.createElement("div");
      $laser.className = "laser";
      $canvas.appendChild($laser);
    }
    $laser.style.left = x + "px";
    $laser.style.top = y + "px";
    const t = document.createElement("div");
    t.className = "laser-trail";
    t.style.left = x + "px";
    t.style.top = y + "px";
    $canvas.appendChild(t);
    setTimeout(() => t.remove(), 440);
  }
  function exitPresent() {
    const sv = P.saved,
      sel = P.sel;
    P = null;
    document.body.classList.remove("presenting");
    $canvas.classList.remove("laser-on");
    [$pctl, $ptip, $laser].forEach(x => x && x.remove());
    $pctl = $ptip = $laser = null;
    S.sel = C ? [] : sel;
    setView(sv.z, sv.x, sv.y, false);
    if (C) renderCreator();
  }

  /* ───────── 主渲染 / 挂载 ───────── */
  function draw() {
    drawWorld();
    drawOverlay();
    drawAttr();
    drawStatus();
    if (S.outline) drawOutline();
  }
  function setCrumb() {
    const solo = document.body.classList.contains("solo");
    const tg = S.opt.dock
      ? `<button class="titlebar-btn crumb-toggle${S.outline ? " on" : ""}" id="ol-btn" data-tip="${S.outline ? "收起元素树" : "展开元素树"}" data-tp="bottom">${icon("panel-left")}</button>`
      : "";
    document.querySelector(".titlebar-crumb").innerHTML =
      `${tg}白板<span class="crumb-sep">/</span><span class="crumb-board">Transformer 结构拆解</span>${solo ? "" : '<span class="crumb-sep">/</span><span class="crumb-page">注意力机制</span>'}`;
    if (S.opt.dock) document.getElementById("ol-btn").onclick = () => toggleOutline();
  }

  function mount(opt) {
    S.opt = opt;
    S.els = initEls();
    const demos = [
      {
        label: "主题化元素",
        run: b => {
          S.elsMode = S.elsMode === "legacy" ? "theme" : "legacy";
          b.classList.toggle("on", S.elsMode === "theme");
          draw();
        },
      },
      {
        label: "多选",
        run: () => {
          setSel(["q", "k", "v"]);
        },
      },
      {
        label: "单页",
        run: b => {
          document.body.classList.toggle("solo");
          b.classList.toggle("on");
          setCrumb();
          setTimeout(() => draw());
        },
      },
    ];
    const { page } = X.mountShell({ demos });
    injectExtra();
    const pages = X.findB(101).pages;
    const tree =
      opt.dock || opt.toolbar === "left"
        ? ""
        : `<div class="fl tl chrome"><button class="ibtn" id="ol-btn" data-tip="元素树" data-tp="bottom">${icon("listtree")}</button></div>`;
    const attrBox =
      opt.attr === "inspector"
        ? `<aside class="inspector chrome gone" id="attr"></aside>`
        : `<div class="fl chrome gone ${opt.attr === "rail" ? "attr-rail" : "attr-float"}" id="attr"></div>`;
    page.style.height = "100%";
    page.innerHTML = `
      <div class="page-detail">
        <div class="sheet${opt.dock ? " dock" : ""}" id="sheet">
          ${
            opt.dock
              ? `<aside class="ol-dock" id="outline"><div class="ol-in">
            <div class="ol-head">元素<small></small><span class="spacer"></span><button class="ibtn" data-tip="按类型筛选" data-tp="bottom" id="ol-filter">${icon("filter")}</button></div>
            <div class="ol-search">${icon("search")}<input id="ol-q" placeholder="查找元素"></div>
            <div class="ol-body"></div></div><div class="ol-grip" id="ol-grip"></div>
          </aside><div class="sheet-main">`
              : ""
          }
          <div class="canvas grid" id="canvas"><div class="world" id="world"></div><div id="ov"></div></div>
          <div class="fl chrome tb-${opt.toolbar}" id="tb">${toolbarHTML()}</div>
          ${tree}
          ${attrBox}
          <div class="fl chrome status" id="status">${statusHTML()}</div>
          ${
            opt.dock
              ? ""
              : `<aside class="outline chrome" id="outline" style="${opt.toolbar === "left" ? "left:64px;top:12px;bottom:64px" : ""}">
            <div class="ol-head">元素树<small></small><span class="spacer"></span><button class="ibtn" id="ol-x" data-tip="收起" data-tp="bottom">${icon("x")}</button></div>
            <div class="ol-search">${icon("search")}<input id="ol-q" placeholder="查找元素"></div>
            <div class="ol-body"></div>
          </aside>`
          }
          <aside class="creator chrome" id="creator" hidden></aside>
          <div class="solo-hot chrome"></div>
          <div class="fl solo-pill chrome">注意力机制<button class="ibtn" data-tip="新建页" data-tp="top">${icon("plus")}</button></div>
          ${opt.dock ? "</div>" : ""}
        </div>
        <div class="sheetbar chrome">
          <button class="ibtn" data-tip="新建页" data-tp="top">${icon("plus")}</button>
          <button class="ibtn" data-tip="所有页" data-tp="top">${icon("files")}</button>
          ${pages.map((p, i) => `<button class="stab${i === 1 ? " on" : ""}" data-pg="${i}">${esc(p.name)}</button>`).join("")}
        </div>
      </div>`;
    $sheet = document.getElementById("sheet");
    $canvas = document.getElementById("canvas");
    $world = document.getElementById("world");
    $ov = document.getElementById("ov");
    $attr = document.getElementById("attr");
    $status = document.getElementById("status");
    $tb = document.getElementById("tb");
    $outline = document.getElementById("outline");
    $creator = document.getElementById("creator");
    bindToolbar();
    bindStatus();
    bindCanvas();
    if (opt.dock) {
      S.outline = true;
      $sheet.addEventListener("transitionend", ev => ev.target === $outline && draw());
      document.getElementById("ol-filter").onclick = ev =>
        X.toast("按类型筛选：图形 / 文本 / 卡片 / 图片 …（mock 未实现）");
      const grip = document.getElementById("ol-grip");
      grip.onpointerdown = ev => {
        ev.preventDefault();
        const x0 = ev.clientX,
          w0 = $outline.getBoundingClientRect().width;
        $sheet.classList.add("ol-dragging");
        const mv = e2 => {
          $sheet.style.setProperty("--olw", clamp(w0 + e2.clientX - x0, 200, 380) + "px");
          draw();
        };
        const up = () => {
          $sheet.classList.remove("ol-dragging");
          removeEventListener("pointermove", mv);
          removeEventListener("pointerup", up);
        };
        addEventListener("pointermove", mv);
        addEventListener("pointerup", up);
      };
    } else {
      document.getElementById("ol-btn").onclick = () => toggleOutline();
      document.getElementById("ol-x").onclick = () => toggleOutline(false);
    }
    document.getElementById("ol-q").oninput = ev => {
      S.olQuery = ev.target.value;
      drawOutline();
    };
    document
      .querySelectorAll("[data-pg]")
      .forEach(
        b =>
          (b.onclick = () =>
            b.classList.contains("on") || X.toast("画布换皮 mockup 只演示「注意力机制」这一页"))
      );
    setCrumb();
    new MutationObserver(() => draw()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    addEventListener("resize", () => draw());
    setTimeout(() => {
      fitAll(false);
      if (opt.dock) drawOutline();
    });
  }

  window.WBC = { mount, S, draw, setSel, present, openCreator, toggleOutline, SEQS };
})();
