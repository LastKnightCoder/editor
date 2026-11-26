/* 思维导图增强设计稿：迷你布局引擎 + 示意绘制。配色按「经典 × 浅底」近似 MindThemeUtil。 */
const NS = "http://www.w3.org/2000/svg";
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const ctx = document.createElement("canvas").getContext("2d");

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

const isLight = () => document.documentElement.dataset.theme !== "cocoa";
const ok = (l, c, h, a) => `oklch(${l} ${c} ${h}${a ? ` / ${a}` : ""})`;
const ROOT_HUE = [265, 0.03];
const HUES = [
  [25, 0.15],
  [145, 0.15],
  [255, 0.15],
  [55, 0.15],
  [300, 0.15],
  [200, 0.15],
];

function vis(n) {
  const L = isLight();
  const [h, c] = n.hue;
  const line = L ? ok(0.64, c, h) : ok(0.72, c, h);
  if (n.level === 1)
    return L
      ? {
          fill: ok(0.3, 0.03, 265),
          text: "#fbf8f2",
          stroke: "none",
          sw: 0,
          r: 10,
          line: ok(0.3, 0.03, 265),
        }
      : {
          fill: ok(0.9, 0.02, 265),
          text: ok(0.22, 0.02, 265),
          stroke: "none",
          sw: 0,
          r: 10,
          line: ok(0.86, 0.02, 265),
        };
  if (n.level === 2 || n.summary)
    return {
      fill: L ? ok(0.95, c * 0.32, h) : ok(0.33, c * 0.45, h),
      text: L ? ok(0.42, c * 0.9, h) : ok(0.9, c * 0.45, h),
      stroke: line,
      sw: 1.5,
      r: 8,
      line,
    };
  return {
    fill: "transparent",
    text: L ? ok(0.4, c * 0.8, h) : ok(0.88, c * 0.4, h),
    stroke: "none",
    sw: 0,
    r: 6,
    line,
  };
}
const lineWidth = level => (level <= 2 ? 3 : level === 3 ? 2 : 1.5);

const SIZE = { 1: [17, 600, 18, 11], 2: [14.5, 500, 13, 7], 3: [13.5, 400, 8, 4] };
function measure(n) {
  const [fs, fw, px, py] = SIZE[n.summary ? 2 : Math.min(n.level, 3)];
  ctx.font = `${fw} ${fs}px ${FONT}`;
  const lh = Math.round(fs * 1.45);
  let w = ctx.measureText(n.t).width + (n.note ? 20 : 0);
  let h = lh;
  Object.assign(n, { w: Math.ceil(w + px * 2), h: Math.ceil(h + py * 2), lh, fs, fw, px, py });
}

function prep(tree) {
  const walk = (n, level, hue, parent) => {
    Object.assign(n, { level, hue, parent });
    delete n.foldAt;
    measure(n);
    (n.c || []).forEach((k, i) => walk(k, level + 1, level === 1 ? HUES[i % HUES.length] : hue, n));
  };
  walk(tree, 1, ROOT_HUE, null);
  return tree;
}
const kids = n => (n.fold ? [] : n.c || []);
const count = n => (n.c || []).reduce((s, k) => s + 1 + count(k), 0);
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

