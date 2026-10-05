/*
  白板手绘风格 mockup · 整板演示：白板级画风 + 元素级覆盖 + 新「笔触」弹层。
  视觉参考，非导出源（D-001）。
*/
(function () {
  const FILL = { 蓝: "#8fb3e6", 绿: "#9cc79a", 黄: "#f0c55a", 粉: "#ec9f94", 紫: "#b9a3dd" };
  const STROKE = { 墨: "var(--sk-ink)", 蓝: "#3d6aa8", 朱: "#b5483b", 绿: "#4f7a4a" };

  const board = { style: "hand", level: "natural" };
  let plan = new URLSearchParams(location.search).get("plan") || "b";

  // ───────── 内容：Transformer · 自注意力 ─────────
  const frames = [{ id: "f1", x: 40, y: 56, w: 760, h: 568, title: "自注意力 Self-Attention", seed: 9 }];
  const shapes = [
    { id: "x", x: 74, y: 304, w: 112, h: 56, shape: { kind: "rect" }, text: "输入 X", seed: 1 },
    { id: "q", x: 262, y: 168, w: 104, h: 52, shape: { kind: "rect" }, fill: { type: "wash", color: FILL.蓝 }, text: "Query", seed: 2 },
    { id: "k", x: 262, y: 306, w: 104, h: 52, shape: { kind: "rect" }, fill: { type: "wash", color: FILL.绿 }, text: "Key", seed: 3 },
    { id: "v", x: 262, y: 444, w: 104, h: 52, shape: { kind: "rect" }, fill: { type: "wash", color: FILL.紫 }, text: "Value", seed: 4 },
    { id: "qk", x: 432, y: 210, w: 136, h: 58, shape: { kind: "rect", radius: 14 }, fill: { type: "hatch", color: FILL.黄 }, text: "QKᵀ / √d", seed: 5 },
    { id: "sm", x: 440, y: 322, w: 120, h: 66, shape: { kind: "ellipse" }, text: "Softmax", seed: 6 },
    { id: "ws", x: 620, y: 434, w: 140, h: 62, shape: { kind: "rect", radius: 10 }, fill: { type: "wash", color: FILL.粉 }, text: "加权求和", seed: 7 },
    { id: "warn", x: 612, y: 230, w: 62, h: 46, shape: { kind: "triangle" }, stroke: STROKE.朱, text: "!", textY: -6, seed: 8 },
    { id: "out", x: 640, y: 548, w: 100, h: 48, shape: { kind: "rect" }, fill: { type: "cross", color: FILL.黄 }, text: "输出", seed: 10 },
    { id: "heart", x: 1132, y: 150, w: 40, h: 38, shape: { kind: "heart" }, fill: { type: "wash", color: FILL.粉 }, stroke: STROKE.朱, sw: 1.5, seed: 12 },
    // 思维导图节点
    { id: "m0", x: 846, y: 470, w: 120, h: 46, shape: { kind: "rect", radius: 23 }, fill: { type: "wash", color: FILL.黄 }, text: "注意力变体", seed: 21, mind: true },
    { id: "m1", x: 1032, y: 404, w: 92, h: 36, shape: { kind: "rect", radius: 18 }, text: "多头", seed: 22, mind: true, sw: 1.5 },
    { id: "m2", x: 1032, y: 476, w: 92, h: 36, shape: { kind: "rect", radius: 18 }, text: "稀疏", seed: 23, mind: true, sw: 1.5 },
    { id: "m3", x: 1032, y: 548, w: 92, h: 36, shape: { kind: "rect", radius: 18 }, text: "线性", seed: 24, mind: true, sw: 1.5 },
  ];
  const arrows = [
    { id: "a1", from: "x", fs: "r", to: "q", ts: "l", kind: "curve", seed: 31 },
    { id: "a2", from: "x", fs: "r", to: "k", ts: "l", kind: "straight", seed: 32 },
    { id: "a3", from: "x", fs: "r", to: "v", ts: "l", kind: "curve", seed: 33 },
    { id: "a4", from: "q", fs: "r", to: "qk", ts: "t", kind: "elbow", seed: 34 },
    { id: "a5", from: "k", fs: "r", to: "qk", ts: "l", kind: "elbow", seed: 35, label: "转置" },
    { id: "a6", from: "qk", fs: "b", to: "sm", ts: "t", kind: "straight", seed: 36 },
    { id: "a7", from: "sm", fs: "r", to: "ws", ts: "t", kind: "elbow", seed: 37, label: "权重" },
    { id: "a8", from: "v", fs: "r", to: "ws", ts: "l", kind: "straight", seed: 38, animated: true },
    { id: "a9", from: "ws", fs: "b", to: "out", ts: "t", kind: "straight", seed: 39 },
    { id: "a10", from: "x", fs: "b", to: "out", ts: "l", kind: "curve", dashed: true, seed: 40, label: "残差", animated: true },
    { id: "e1", from: "m0", fs: "r", to: "m1", ts: "l", kind: "curve", seed: 41, mind: true, sw: 1.5 },
    { id: "e2", from: "m0", fs: "r", to: "m2", ts: "l", kind: "curve", seed: 42, mind: true, sw: 1.5 },
    { id: "e3", from: "m0", fs: "r", to: "m3", ts: "l", kind: "curve", seed: 43, mind: true, sw: 1.5 },
  ];
  const texts = [{ id: "t1", x: 846, y: 72, w: 260, text: "为什么要除以 √d ？\n维度大时点积方差大，softmax 会饱和。", seed: 51 }];
  const inks = [
    // 已有「手写」工具的笔迹：圈住 √d，拉一条到批注
    { pts: ellipsePts(536, 239, 26, 19, 1.12), color: "#b5483b", size: 3, seed: 61 },
    { pts: SK.bezier([560, 224], [610, 150], [720, 92], [836, 96], 40), color: "#b5483b", size: 2.6, seed: 62 },
  ];
  const cards = [{ id: "c1", x: 846, y: 170, w: 272, h: 150, title: "注意力 = 软寻址", body: "用 Query 与每个 Key 的相似度作权重，对 Value 做加权平均——像按内容查表，但每一项都取一点。", meta: "卡片 · 3 天前" }];

  function ellipsePts(cx, cy, rx, ry, turns) {
    const pts = [];
    for (let i = 0; i <= 60 * turns; i++) {
      const a = -2.4 + (Math.PI * 2 * i) / 60;
      const k = 1 + i * 0.0016;
      pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
    }
    return pts;
  }

  // ───────── 状态与渲染 ─────────
  let selected = null;
  const byId = id => shapes.find(s => s.id === id) || arrows.find(a => a.id === id) || texts.find(t => t.id === id);
  const effStyle = el => (el.sketch && el.sketch.style) || board.style;
  const effLevel = el => (el.sketch && el.sketch.level) || board.level;
  const modeOf = el => (effStyle(el) === "hand" ? plan : "precise");

  const root = document.getElementById("canvas");
  const world = document.getElementById("world");
  const svgBack = SK.node("svg", { class: "layer", width: 1220, height: 680 }, world);
  const htmlLayer = document.createElement("div");
  htmlLayer.className = "layer";
  world.appendChild(htmlLayer);
  const svgFront = SK.node("svg", { class: "layer front", width: 1220, height: 680 }, world);

  function anchor(s, side) {
    const o = 3;
    return {
      l: [s.x - o, s.y + s.h / 2],
      r: [s.x + s.w + o, s.y + s.h / 2],
      t: [s.x + s.w / 2, s.y - o],
      b: [s.x + s.w / 2, s.y + s.h + o],
    }[side];
  }
  const NORM = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
  function route(a) {
    const s = byId(a.from);
    const t = byId(a.to);
    const p0 = anchor(s, a.fs);
    const p1 = anchor(t, a.ts);
    if (a.kind === "straight") return { pts: [p0, p1] };
    if (a.kind === "curve") {
      const k = Math.max(40, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2.4);
      const n0 = NORM[a.fs];
      const n1 = NORM[a.ts];
      return { pts: [p0, p1], curve: [[p0[0] + n0[0] * k, p0[1] + n0[1] * k], [p1[0] + n1[0] * k, p1[1] + n1[1] * k]] };
    }
    const h0 = a.fs === "l" || a.fs === "r";
    const h1 = a.ts === "l" || a.ts === "r";
    if (h0 && h1) {
      const mx = (p0[0] + p1[0]) / 2;
      return { pts: [p0, [mx, p0[1]], [mx, p1[1]], p1] };
    }
    if (!h0 && !h1) {
      const my = (p0[1] + p1[1]) / 2;
      return { pts: [p0, [p0[0], my], [p1[0], my], p1] };
    }
    return { pts: h0 ? [p0, [p1[0], p0[1]], p1] : [p0, [p0[0], p1[1]], p1] };
  }
  function midOf(r) {
    if (r.curve) return SK.bezier(r.pts[0], r.curve[0], r.curve[1], r.pts[1], 20)[10];
    const pts = SK.resample(r.pts, 4);
    return pts[Math.floor(pts.length / 2)];
  }

  function render() {
    svgBack.replaceChildren();
    svgFront.replaceChildren();
    htmlLayer.replaceChildren();
    const handFont = m => SK.MODES[m].hand;

    frames.forEach(f => {
      const m = board.style === "hand" ? plan : "precise";
      const g = SK.node("g", { transform: `translate(${f.x} ${f.y})` }, svgBack);
      SK.renderFrame(g, f, m, { level: board.level });
      const t = div("frame-title" + (handFont(m) ? " hand" : ""), f.title);
      place(t, f.x + 14, f.y - 26);
    });

    arrows.forEach(a => {
      const r = route(a);
      const m = modeOf(a);
      const g = SK.node("g", { "data-id": a.id, class: "arrow" + (selected === a.id ? " sel" : "") }, svgBack);
      const spec = { ...r, sw: a.sw || 2, stroke: a.stroke || (a.mind ? "var(--sk-frame)" : "var(--sk-ink)"), seed: (a.sketch && a.sketch.seed) || a.seed, dashed: a.dashed, animated: a.animated, heads: a.mind ? {} : { end: true } };
      SK.renderArrow(g, spec, m, { level: effLevel(a) });
      // 宽命中区
      const hit = SK.node("path", { d: (r.curve ? `M${r.pts[0]} C${r.curve[0]} ${r.curve[1]} ${r.pts[1]}` : "M" + r.pts.join(" L")), class: "hit" }, g);
      hit.addEventListener("pointerdown", e => { e.stopPropagation(); select(a.id); });
      if (a.label) {
        const [mx, my] = midOf(r);
        const l = div("arrow-label" + (handFont(m) ? " hand" : ""), a.label);
        place(l, mx, my);
        l.style.transform = "translate(-50%, -50%)";
      }
    });

    inks.forEach(ink => SK.renderInk(svgFront, ink));

    shapes.forEach(s => {
      const m = modeOf(s);
      const box = div("el" + (selected === s.id ? " sel" : "") + (s.mind ? " mind" : ""));
      box.dataset.id = s.id;
      place(box, s.x, s.y);
      box.style.width = s.w + "px";
      box.style.height = s.h + "px";
      const svg = SK.node("svg", { width: s.w, height: s.h, class: "shape" }, box);
      const sk = s.sketch || {};
      const fill = sk.fill && s.fill ? { ...s.fill, type: sk.fill } : sk.fill && sk.fill !== "none" ? { type: sk.fill, color: FILL.蓝 } : s.fill;
      SK.renderShape(svg, { ...s, fill: fill || { type: "none" }, stroke: s.stroke || "var(--sk-ink)", sw: s.sw || 2, seed: sk.seed || s.seed }, m, { level: effLevel(s) });
      if (s.text) {
        const t = div("label" + (handFont(m) ? " hand" : "") + (s.mind ? " small" : ""), s.text);
        if (s.textY) t.style.marginTop = s.textY + "px";
        if (s.stroke && s.text === "!") t.style.color = s.stroke;
        box.appendChild(t);
      }
      box.addEventListener("pointerdown", e => startDrag(e, s));
    });

    texts.forEach(t => {
      const m = modeOf(t);
      const box = div("el text" + (selected === t.id ? " sel" : "") + (handFont(m) ? " hand" : ""));
      box.dataset.id = t.id;
      box.innerText = t.text;
      place(box, t.x, t.y);
      box.style.width = t.w + "px";
      box.addEventListener("pointerdown", e => startDrag(e, t));
    });

    cards.forEach(c => {
      const box = div("el card");
      box.innerHTML = `<b>${c.title}</b><p>${c.body}</p><small>${c.meta}</small>`;
      place(box, c.x, c.y);
      box.style.width = c.w + "px";
      box.style.height = c.h + "px";
      box.addEventListener("pointerdown", e => startDrag(e, c));
    });

    renderAttrBar();
    renderStatus();
  }
  function div(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    if (text != null) d.textContent = text;
    htmlLayer.appendChild(d);
    return d;
  }
  function place(n, x, y) {
    n.style.left = x + "px";
    n.style.top = y + "px";
  }

  // ───────── 拖动 / 选择 ─────────
  function startDrag(e, el) {
    e.stopPropagation();
    closePops();
    select(el.id || null, true);
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = el.x;
    const oy = el.y;
    root.classList.add("dragging");
    let raf = 0;
    const move = ev => {
      el.x = ox + ev.clientX - sx;
      el.y = oy + ev.clientY - sy;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
    };
    const up = () => {
      root.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      render();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function select(id, silent) {
    selected = id;
    closePops();
    if (!silent) render();
  }
  root.addEventListener("pointerdown", e => {
    if (e.target.closest(".chrome")) return;
    select(null);
  });

  // ───────── 浮动属性条 ─────────
  const bar = document.getElementById("attrbar");
  const pop = document.getElementById("pop");
  let openPop = null;
  function closePops() {
    openPop = null;
    pop.hidden = true;
  }

  function renderAttrBar() {
    const el = selected && byId(selected);
    if (!el || root.classList.contains("dragging")) {
      bar.hidden = true;
      return;
    }
    const isArrow = !!el.from;
    const isText = !el.shape && !isArrow;
    bar.hidden = false;
    bar.innerHTML = "";
    const items = [];
    if (!isText) items.push(["stroke", `<i class="sw" style="background:${el.stroke || "var(--sk-ink)"}"></i>`, "描边"]);
    if (el.shape) items.push(["fill", `<i class="sw sq" style="background:${(el.fill && el.fill.color) || "transparent"}"></i>`, "填充"]);
    if (isArrow) items.push(["line", ICON.line, "线型"]);
    items.push(["sketch", ICON.pen + `<span class="tag">${effStyle(el) === "hand" ? SK.LEVELS[effLevel(el)].label : "普通"}</span>`, "笔触"]);
    items.forEach(([key, html, tip], i) => {
      if (i && key === "sketch") bar.appendChild(Object.assign(document.createElement("i"), { className: "gap" }));
      const b = document.createElement("button");
      b.className = "cbtn" + (openPop === key ? " on" : "") + (key === "sketch" ? " wide" : "");
      b.innerHTML = html;
      b.title = tip;
      b.onclick = e => { e.stopPropagation(); openPop === key ? closePops() : showPop(key, el, b); renderAttrBarOnly(); };
      bar.appendChild(b);
    });
    positionBar(el);
  }
  function renderAttrBarOnly() {
    bar.querySelectorAll(".cbtn").forEach(b => b.classList.toggle("on", b.title === POPNAME[openPop]));
  }
  const POPNAME = { stroke: "描边", fill: "填充", line: "线型", sketch: "笔触" };
  function bboxOf(el) {
    if (el.from) {
      const r = route(el);
      const xs = r.pts.map(p => p[0]);
      const ys = r.pts.map(p => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    const n = htmlLayer.querySelector(`[data-id="${el.id}"]`) || null;
    return { x: el.x, y: el.y, w: el.w, h: n ? n.offsetHeight : el.h || 60 };
  }
  /** 属性条浮在元素上方；连同弹层（need）贴不下时翻到元素下方，弹层随之向下 */
  let barBelow = false;
  function positionBar(el, need = 0) {
    const b = bboxOf(el);
    const wr = world.getBoundingClientRect();
    const cr = root.getBoundingClientRect();
    const cx = wr.left - cr.left + b.x + b.w / 2;
    let top = wr.top - cr.top + b.y - 52;
    barBelow = top - need < 56;
    if (barBelow) top = wr.top - cr.top + b.y + b.h + 14;
    bar.style.left = cx + "px";
    bar.style.top = top + "px";
  }

  function showPop(key, el, anchorBtn) {
    openPop = key;
    pop.hidden = false;
    pop.innerHTML = "";
    const upd = () => { render(); showPop(key, el, bar.querySelector(`[title="${POPNAME[key]}"]`)); };
    if (key === "stroke") {
      pop.appendChild(field("描边", swatches(STROKE, el.stroke || "var(--sk-ink)", v => { el.stroke = v; upd(); })));
    } else if (key === "fill") {
      pop.appendChild(field("填充色", swatches({ 无: "transparent", ...FILL }, (el.fill && el.fill.color) || "transparent", v => {
        if (v === "transparent") el.fill = { type: "none" };
        else el.fill = { type: (el.fill && el.fill.type !== "none" && el.fill.type) || "wash", color: v };
        upd();
      })));
    } else if (key === "line") {
      pop.appendChild(field("线型", tiles([["straight", "直线"], ["elbow", "折线"], ["curve", "曲线"]], el.kind, v => { el.kind = v; upd(); })));
      pop.appendChild(field("虚线", tiles([["0", "实线"], ["1", "虚线"]], el.dashed ? "1" : "0", v => { el.dashed = v === "1"; upd(); })));
      pop.appendChild(field("流动", tiles([["0", "关"], ["1", "开"]], el.animated ? "1" : "0", v => { el.animated = v === "1"; upd(); })));
    } else {
      sketchPop(el, upd);
    }
    positionBar(el, pop.offsetHeight + 8);
    const btn = bar.querySelector(`[title="${POPNAME[key]}"]`) || anchorBtn;
    const br = btn.getBoundingClientRect();
    const cr = root.getBoundingClientRect();
    pop.style.left = Math.max(12, br.left - cr.left + br.width / 2 - 150) + "px";
    pop.style.top = barBelow ? br.bottom - cr.top + 10 + "px" : "";
    pop.style.bottom = barBelow ? "" : cr.bottom - br.top + 10 + "px";
  }

  /** 新「笔触」弹层：画风（跟随页面 / 手绘 / 普通）· 笔触三档 · 填充五种 · 换一笔 */
  function sketchPop(el, upd) {
    el.sketch = el.sketch || {};
    const sk = el.sketch;
    const styleVal = sk.style || "inherit";
    const boardLabel = board.style === "hand" ? "手绘" : "普通";
    pop.appendChild(field("画风", tiles([["inherit", `跟随页面<small>${boardLabel}</small>`], ["hand", "手绘"], ["precise", "普通"]], styleVal, v => { sk.style = v === "inherit" ? undefined : v; upd(); }, (v) => {
      const m = v === "precise" ? "precise" : v === "hand" ? plan : board.style === "hand" ? plan : "precise";
      return SK.glyph(m, { fill: { type: "wash", color: FILL.蓝 } }, { level: effLevel(el) });
    })));
    if (effStyle(el) === "hand") {
      pop.appendChild(field("笔触", tiles(Object.entries(SK.LEVELS).map(([k, l]) => [k, l.label]), effLevel(el), v => { sk.level = v; upd(); }, v =>
        SK.glyph(plan, { fill: { type: "none" } }, { level: v })
      ), sk.level ? "" : `<em>跟随页面</em>`));
      if (el.shape) {
        const cur = (sk.fill) || (el.fill && el.fill.type) || "none";
        pop.appendChild(field("填充", tiles(Object.entries(SK.FILLS), cur, v => {
          sk.fill = undefined;
          el.fill = v === "none" ? { type: "none", color: el.fill && el.fill.color } : { type: v, color: (el.fill && el.fill.color) || FILL.蓝 };
          upd();
        }, v => SK.glyph(plan, { fill: { type: v, color: (el.fill && el.fill.color) || FILL.蓝 } }, { level: effLevel(el) })), "", true));
      }
      const row = document.createElement("div");
      row.className = "poprow";
      const b = document.createElement("button");
      b.className = "btn";
      b.innerHTML = ICON.dice + "换一笔";
      b.onclick = e => { e.stopPropagation(); sk.seed = Math.floor(Math.random() * 99999) + 1; upd(); };
      row.appendChild(b);
      row.insertAdjacentHTML("beforeend", `<span class="hint">笔迹随机但固定，存进元素；拖动、缩放不会重抖</span>`);
      pop.appendChild(row);
    } else {
      pop.insertAdjacentHTML("beforeend", `<p class="hint pad">普通模式下按原样渲染：直线、实色填充（保留透明度）、正文字体。</p>`);
    }
  }

  function field(label, content, extra = "", five) {
    const f = document.createElement("div");
    f.className = "field" + (five ? " five" : "");
    f.innerHTML = `<label>${label}${extra}</label>`;
    f.appendChild(content);
    return f;
  }
  function tiles(opts, value, onPick, glyphFn) {
    const g = document.createElement("div");
    g.className = "tiles";
    opts.forEach(([v, label]) => {
      const b = document.createElement("button");
      b.className = "tile" + (v === value ? " on" : "");
      if (glyphFn) b.appendChild(glyphFn(v));
      b.insertAdjacentHTML("beforeend", `<span>${label}</span>`);
      b.onclick = e => { e.stopPropagation(); onPick(v); };
      g.appendChild(b);
    });
    return g;
  }
  function swatches(map, value, onPick) {
    const g = document.createElement("div");
    g.className = "swatches";
    Object.entries(map).forEach(([name, v]) => {
      const b = document.createElement("button");
      b.className = "swb" + (v === value ? " on" : "") + (v === "transparent" ? " none" : "");
      b.title = name;
      b.innerHTML = `<i style="background:${v}"></i>`;
      b.onclick = e => { e.stopPropagation(); onPick(v); };
      g.appendChild(b);
    });
    return g;
  }
  pop.addEventListener("pointerdown", e => e.stopPropagation());
  bar.addEventListener("pointerdown", e => e.stopPropagation());

  // ───────── 状态栏：白板级画风 ─────────
  const status = document.getElementById("status");
  const menu = document.getElementById("stylemenu");
  function renderStatus() {
    status.querySelector("[data-k=style]").innerHTML = ICON.pen + (board.style === "hand" ? "手绘 · " + SK.LEVELS[board.level].label : "普通");
  }
  status.querySelector("[data-k=style]").onclick = e => {
    e.stopPropagation();
    if (!menu.hidden) return (menu.hidden = true);
    menu.hidden = false;
    menu.innerHTML = `
      <div class="mh">白板画风</div>
      ${[["hand", "手绘", "形状、连线、画框、文本一起变手绘"], ["precise", "普通", "直线与正文字体，适合正式图表"]].map(([k, l, d]) => `<button class="mi${board.style === k ? " on" : ""}" data-style="${k}"><b>${l}</b><small>${d}</small>${board.style === k ? ICON.check : ""}</button>`).join("")}
      <div class="sep"></div>
      <div class="mh">默认笔触</div>
      ${Object.entries(SK.LEVELS).map(([k, l]) => `<button class="mi${board.level === k ? " on" : ""}${board.style !== "hand" ? " dis" : ""}" data-level="${k}"><b>${l.label}</b>${board.level === k ? ICON.check : ""}</button>`).join("")}
      <div class="foot">单独设过画风/笔触的元素不受影响</div>`;
    menu.querySelectorAll("[data-style]").forEach(b => b.onclick = () => { board.style = b.dataset.style; menu.hidden = true; render(); });
    menu.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { if (board.style !== "hand") return; board.level = b.dataset.level; menu.hidden = true; render(); });
  };
  menu.addEventListener("pointerdown", e => e.stopPropagation());
  document.addEventListener("pointerdown", () => (menu.hidden = true));

  // ───────── 演示条 ─────────
  document.querySelectorAll("[data-plan]").forEach(b => {
    b.classList.toggle("on", b.dataset.plan === plan);
    b.onclick = () => {
      plan = b.dataset.plan;
      document.querySelectorAll("[data-plan]").forEach(c => c.classList.toggle("on", c === b));
      history.replaceState(null, "", "?plan=" + plan);
      closePops();
      render();
    };
  });
  document.getElementById("theme").onclick = e => {
    const r = document.documentElement;
    const dark = r.dataset.theme === "cream";
    r.dataset.theme = dark ? "cocoa" : "cream";
    e.currentTarget.textContent = dark ? "☀ cream" : "☾ cocoa";
  };

  const ICON = {
    pen: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c2.5-.6 4-1.6 5-3l9.5-9.5a2.1 2.1 0 0 0-3-3L6 14c-1.4 1-2.4 2.5-3 5"/><path d="M13.5 6.5l3 3"/><path d="M14 20c1.5-1 3-1 4.5 0s2.5.6 3.5-.5" opacity=".6"/></svg>`,
    line: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18c5 0 4-12 10-12h6"/><path d="M17 3l3 3-3 3"/></svg>`,
    dice: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>`,
    check: `<svg class="ck" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  };

  render();
  if (document.fonts) document.fonts.ready.then(render);
  window.SKB = { select: id => { selected = id; render(); const el = byId(id); const btn = bar.querySelector('[title="笔触"]'); if (btn) { showPop("sketch", el, btn); renderAttrBarOnly(); } }, board, render };
})();
