/* 各节示意。每次切换明暗都整体重画。 */
const $ = s => document.querySelector(s);
const svgEl = (w, h, cls = "canvas") => {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("width", w);
  s.setAttribute("height", h);
  s.setAttribute("class", cls);
  return s;
};

const DEEP_WORK = () => ({
  t: "深度工作",
  c: [
    { t: "为什么重要", c: [{ t: "稀缺能力" }, { t: "产出质量" }, { t: "意义感" }] },
    { t: "怎么练习", c: [{ t: "固定时段" }, { t: "仪式感" }, { t: "拥抱无聊" }] },
    { t: "常见阻碍", c: [{ t: "即时通讯" }, { t: "开放办公" }] },
    { t: "衡量方式", c: [{ t: "深度时长" }, { t: "产出记录" }] },
  ],
});

const LAYOUT_META = [
  ["mind", "思维导图", "主分支左右平衡展开（现状）"],
  ["logic", "逻辑图", "全部向右，适合层层推导"],
  ["org", "组织结构图", "向下展开，适合分类与拆解"],
  ["tree", "树状图", "缩进列表式，适合长清单"],
  ["timeline", "时间轴", "主分支沿轴线交替排列"],
  ["fishbone", "鱼骨图", "因果分析，结论在右端"],
];

const sections = [];
const section = fn => sections.push(fn);

section(() => {
  const box = $("#layouts");
  box.innerHTML = "";
  for (const [id, name, desc] of LAYOUT_META) {
    const wrap = document.createElement("div");
    const s = svgEl(352, 260);
    wrap.appendChild(s);
    const cap = document.createElement("p");
    cap.className = "cap";
    cap.innerHTML = `<b style="color:var(--ink-1);font-weight:600">${name}</b>　${desc}${id === "timeline" || id === "fishbone" ? "（第 5 批）" : ""}`;
    wrap.appendChild(cap);
    box.appendChild(wrap);
    const tree = DEEP_WORK();
    if (id === "fishbone") tree.t = "深度不足";
    if (id === "tree") tree.c.slice(2).forEach(b => (b.fold = true));
    render(s, tree, { layout: id, pad: 18 });
  }
});

section(() => {
  render($("#s2-canvas"), DEEP_WORK(), {
    layout: "org",
    selected: ["深度工作"],
    pad: 30,
    after: () => {},
  });
  const lo = $("#layout-opts");
  lo.innerHTML = "";
  LAYOUT_META.forEach(([id, name]) => {
    const b = document.createElement("button");
    b.className = "m-opt" + (id === "org" ? " on" : "");
    const s = svgEl(84, 50, "th");
    b.appendChild(s);
    b.append(name);
    lo.appendChild(b);
    thumb(s, id);
  });
  const po = $("#palette-opts");
  po.innerHTML = "";
  const pal = [
    ["经典", [25, 145, 255]],
    ["晨雾", [240, 15, 150]],
    ["海洋", [265, 225, 185]],
    ["暖秋", [40, 100, 25]],
    ["森林", [140, 110, 60]],
    ["莓果", [350, 295, 10]],
  ];
  pal.forEach(([name, hs], i) => {
    const b = document.createElement("button");
    b.className = "m-opt" + (i === 0 ? " on" : "");
    b.innerHTML = `<span class="th" style="display:flex;align-items:center;justify-content:center;gap:4px;height:30px">${hs
      .map(
        h =>
          `<i style="width:14px;height:14px;border-radius:4px;background:oklch(0.9 0.05 ${h});box-shadow:inset 0 0 0 1.5px oklch(0.64 0.13 ${h})"></i>`
      )
      .join("")}</span>${name}`;
    po.appendChild(b);
  });
});

function drawAll() {
  for (const fn of sections) fn();
}

document.querySelectorAll("#theme-tabs button").forEach(b =>
  b.addEventListener("click", () => {
    document.documentElement.dataset.theme = b.dataset.t;
    document
      .querySelectorAll("#theme-tabs button")
      .forEach(x => x.setAttribute("aria-pressed", x === b));
    drawAll();
  })
);
section(() => {
  const t = DEEP_WORK();
  render($("#s3a"), t, { layout: "logic", selected: ["怎么练习"], pad: 22 });
  const t2 = DEEP_WORK();
  t2.c[0].fold = true;
  t2.c[2].fold = true;
  render($("#s3b"), t2, { layout: "logic", pad: 22 });
});

section(() => {
  const t = {
    t: "深度工作",
    c: [
      { t: "为什么重要", c: [{ t: "稀缺能力" }, { t: "产出质量", note: true }] },
      { t: "怎么练习", c: [{ t: "固定时段", note: true }, { t: "仪式感" }, { t: "拥抱无聊" }] },
    ],
  };
  const svg = $("#s4a");
  render(svg, t, { layout: "logic", pad: 26, hover: "固定时段" });
  const ic = svg.querySelector("[data-hover]").getBoundingClientRect();
  const st = svg.getBoundingClientRect();
  const peek = $("#s4-peek");
  peek.style.left = `${Math.min(ic.left - st.left - 12, st.width - peek.offsetWidth - 16)}px`;
  peek.style.top = `${ic.bottom - st.top + 8}px`;
});

section(() => {
  const t = DEEP_WORK();
  t.c = t.c.slice(0, 3);
  render($("#s5a"), t, {
    layout: "logic",
    pad: 22,
    summaries: [{ range: ["固定时段", "拥抱无聊"], t: "每天 4 小时" }],
  });
  const t2 = DEEP_WORK();
  t2.c = t2.c.slice(0, 3);
  render($("#s5b"), t2, {
    layout: "logic",
    pad: 22,
    boundaries: [{ range: ["为什么重要", "怎么练习"], title: "书里讲的", sel: true }],
  });
});