/* ───── 水平：思维导图 / 逻辑图 ───── */
const GY = level => (level <= 2 ? 18 : 8);
const MX = 40;
function subH(n) {
  const k = kids(n);
  if (!k.length) return n.h;
  return Math.max(n.h, sum(k, subH) + GY(n.level + 1) * (k.length - 1));
}
function placeH(n, x, cy, dir, out) {
  n.x = dir > 0 ? x : x - n.w;
  n.y = cy - n.h / 2;
  n.dir = dir;
  out.push(n);
  if (n.c?.length) n.foldAt = { x: dir > 0 ? n.x + n.w + 10 : n.x - 10, y: cy };
  groupH(n, kids(n), dir, out);
}
function groupH(n, k, dir, out) {
  if (!k.length) return;
  const gap = GY(n.level + 1);
  let y = n.y + n.h / 2 - (sum(k, subH) + gap * (k.length - 1)) / 2;
  for (const c of k) {
    const hh = subH(c);
    placeH(c, dir > 0 ? n.x + n.w + MX : n.x - MX, y + hh / 2, dir, out);
    y += hh + gap;
  }
}
function edgeH(p, c) {
  const x1 = c.dir > 0 ? p.x + p.w : p.x;
  const y1 = p.y + p.h / 2;
  const x2 = c.dir > 0 ? c.x : c.x + c.w;
  const y2 = c.y + c.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/* ───── 缩进列（树状图、组织结构图的三级以下、时间轴的子项） ───── */
const IND = 26;
const GT = 9;
function wT(n) {
  const k = kids(n);
  return Math.max(n.w, k.length ? IND + Math.max(...k.map(wT)) : 0);
}
function placeT(n, x, y, out, up = false) {
  n.x = x;
  n.y = up ? y - n.h : y;
  n.tree = true;
  out.push(n);
  if (n.c?.length && n.level > 1) n.foldAt = { x: n.x - 11, y: n.y + n.h / 2 };
  let cy = up ? n.y - GT : n.y + n.h + GT;
  for (const c of up ? [...kids(n)].reverse() : kids(n)) {
    const edge = placeT(c, x + IND, cy, out, up);
    cy = up ? edge - GT : edge + GT;
  }
  return up ? Math.min(n.y, cy + GT) : Math.max(n.y + n.h, cy - GT);
}
function edgeT(p, c) {
  const sx = p.x + Math.min(14, p.w / 2);
  const up = c.y < p.y;
  const y1 = up ? p.y : p.y + p.h;
  const y2 = c.y + c.h / 2;
  const r = 7;
  return `M${sx} ${y1} V${up ? y2 + r : y2 - r} Q${sx} ${y2} ${sx + r} ${y2} H${c.x}`;
}

const elbowDown = (p, c, midY) => {
  const x1 = p.x + p.w / 2,
    y1 = p.y + p.h,
    x2 = c.x + Math.min(14, c.w / 2),
    r = 8;
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1} V${c.y}`;
  const s = x2 > x1 ? 1 : -1;
  return `M${x1} ${y1} V${midY - r} Q${x1} ${midY} ${x1 + s * r} ${midY} H${x2 - s * r} Q${x2} ${midY} ${x2} ${midY + r} V${c.y}`;
};

function treeEdges(n, edges) {
  for (const c of kids(n)) {
    edges.push({ d: edgeT(n, c), child: c });
    treeEdges(c, edges);
  }
}
function hEdges(n, edges) {
  for (const c of kids(n)) {
    edges.push({ d: edgeH(n, c), child: c });
    hEdges(c, edges);
  }
}

const LAYOUTS = {
  mind(root) {
    const out = [],
      edges = [];
    root.x = -root.w / 2;
    root.y = -root.h / 2;
    out.push(root);
    const k = kids(root),
      half = Math.ceil(k.length / 2);
    groupH(root, k.slice(0, half), 1, out);
    groupH(root, k.slice(half), -1, out);
    root.foldAt = null;
    hEdges(root, edges);
    return { nodes: out, edges };
  },
  logic(root) {
    const out = [],
      edges = [];
    placeH(root, 0, 0, 1, out);
    root.foldAt = null;
    hEdges(root, edges);
    return { nodes: out, edges };
  },
  tree(root) {
    const out = [],
      edges = [];
    placeT(root, 0, 0, out);
    treeEdges(root, edges);
    return { nodes: out, edges };
  },
  org(root) {
    const out = [],
      edges = [];
    const k = kids(root),
      gap = 30;
    const widths = k.map(wT);
    const total = sum(widths, w => w) + gap * (k.length - 1);
    root.x = -root.w / 2;
    root.y = 0;
    out.push(root);
    const rowY = root.h + 44;
    let x = -total / 2;
    k.forEach((c, i) => {
      placeT(c, x, rowY, out);
      c.foldAt = c.c?.length ? { x: c.x + Math.min(14, c.w / 2), y: c.y + c.h + 9 } : null;
      edges.push({ d: elbowDown(root, c, root.h + 22), child: c });
      treeEdges(c, edges);
      x += widths[i] + gap;
    });
    return { nodes: out, edges };
  },
  timeline(root) {
    const out = [],
      edges = [],
      deco = [];
    const k = kids(root);
    root.x = 0;
    root.y = -root.h / 2;
    out.push(root);
    let x = root.w + 40;
    const axisY = 0;
    k.forEach((c, i) => {
      const up = i % 2 === 0;
      placeT(c, x, up ? axisY - 34 : axisY + 34, out, up);
      c.foldAt = null;
      const px = c.x + Math.min(14, c.w / 2);
      edges.push({ d: `M${px} ${axisY} V${up ? c.y + c.h : c.y}`, child: c, dot: [px, axisY] });
      treeEdges(c, edges);
      x += Math.max(wT(c), 90) * 0.62 + 28;
    });
    const end = Math.max(...out.map(n => n.x + n.w)) + 30;
    deco.push({ axis: `M${root.x + root.w} ${axisY} H${end}`, end });
    return { nodes: out, edges, deco };
  },
  fishbone(root) {
    const out = [],
      edges = [],
      deco = [];
    const k = kids(root);
    root.x = 0;
    root.y = -root.h / 2;
    out.push(root);
    const L = 120,
      span = 210;
    let leftmost = 0;
    k.forEach((c, i) => {
      const up = i % 2 === 0;
      const bx = -54 - Math.floor(i / 2) * span - (up ? 0 : span / 2);
      const tx = bx - L * 0.55,
        ty = up ? -L : L;
      c.x = tx - c.w / 2;
      c.y = up ? ty - c.h - 4 : ty + 4;
      c.foldAt = null;
      out.push(c);
      edges.push({ d: `M${bx} 0 L${tx} ${ty}`, child: c });
      const gs = kids(c);
      gs.forEach((g, j) => {
        const t = (j + 1) / (gs.length + 1);
        const px = bx + (tx - bx) * t,
          py = ty * t;
        g.x = px - 18 - g.w;
        g.y = py - g.h / 2;
        g.foldAt = null;
        out.push(g);
        edges.push({ d: `M${px} ${py} H${px - 18}`, child: g });
      });
      leftmost = Math.min(leftmost, tx - c.w / 2, ...gs.map(g => g.x));
    });
    deco.push({ axis: `M${leftmost - 10} 0 H${root.x}`, head: true });
    return { nodes: out, edges, deco };
  },
};

function photo(g, x, y, w, h, hue = 200) {
  const id = "ph" + Math.random().toString(36).slice(2, 8);
  const defs = el("defs", {}, g);
  const lg = el("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": ok(0.86, 0.06, hue) }, lg);
  el("stop", { offset: 1, "stop-color": ok(0.95, 0.03, hue + 40) }, lg);
  const clip = id + "c";
  const cp = el("clipPath", { id: clip }, defs);
  el("rect", { x, y, width: w, height: h, rx: 5 }, cp);
  const gg = el("g", { "clip-path": `url(#${clip})` }, g);
  el("rect", { x, y, width: w, height: h, fill: `url(#${id})` }, gg);
  el("circle", { cx: x + w * 0.72, cy: y + h * 0.32, r: h * 0.12, fill: ok(0.97, 0.04, 85) }, gg);
  el(
    "path",
    {
      d: `M${x} ${y + h} L${x + w * 0.32} ${y + h * 0.5} L${x + w * 0.55} ${y + h * 0.78} L${x + w * 0.72} ${y + h * 0.6} L${x + w} ${y + h} Z`,
      fill: ok(0.62, 0.07, hue + 150),
    },
    gg
  );
}

function drawNode(g, n, opt) {
  const v = vis(n);
  const sel = opt.selected?.includes(n.id ?? n.t);
  const grp = el("g", { opacity: opt.dim?.includes(n.t) ? 0.35 : 1 }, g);
  if (sel)
    el(
      "rect",
      {
        x: n.x - 3.5,
        y: n.y - 3.5,
        width: n.w + 7,
        height: n.h + 7,
        rx: v.r + 3,
        fill: "none",
        stroke: "var(--accent)",
        "stroke-width": 2,
      },
      grp
    );
  if (n.ghost) {
    el(
      "rect",
      {
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: v.r,
        fill: "var(--accent-soft)",
        stroke: "var(--accent)",
        "stroke-width": 1.5,
        "stroke-dasharray": "4 3",
      },
      grp
    );
    return;
  }
  el(
    "rect",
    {
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      rx: v.r,
      fill: v.fill,
      stroke: v.stroke,
      "stroke-width": v.sw,
    },
    grp
  );
  let cy = n.y + n.py;
  const tx = n.x + n.px;
  el(
    "text",
    {
      x: tx,
      y: cy + n.lh / 2 + 0.5,
      "dominant-baseline": "middle",
      "font-size": n.fs,
      "font-weight": n.fw,
      fill: v.text,
      "font-family": FONT,
      text: n.t,
    },
    grp
  );
  if (n.note) {
    const nx = n.x + n.w - n.px - 12,
      ny = cy + n.lh / 2 - 6.5;
    if (opt.hover === n.t)
      el(
        "rect",
        {
          "data-hover": 1,
          x: nx - 4,
          y: ny - 4,
          width: 21,
          height: 21,
          rx: 5,
          fill: v.line,
          "fill-opacity": 0.16,
        },
        grp
      );
    const ic = el(
      "g",
      {
        transform: `translate(${nx} ${ny})`,
        fill: "none",
        stroke: v.line,
        "stroke-width": 1.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      grp
    );
    el("path", { d: "M2 1.5h6.5L11 4v8H2z M8.5 1.5V4H11 M4.2 7h4.6 M4.2 9.5h3" }, ic);
  }
  if (n.foldAt && opt.folds !== false) {
    const f = n.foldAt;
    const show = n.fold || opt.foldAll || sel;
    if (show) {
      el(
        "circle",
        {
          cx: f.x,
          cy: f.y,
          r: n.fold ? 9 : 7.5,
          fill: n.fold ? v.line : "var(--bg-surface)",
          stroke: v.line,
          "stroke-width": 1.5,
        },
        grp
      );
      if (n.fold)
        el(
          "text",
          {
            x: f.x,
            y: f.y + 0.5,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "font-size": 9.5,
            "font-weight": 700,
            fill: "#fff",
            text: count(n),
          },
          grp
        );
      else
        el(
          "path",
          {
            d: `M${f.x - 3.5} ${f.y} H${f.x + 3.5}`,
            stroke: v.line,
            "stroke-width": 1.6,
            "stroke-linecap": "round",
          },
          grp
        );
    }
  }
}

function subtreeBox(nodes) {
  return {
    x1: Math.min(...nodes.map(n => n.x)),
    y1: Math.min(...nodes.map(n => n.y)),
    x2: Math.max(...nodes.map(n => n.x + n.w)),
    y2: Math.max(...nodes.map(n => n.y + n.h)),
  };
}
const descendants = (n, acc = []) => {
  acc.push(n);
  kids(n).forEach(k => descendants(k, acc));
  return acc;
};

/**
 * render(svg, tree, { layout, boundaries:[{range:[a,b], title}], summaries:[{range:[a,b], t}],
 *   relations:[{from,to,label}], selected:[t], dim:[t], foldAll, pad, after(g, find) })
 */
function render(svg, tree, opt = {}) {
  svg.innerHTML = "";
  prep(tree);
  const { nodes, edges, deco = [] } = LAYOUTS[opt.layout || "logic"](tree);
  const find = t => nodes.find(n => n.t === t);
  const vp = el("g", {}, svg);
  const back = el("g", {}, vp);
  const lines = el("g", { fill: "none", "stroke-linecap": "round" }, vp);
  const front = el("g", {}, vp);
  const top = el("g", {}, vp);
  const extra = [];

  for (const d of deco) {
    el(
      "path",
      {
        d: d.axis,
        stroke: vis(tree).line,
        "stroke-width": 3,
        "stroke-linecap": "round",
        fill: "none",
      },
      lines
    );
    if (d.end)
      el(
        "path",
        {
          d: `M${d.end - 8} -6 L${d.end + 2} 0 L${d.end - 8} 6`,
          fill: "none",
          stroke: vis(tree).line,
          "stroke-width": 3,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        lines
      );
  }
  for (const e of edges) {
    const c = e.child;
    el(
      "path",
      {
        d: e.d,
        stroke: c.ghost ? "var(--accent)" : vis(c).line,
        "stroke-dasharray": c.ghost ? "4 4" : null,
        "stroke-width": lineWidth(c.level),
        opacity: opt.dim?.includes(c.t) ? 0.35 : 1,
      },
      lines
    );
    if (e.dot)
      el(
        "circle",
        {
          cx: e.dot[0],
          cy: e.dot[1],
          r: 5,
          fill: "var(--canvas)",
          stroke: vis(c).line,
          "stroke-width": 2.5,
        },
        lines
      );
  }

  for (const b of opt.boundaries || []) {
    const [a, z] = b.range.map(find);
    const sibs = a.parent.c.slice(a.parent.c.indexOf(a), a.parent.c.indexOf(z) + 1);
    const box = subtreeBox(sibs.flatMap(s => descendants(s)));
    const pad = 9,
      v = vis(a);
    const x = box.x1 - pad,
      y = box.y1 - pad - (b.title ? 20 : 0),
      w = box.x2 - box.x1 + pad * 2,
      h = box.y2 - y + pad;
    el(
      "rect",
      {
        x,
        y,
        width: w,
        height: h,
        rx: 12,
        fill: v.line,
        "fill-opacity": isLight() ? 0.07 : 0.1,
        stroke: v.line,
        "stroke-opacity": 0.55,
        "stroke-width": 1.25,
        "stroke-dasharray": "5 4",
      },
      back
    );
    if (b.title)
      el(
        "text",
        {
          x: x + 12,
          y: y + 15,
          "font-size": 11.5,
          "font-weight": 600,
          fill: v.text,
          text: b.title,
        },
        back
      );
    if (b.sel)
      el(
        "rect",
        {
          x: x - 3,
          y: y - 3,
          width: w + 6,
          height: h + 6,
          rx: 14,
          fill: "none",
          stroke: "var(--accent)",
          "stroke-width": 2,
        },
        back
      );
  }

  for (const s of opt.summaries || []) {
    const [a, z] = s.range.map(find);
    const sibs = a.parent.c.slice(a.parent.c.indexOf(a), a.parent.c.indexOf(z) + 1);
    const box = subtreeBox(sibs.flatMap(n => descendants(n)));
    const bx = box.x2 + 12,
      mid = (box.y1 + box.y2) / 2,
      v = vis(a);
    el(
      "path",
      {
        d: `M${bx} ${box.y1} Q${bx + 9} ${box.y1} ${bx + 9} ${box.y1 + 9} V${mid - 7} Q${bx + 9} ${mid} ${bx + 17} ${mid} Q${bx + 9} ${mid} ${bx + 9} ${mid + 7} V${box.y2 - 9} Q${bx + 9} ${box.y2} ${bx} ${box.y2}`,
        fill: "none",
        stroke: v.line,
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      lines
    );
    const sn = { t: s.t, summary: true, level: 3, hue: a.hue };
    measure(sn);
    sn.x = bx + 30;
    sn.y = mid - sn.h / 2;
    nodes.push(sn);
    extra.push(sn);
    drawNode(front, sn, opt);
  }

  for (const n of nodes) if (!extra.includes(n)) drawNode(front, n, opt);

  for (const r of opt.relations || []) {
    const a = find(r.from),
      b = r.toPt ? { x: a.x + r.toPt[0], y: a.y + r.toPt[1], w: 0, h: 0 } : find(r.to);
    const p1 = { x: a.x + a.w / 2, y: a.y + a.h },
      p2 = { x: b.x + b.w / 2, y: b.y };
    if (r.side === "up") {
      p1.y = a.y;
      p2.y = b.y + b.h;
    }
    if (r.side === "right") {
      p1.x = a.x + a.w;
      p1.y = a.y + a.h / 2;
      p2.x = b.x + b.w;
      p2.y = b.y + b.h / 2;
    }
    const bend = r.bend ?? 60;
    const c1 =
      r.side === "right"
        ? { x: p1.x + bend, y: p1.y }
        : { x: p1.x + (r.dx ?? 0), y: p1.y + (r.side === "up" ? -bend : bend) };
    const c2 =
      r.side === "right"
        ? { x: p2.x + bend, y: p2.y }
        : { x: p2.x + (r.dx ?? 0), y: p2.y + (r.side === "up" ? bend : -bend) };
    const col = "var(--ink-2)";
    const path = el(
      "path",
      {
        d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`,
        fill: "none",
        stroke: r.sel ? "var(--accent)" : col,
        "stroke-width": 1.6,
        "stroke-dasharray": r.pending ? "2 4" : "6 4",
        "stroke-linecap": "round",
        opacity: r.faded ? 0.4 : 0.85,
      },
      top
    );
    const ang = Math.atan2(p2.y - c2.y, p2.x - c2.x);
    if (!r.pending)
      el(
        "path",
        {
          d: `M${p2.x - 8 * Math.cos(ang - 0.45)} ${p2.y - 8 * Math.sin(ang - 0.45)} L${p2.x} ${p2.y} L${p2.x - 8 * Math.cos(ang + 0.45)} ${p2.y - 8 * Math.sin(ang + 0.45)}`,
          fill: "none",
          stroke: r.sel ? "var(--accent)" : col,
          "stroke-width": 1.6,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          opacity: r.faded ? 0.4 : 0.85,
        },
        top
      );
    if (r.pending) el("circle", { cx: p2.x, cy: p2.y, r: 3.5, fill: "var(--ink-2)" }, top);
    if (r.label) {
      const L = path.getTotalLength(),
        m = path.getPointAtLength(L / 2);
      ctx.font = `500 11.5px ${FONT}`;
      const w = ctx.measureText(r.label).width + 14;
      el(
        "rect",
        {
          x: m.x - w / 2,
          y: m.y - 10,
          width: w,
          height: 20,
          rx: 6,
          fill: "var(--canvas)",
          stroke: "var(--line-1)",
        },
        top
      );
      el(
        "text",
        {
          x: m.x,
          y: m.y + 0.5,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          "font-size": 11.5,
          "font-weight": 500,
          fill: "var(--ink-2)",
          text: r.label,
        },
        top
      );
    }
    if (r.sel)
      for (const c of [c1, c2])
        el(
          "circle",
          {
            cx: c.x,
            cy: c.y,
            r: 4.5,
            fill: "var(--bg-surface)",
            stroke: "var(--accent)",
            "stroke-width": 1.5,
          },
          top
        );
  }

  opt.after?.(top, find, nodes);

  const bb = vp.getBBox();
  const W = +svg.getAttribute("width"),
    H = +svg.getAttribute("height"),
    pad = opt.pad ?? 26;
  const k = Math.min(1, (W - pad * 2) / bb.width, (H - pad * 2) / bb.height) * (opt.scale ?? 1);
  vp.setAttribute(
    "transform",
    `translate(${(W - bb.width * k) / 2 - bb.x * k} ${(H - bb.height * k) / 2 - bb.y * k}) scale(${k})`
  );
  return { find, nodes, k };
}

/* 缩略图：只画骨架，用在「导图样式」浮层 */
function thumb(svg, layout) {
  const t = {
    t: "主题",
    c: [
      { t: "分支一", c: [{ t: "子项" }, { t: "子项" }] },
      { t: "分支二", c: [{ t: "子项" }] },
      { t: "分支三", c: [{ t: "子项" }, { t: "子项" }] },
      { t: "分支四", c: [{ t: "子项" }] },
    ],
  };
  render(svg, t, { layout, folds: false, pad: 6 });
  svg.querySelectorAll("text").forEach(n => n.remove());
}
