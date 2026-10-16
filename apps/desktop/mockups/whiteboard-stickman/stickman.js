/*
  白板火柴人 mockup · 渲染引擎。墨水算法与 whiteboard-sketch 方案 B 同源（perfect-freehand + 低频摆动 + 固定 seed）。
  墨色一律 currentColor、填充一律 CSS 变量，所以同一份 SVG 在深浅主题下自动换色。视觉参考，非导出源（D-001）。
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const HAND_FONT =
    '"Hannotate SC", "HanziPen SC", "Kaiti SC", "STKaiti", "华文楷体", "KaiTi", cursive';
  const SANS_FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

  const LEVELS = {
    neat: { label: "工整", amp: 0.45, jit: 0.5 },
    natural: { label: "自然", amp: 1.0, jit: 1.2 },
    loose: { label: "潦草", amp: 1.8, jit: 2.2 },
  };
  const BODIES = {
    a: { label: "A · 经典", limb: 3, spine: 3, prop: 2.4 },
    b: { label: "B · 豆豆", limb: 3, spine: 2.6, prop: 2.4 },
    c: { label: "C · 象形", limb: 8, spine: 11, prop: 3 },
  };
  const PAPER = "var(--fig-paper)";

  // ───────── 基础工具 ─────────
  function node(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const f2 = n => Math.round(n * 100) / 100;
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const polyD = pts => "M" + pts.map(p => f2(p[0]) + " " + f2(p[1])).join(" L");

  function resample(pts, step) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(L / step));
    const out = [];
    let j = 1;
    for (let k = 0; k <= n; k++) {
      const s = (L * k) / n;
      while (j < cum.length - 1 && cum[j] < s) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      out.push(lerp(pts[j - 1], pts[j], (s - cum[j - 1]) / seg));
    }
    return out;
  }
  /** 沿法线方向的低频摆动；人物尺寸小，波长比形状引擎短一档 */
  function wobble(pts, amp, rand) {
    if (amp <= 0) return pts.map(p => p.slice());
    const k1 = (Math.PI * 2) / (60 + rand() * 50);
    const k2 = (Math.PI * 2) / (18 + rand() * 12);
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    let s = 0;
    return pts.map((p, i) => {
      if (i > 0) s += dist(pts[i - 1], p);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const off = amp * (0.72 * Math.sin(s * k1 + p1) + 0.28 * Math.sin(s * k2 + p2));
      return [p[0] - ((b[1] - a[1]) / len) * off, p[1] + ((b[0] - a[0]) / len) * off];
    });
  }
  function outlineToD(pts) {
    if (pts.length < 3) return "";
    let d = `M${f2(pts[0][0])} ${f2(pts[0][1])} Q`;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      d += ` ${f2(x0)} ${f2(y0)} ${f2((x0 + x1) / 2)} ${f2((y0 + y1) / 2)}`;
    }
    return d + " Z";
  }
  /** 一笔墨迹：起笔略重、行笔饱满、收笔变细 */
  function inkD(pts, size, rand, o = {}) {
    const n = pts.length;
    const input = pts.map((p, i) => {
      const t = i / Math.max(1, n - 1);
      const pr =
        0.62 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.22 * t + (rand() - 0.5) * 0.05;
      return [p[0], p[1], clamp(pr, 0.2, 1)];
    });
    return outlineToD(
      PF.getStroke(input, {
        size,
        thinning: o.thinning ?? 0.5,
        smoothing: 0.55,
        streamline: 0.2,
        simulatePressure: false,
        start: { taper: o.taperStart ?? size * 1.2, cap: true },
        end: { taper: o.taperEnd ?? size * 3, cap: true },
        last: true,
      })
    );
  }

  // ───────── 几何 ─────────
  function circlePts(c, r, n = 40) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
    return out;
  }
  function capsulePts(a, b, r) {
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const out = [];
    for (let i = 0; i <= 14; i++) {
      const t = th - Math.PI / 2 + (Math.PI * i) / 14;
      out.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]);
    }
    for (let i = 0; i <= 14; i++) {
      const t = th + Math.PI / 2 + (Math.PI * i) / 14;
      out.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]);
    }
    return out;
  }
  const rectPts = (x, y, w, h) => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  /** 脊柱的单位法线，朝 toward 所在的一侧（豆豆形体的肩、胯定位） */
  function sideNormal(axisA, axisB, origin, toward) {
    const dx = axisB[0] - axisA[0];
    const dy = axisB[1] - axisA[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const side = (toward[0] - origin[0]) * nx + (toward[1] - origin[1]) * ny >= 0 ? 1 : -1;
    return [nx * side, ny * side];
  }

  // ───────── 姿态 → 笔画 ─────────
  // 笔画：{ open, pts, w, fill }，fill 为 CSS 颜色或 "ink"（实心墨）；文字：{ text, x, y, s, size }
  function tintOf(opts, i, kind) {
    if (opts.tint !== "color") return "var(--fig-mono)";
    if (kind === "warn") return "var(--fig-warn)";
    return `var(--fig-t${i % 5})`;
  }
  function personStrokes(P, body, opts, idx) {
    // 豆豆躯干占位大，部分姿态需要单独的关节坐标（P.b 覆盖）
    if (body === "b" && P.b) P = { ...P, ...P.b };
    const cfg = BODIES[body];
    const s = lerp(P.n, P.p, 0.18);
    const limb = (from, seg) => ({ open: true, pts: [from, ...seg], w: cfg.limb });
    const out = [];
    if (body === "a") {
      out.push(limb(P.p, P.ll), limb(P.p, P.rl), { open: true, pts: [P.n, P.p], w: cfg.spine });
      out.push(limb(s, P.la), limb(s, P.ra));
      out.push({ open: false, pts: circlePts(P.h, P.r || 13), w: cfg.spine, fill: PAPER });
    } else if (body === "b") {
      const len = dist(P.n, P.p);
      const top = lerp(P.n, P.p, 11 / len);
      const bottom = lerp(P.n, P.p, (len - 6) / len);
      const add = (pt, v, d) => [pt[0] + v[0] * d, pt[1] + v[1] * d];
      const leg = seg => limb(add(P.p, sideNormal(P.n, P.p, P.p, seg[0]), 5), seg);
      // 手臂起点藏在躯干内、先于躯干绘制，接缝由躯干轮廓盖住；肘、手外推，避免贴着身体轮廓走
      const arm = ([elbow, hand]) => {
        const v = sideNormal(P.n, P.p, top, elbow);
        return limb(add(top, v, 4), [add(elbow, v, 8), add(hand, v, 5)]);
      };
      const fill = tintOf(opts, idx);
      out.push(leg(P.ll), leg(P.rl), arm(P.la), arm(P.ra));
      out.push({ open: false, pts: capsulePts(top, bottom, 12), w: cfg.spine, fill });
      out.push({ open: false, pts: circlePts(P.h, 14), w: cfg.spine, fill });
    } else {
      const len = dist(P.h, P.n);
      const head = lerp(P.n, P.h, (len + 3) / len);
      const neck = lerp(P.n, P.p, 7 / dist(P.n, P.p));
      out.push(limb(P.p, P.ll), limb(P.p, P.rl), { open: true, pts: [neck, P.p], w: cfg.spine });
      out.push(limb(s, P.la), limb(s, P.ra));
      out.push({ open: false, pts: circlePts(head, 11), fill: "ink" });
    }
    return out;
  }
  function propStroke(pr, body, opts) {
    const w = BODIES[body].prop;
    const fill =
      pr.fill === "paper"
        ? PAPER
        : typeof pr.fill === "number"
          ? tintOf(opts, pr.fill)
          : pr.fill
            ? tintOf(opts, 0, pr.fill)
            : null;
    switch (pr.t) {
      case "line":
        return { open: true, pts: pr.pts, w };
      case "poly":
        return { open: false, pts: pr.pts, w, fill };
      case "rect":
        return { open: false, pts: rectPts(pr.x, pr.y, pr.w, pr.h), w, fill };
      case "circle":
        return { open: false, pts: circlePts(pr.c, pr.r, 32), w, fill };
      case "dot":
        return { open: false, pts: circlePts(pr.c, pr.r, 12), fill: "ink" };
      case "text":
        return { text: true, ...pr };
    }
  }
  function poseStrokes(pose, opts) {
    const props = pose.props || [];
    const back = props.filter(p => p.z !== "front" && p.t !== "text");
    const front = props.filter(p => p.z === "front" && p.t !== "text");
    const texts = props.filter(p => p.t === "text");
    return [
      ...back.map(p => propStroke(p, opts.body, opts)),
      ...pose.people.flatMap((P, i) =>
        personStrokes(P, opts.body, opts, (opts.tintOffset || 0) + i)
      ),
      ...front.map(p => propStroke(p, opts.body, opts)),
      ...texts.map(p => propStroke(p, opts.body, opts)),
    ];
  }

  // ───────── 笔画 → SVG ─────────
  function drawText(g, st, hand, rand) {
    const size = hand ? st.size * 1.15 : st.size;
    const rot = hand ? f2((rand() - 0.5) * 8) : 0;
    const t = node(
      "text",
      {
        x: st.x,
        y: st.y,
        "text-anchor": st.anchor || "middle",
        "dominant-baseline": "middle",
        fill: "currentColor",
        "font-size": size,
        "font-weight": hand ? 400 : 500,
        transform: rot ? `rotate(${rot} ${st.x} ${st.y})` : null,
        style: `font-family:${hand ? HAND_FONT : SANS_FONT}`,
      },
      g
    );
    t.textContent = st.s;
  }
  function drawPrecise(g, st) {
    if (st.open) {
      node(
        "path",
        {
          d: polyD(st.pts),
          fill: "none",
          stroke: "currentColor",
          "stroke-width": st.w,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        g
      );
      return;
    }
    const solid = st.fill === "ink";
    node(
      "path",
      {
        d: polyD(st.pts) + " Z",
        fill: solid ? "currentColor" : st.fill ? null : "none",
        style: st.fill && !solid ? `fill:${st.fill}` : null,
        stroke: st.w ? "currentColor" : null,
        "stroke-width": st.w,
        "stroke-linejoin": "round",
      },
      g
    );
  }
  /** 闭合图形一笔绕一圈，收尾稍微搭过起点并向外飘 */
  function loopStroke(pts, amp, rand) {
    const base = resample([...pts, pts[0]], 2.5);
    base.pop();
    const n = base.length;
    const start = Math.floor(rand() * n);
    const ring = base.slice(start).concat(base.slice(0, start));
    const cx = ring.reduce((s, q) => s + q[0], 0) / n;
    const cy = ring.reduce((s, q) => s + q[1], 0) / n;
    const overlapN = Math.max(3, Math.round(n * 0.12));
    const drift = 1 + amp;
    const tail = ring.slice(0, overlapN).map((p, i) => {
      const d = Math.hypot(p[0] - cx, p[1] - cy) || 1;
      const k = (i / overlapN) * drift;
      return [p[0] + ((p[0] - cx) / d) * k, p[1] + ((p[1] - cy) / d) * k];
    });
    return wobble(ring.concat([ring[0]], tail), amp * 0.7, rand);
  }
  function inkOpts(w) {
    return w >= 6
      ? { thinning: 0.22, taperStart: w * 0.3, taperEnd: w * 0.8 }
      : { taperStart: w * 1.2, taperEnd: w * 3 };
  }
  function drawHand(g, st, lv, rand) {
    if (st.open) {
      const jittered = st.pts.map(p => [
        p[0] + (rand() - 0.5) * 2 * lv.jit,
        p[1] + (rand() - 0.5) * 2 * lv.jit,
      ]);
      const pts = wobble(resample(jittered, 2.5), lv.amp, rand);
      node(
        "path",
        { d: inkD(pts, st.w * 1.2 + 0.6, rand, inkOpts(st.w)), fill: "currentColor" },
        g
      );
      return;
    }
    const ring = resample([...st.pts, st.pts[0]], 2.5);
    if (st.fill === "ink") {
      node("path", { d: polyD(wobble(ring, lv.amp * 0.5, rand)) + " Z", fill: "currentColor" }, g);
      return;
    }
    if (st.fill) {
      // 有色填充错位半笔，像马克笔涂得不太准；纸色填充只负责遮挡，不错位
      const off =
        st.fill === PAPER ? [0, 0] : [(rand() - 0.2) * 2 * lv.jit, (rand() - 0.2) * 2 * lv.jit];
      const pts = wobble(ring, lv.amp * 0.6, rand).map(p => [p[0] + off[0], p[1] + off[1]]);
      node("path", { d: polyD(pts) + " Z", style: `fill:${st.fill}` }, g);
    }
    if (st.w)
      node(
        "path",
        { d: inkD(loopStroke(st.pts, lv.amp, rand), st.w * 1.2 + 0.6, rand), fill: "currentColor" },
        g
      );
  }
  function drawStrokes(g, strokes, opts, rand) {
    const lv = LEVELS[opts.level];
    for (const st of strokes) {
      if (st.text) drawText(g, st, opts.hand, rand);
      else if (opts.hand) drawHand(g, st, lv, rand);
      else drawPrecise(g, st);
    }
  }
  function seedOf(key, opts) {
    return hash(key) ^ ((opts.salt || 0) * 2654435761);
  }

  /** 把一个姿态画进已有的 <g>，供整板示例拼装 */
  function drawPose(g, pose, opts) {
    drawStrokes(g, poseStrokes(pose, opts), opts, rng(seedOf(pose.key, opts)));
  }
  function renderFigure(pose, opts, scale = 1) {
    const svg = node("svg", {
      xmlns: NS,
      viewBox: `-6 -6 ${pose.w + 12} ${pose.h + 12}`,
      width: f2((pose.w + 12) * scale),
      height: f2((pose.h + 12) * scale),
      class: "fig",
    });
    drawPose(svg, pose, opts);
    return svg;
  }

  // ───────── 箭头与示意图图元 ─────────
  function arrowStrokes(a, b, bend, w = 2.2) {
    const mid = lerp(a, b, 0.5);
    const len = dist(a, b) || 1;
    const ctrl = [mid[0] - ((b[1] - a[1]) / len) * bend, mid[1] + ((b[0] - a[0]) / len) * bend];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push([
        (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * b[0],
        (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * b[1],
      ]);
    }
    const tip = pts[pts.length - 1];
    const ref = pts[pts.length - 4];
    const ang = Math.atan2(tip[1] - ref[1], tip[0] - ref[0]);
    const wing = s => [tip[0] - Math.cos(ang + s) * 11, tip[1] - Math.sin(ang + s) * 11];
    return [
      { open: true, pts, w },
      { open: true, pts: [wing(0.45), tip], w },
      { open: true, pts: [wing(-0.45), tip], w },
    ];
  }

  window.STICK = {
    HAND_FONT,
    LEVELS,
    BODIES,
    node,
    rng,
    hash,
    rectPts,
    renderFigure,
    drawPose,
    drawStrokes,
    arrowStrokes,
  };
})();