section(() => {
  const small = () => ({
    t: "深度工作",
    c: [
      { t: "怎么练习", c: [{ t: "固定时段" }, { t: "拥抱无聊" }] },
      { t: "常见阻碍", c: [{ t: "即时通讯" }, { t: "开放办公" }] },
    ],
  });
  render($("#s6a"), small(), {
    layout: "logic",
    pad: 22,
    selected: ["拥抱无聊"],
    relations: [{ from: "拥抱无聊", toPt: [130, 70], pending: true, bend: 40, dx: 40 }],
  });
  render($("#s6b"), small(), {
    layout: "logic",
    pad: 22,
    relations: [
      { from: "拥抱无聊", to: "即时通讯", side: "right", bend: 70, label: "对抗", sel: true },
    ],
  });
  const t3 = small();
  t3.c[1].fold = true;
  render($("#s6c"), t3, {
    layout: "logic",
    pad: 22,
    relations: [
      { from: "拥抱无聊", to: "常见阻碍", side: "right", bend: 70, label: "对抗", faded: true },
    ],
  });
});
section(() => {
  const t = {
    t: "深度工作",
    c: [
      { t: "为什么重要" },
      { t: "怎么练习", c: [{ t: "固定时段" }, { t: "仪式感" }, { t: "拥抱无聊" }] },
      { t: "常见阻碍" },
    ],
  };
  render($("#s7a"), t, { layout: "logic", pad: 20, selected: ["怎么练习"] });
  const t2 = {
    t: "深度工作",
    c: [
      { t: "怎么练习" },
      {
        t: "常见阻碍",
        c: [
          { t: "即时通讯" },
          { t: "拒绝社交媒体", c: [{ t: "按价值评估工具" }, { t: "30 天停用实验" }] },
          { t: "别上网瞎逛" },
        ],
      },
    ],
  };
  render($("#s7b"), t2, { layout: "logic", pad: 20, selected: ["拒绝社交媒体", "别上网瞎逛"] });
});

section(() => {
  const base = () => ({
    t: "深度工作",
    c: [
      { t: "怎么练习", c: [{ t: "固定时段" }, { t: "仪式感" }] },
      { t: "常见阻碍", c: [{ t: "即时通讯" }] },
    ],
  });
  const t = base();
  t.c[0].c.push({ t: "每周一次复盘", ghost: true });
  render($("#s8a"), t, {
    layout: "logic",
    pad: 24,
    after(g, find) {
      const gh = find("每周一次复盘");
      const x = gh.x + 70,
        y = gh.y + 60;
      const card = el(
        "g",
        { filter: "drop-shadow(0 8px 14px rgba(120,100,70,.28))", opacity: 0.94 },
        g
      );
      el(
        "rect",
        { x, y, width: 148, height: 64, rx: 6, fill: "var(--bg-surface)", stroke: "var(--line-1)" },
        card
      );
      el(
        "text",
        {
          x: x + 14,
          y: y + 26,
          "font-size": 13,
          fill: "var(--ink-1)",
          "font-family": FONT,
          text: "每周一次复盘",
        },
        card
      );
      el(
        "text",
        {
          x: x + 14,
          y: y + 46,
          "font-size": 11.5,
          fill: "var(--ink-3)",
          "font-family": FONT,
          text: "周日晚上，20 分钟",
        },
        card
      );
      const ic = el(
        "g",
        {
          transform: `translate(${x + 124} ${y + 8})`,
          fill: "none",
          stroke: "var(--ink-3)",
          "stroke-width": 1.3,
        },
        card
      );
      el("path", { d: "M2 1.5h6.5L11 4v8H2z M8.5 1.5V4H11" }, ic);
    },
  });
  const t2 = base();
  t2.c[0].c.push({ t: "每周一次复盘", note: true });
  render($("#s8b"), t2, { layout: "logic", pad: 24, selected: ["每周一次复盘"] });
});

section(() => {
  const t = {
    t: "深度工作",
    c: [
      { t: "为什么重要", c: [{ t: "稀缺能力", note: true }, { t: "产出质量" }, { t: "意义感" }] },
      { t: "怎么练习", c: [{ t: "固定时段" }, { t: "仪式感" }, { t: "拥抱无聊", note: true }] },
      { t: "常见阻碍", c: [{ t: "即时通讯" }, { t: "开放办公" }, { t: "会议过多" }] },
      { t: "衡量方式", fold: true, c: [{ t: "深度时长" }, { t: "产出记录" }] },
    ],
  };
  render($("#s11a"), t, {
    layout: "logic",
    pad: 30,
    summaries: [{ range: ["固定时段", "拥抱无聊"], t: "每天 4 小时" }],
    boundaries: [{ range: ["为什么重要", "为什么重要"], title: "书里讲的" }],
    relations: [{ from: "拥抱无聊", to: "即时通讯", side: "right", bend: 80, label: "对抗" }],
    after(g, find) {
      // 画布上的普通图片元素，和导图并排
      const r = find("深度工作");
      const w = 180,
        h = 112,
        x = r.x - w - 70,
        y = r.y + r.h / 2 - h / 2;
      const card = el("g", { filter: "drop-shadow(0 4px 10px rgba(120,100,70,.18))" }, g);
      photo(card, x, y, w, h, 210);
      el(
        "text",
        {
          x,
          y: y + h + 18,
          "font-size": 11.5,
          fill: "var(--ink-3)",
          "font-family": FONT,
          text: "图片：书封",
        },
        g
      );
    },
  });
});

// SECTION-SCRIPTS
document.fonts?.ready ? document.fonts.ready.then(drawAll) : drawAll();
