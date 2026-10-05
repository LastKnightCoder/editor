/*
  白板手绘风格 mockup · 渲染引擎（现状 / A 纸笔 / B 墨水 / C 铅笔 / 普通）。
  rough.js 与 perfect-freehand 取自项目同版本依赖（vendor/），保证效果可落地。
  视觉参考，非导出源（D-001）。
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const gen = rough.generator();
  let uid = 0;

  const HAND_FONT = '"Hannotate SC", "HanziPen SC", "Kaiti SC", "STKaiti", "华文楷体", "KaiTi", cursive';

  /** 笔触三档：rough 参数（A / 现状）与抖动幅度（B / C）一一对应 */
  const LEVELS = {
    neat: { label: "工整", rough: 0.5, bow: 0.5, amp: 0.55 },
    natural: { label: "自然", rough: 1.0, bow: 1.0, amp: 1.3 },
    loose: { label: "潦草", rough: 2.0, bow: 1.8, amp: 2.6 },
  };
  const FILLS = {
    none: "无",
    wash: "淡涂",
    hatch: "斜线",
    cross: "交叉",
    scribble: "涂鸦",
  };
  const MODES = {
    precise: { label: "普通", hand: false },
    current: { label: "现状", hand: false },
    a: { label: "A · 纸笔", hand: true },
    b: { label: "B · 墨水", hand: true },
    c: { label: "C · 铅笔", hand: true },
  };

  // ───────── 基础工具 ─────────
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const f2 = n => Math.round(n * 100) / 100;
  function node(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

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
      const a = pts[j - 1];
      const b = pts[j];
      const seg = cum[j] - cum[j - 1] || 1;
      const t = (s - cum[j - 1]) / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }
  function lengthOf(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }
  const polyD = pts => "M" + pts.map(p => f2(p[0]) + " " + f2(p[1])).join(" L");

  /** 沿法线方向加低频摆动：两段正弦叠加，形状随弧长连续变化，端点移动时不会整体跳变 */
  function wobble(pts, amp, rand) {
    if (amp <= 0) return pts.map(p => p.slice());
    const k1 = (Math.PI * 2) / (110 + rand() * 90);
    const k2 = (Math.PI * 2) / (28 + rand() * 18);
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    let s = 0;
    return pts.map((p, i) => {
      if (i > 0) s += dist(pts[i - 1], p);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = amp * (0.72 * Math.sin(s * k1 + p1) + 0.28 * Math.sin(s * k2 + p2));
      return [p[0] - (dy / len) * off, p[1] + (dx / len) * off];
    });
  }

  // ───────── 形状轮廓（局部坐标） ─────────
  const HEART =
    "M 0.50 0.12 C 0.54 0.07 0.61 0.03 0.70 0.03 C 0.84 0.03 0.97 0.14 0.97 0.30 C 0.97 0.50 0.84 0.73 0.62 0.88 C 0.57 0.92 0.53 0.95 0.50 0.95 C 0.47 0.95 0.43 0.92 0.38 0.88 C 0.16 0.73 0.03 0.50 0.03 0.30 C 0.03 0.14 0.16 0.03 0.30 0.03 C 0.39 0.03 0.46 0.07 0.50 0.12 Z";
  let heartUnit = null;
  function heartPoints() {
    if (heartUnit) return heartUnit;
    const svg = node("svg", { width: 0, height: 0, style: "position:absolute" }, document.body);
    const p = node("path", { d: HEART }, svg);
    const L = p.getTotalLength();
    heartUnit = [];
    for (let i = 0; i <= 160; i++) {
      const q = p.getPointAtLength((L * i) / 160);
      heartUnit.push([q.x, q.y]);
    }
    svg.remove();
    return heartUnit;
  }

  function outline(shape, w, h) {
    switch (shape.kind) {
      case "rect": {
        const r = Math.min(shape.radius || 0, w / 2, h / 2);
        if (!r)
          return [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
            [0, 0],
          ];
        const pts = [];
        const arc = (cx, cy, a0) => {
          for (let i = 0; i <= 8; i++) {
            const a = a0 + (Math.PI / 2) * (i / 8);
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
          }
        };
        arc(w - r, r, -Math.PI / 2);
        arc(w - r, h - r, 0);
        arc(r, h - r, Math.PI / 2);
        arc(r, r, Math.PI);
        pts.push(pts[0].slice());
        return pts;
      }
      case "ellipse": {
        const pts = [];
        for (let i = 0; i <= 72; i++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * i) / 72;
          pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
        }
        return pts;
      }
      case "triangle":
        return [
          [0, 0],
          [w, 0],
          [w / 2, h],
          [0, 0],
        ];
      case "heart":
        return heartPoints().map(([x, y]) => [x * w, y * h]);
    }
  }
  /** 直边形状按边拆笔（铅笔方案的「出头」需要） */
  function sides(shape, w, h) {
    if (shape.kind === "rect" && !shape.radius)
      return [
        [[0, 0], [w, 0]],
        [[w, 0], [w, h]],
        [[w, h], [0, h]],
        [[0, h], [0, 0]],
      ];
    if (shape.kind === "triangle")
      return [
        [[0, 0], [w, 0]],
        [[w, 0], [w / 2, h]],
        [[w / 2, h], [0, 0]],
      ];
    return null;
  }
  function preciseD(shape, w, h) {
    if (shape.kind === "rect") {
      const r = Math.min(shape.radius || 0, w / 2, h / 2);
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    if (shape.kind === "ellipse")
      return `M${w} ${h / 2} A${w / 2} ${h / 2} 0 1 0 0 ${h / 2} A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} Z`;
    return polyD(outline(shape, w, h)) + " Z";
  }

  // ───────── 墨水（perfect-freehand） ─────────
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
  /** 一笔墨迹：起笔略重、行笔饱满、收笔变细；压力曲线带极小噪声 */
  function inkD(pts, size, rand, o = {}) {
    const n = pts.length;
    const input = pts.map((p, i) => {
      const t = i / Math.max(1, n - 1);
      const pr = 0.62 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.22 * t + (rand() - 0.5) * 0.05;
      return [p[0], p[1], clamp(pr, 0.2, 1)];
    });
    const out = PF.getStroke(input, {
      size,
      thinning: o.thinning ?? 0.5,
      smoothing: 0.55,
      streamline: o.streamline ?? 0.22,
      simulatePressure: false,
      start: { taper: o.taperStart ?? size * 1.5, cap: true },
      end: { taper: o.taperEnd ?? size * 4, cap: true },
      last: true,
    });
    return outlineToD(out);
  }
  function inkPath(parent, pts, size, color, rand, o) {
    return node("path", { d: inkD(pts, size, rand, o), fill: color, class: o && o.cls }, parent);
  }

  // ───────── 闭合描边：一笔绕一圈 + 收尾搭接 ─────────
  function loopStroke(loopPts, amp, rand, overlapRatio) {
    const base = resample(loopPts, 3);
    base.pop();
    const n = base.length;
    const start = Math.floor(rand() * n);
    const ring = base.slice(start).concat(base.slice(0, start));
    const L = lengthOf(ring);
    const overlapN = Math.max(4, Math.round((n * Math.max(12, L * overlapRatio)) / L));
    const drift = 1.5 + amp;
    const tail = ring.slice(0, overlapN).map((p, i) => {
      const cx = ring.reduce((s, q) => s + q[0], 0) / n;
      const cy = ring.reduce((s, q) => s + q[1], 0) / n;
      const k = (i / overlapN) * drift;
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const d = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / d) * k, p[1] + (dy / d) * k];
    });
    return wobble(ring.concat([ring[0]], tail), amp, rand);
  }

  // ───────── 填充 ─────────
  function hatchLines(w, h, gap, angleDeg, rand, jitter) {
    const a = (angleDeg * Math.PI) / 180;
    const dir = [Math.cos(a), Math.sin(a)];
    const nor = [-dir[1], dir[0]];
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(w, h) / 2 + 4;
    const lines = [];
    for (let o = -R + gap / 2; o <= R; o += gap) {
      const jo = o + (rand() - 0.5) * jitter;
      const c = [cx + nor[0] * jo, cy + nor[1] * jo];
      lines.push([
        [c[0] - dir[0] * R, c[1] - dir[1] * R],
        [c[0] + dir[0] * R, c[1] + dir[1] * R],
      ]);
    }
    return lines;
  }
  function scribblePath(w, h, gap, angleDeg, rand) {
    const lines = hatchLines(w, h, gap, angleDeg, rand, gap * 0.25);
    const pts = [];
    lines.forEach((ln, i) => {
      const [p, q] = i % 2 ? [ln[1], ln[0]] : ln;
      pts.push(p, q);
    });
    return pts;
  }
  function clipFor(parent, d) {
    const id = "skc" + ++uid;
    const cp = node("clipPath", { id }, parent);
    node("path", { d }, cp);
    return `url(#${id})`;
  }
  const hatchGap = (sw, w, h) => clamp(3.5 + sw * 2.4, 5, 14) * clamp(Math.min(w, h) / 90, 0.8, 1.15);

  // ───────── 形状渲染 ─────────
  /**
   * el: { shape:{kind,radius}, w, h, stroke, sw, fill:{type,color}, seed }
   * mode: precise | current | a | b | c；opts: { level }
   */
  function renderShape(g, el, mode, opts = {}) {
    const { w, h, sw = 2, stroke = "var(--sk-ink)", fill = { type: "none" } } = el;
    const level = LEVELS[opts.level || "natural"];
    const seed = el.seed || 7;
    const hasFill = fill.type !== "none";

    if (mode === "precise") {
      node(
        "path",
        {
          d: preciseD(el.shape, w, h),
          fill: hasFill ? fill.color : "none",
          "fill-opacity": hasFill ? 0.42 : null,
          stroke,
          "stroke-width": sw,
          "stroke-linejoin": "round",
        },
        g
      );
      return;
    }

    if (mode === "current" || mode === "a") {
      const cur = mode === "current";
      const styleMap = { wash: "solid", hatch: "hachure", cross: "cross-hatch", scribble: "zigzag" };
      const o = cur
        ? {
            stroke,
            strokeWidth: sw,
            roughness: level.rough,
            seed,
            fill: hasFill ? fill.color : undefined,
            fillStyle: hasFill ? styleMap[fill.type] : undefined,
            hachureAngle: 0,
            hachureGap: 8,
            fillWeight: 1,
          }
        : {
            stroke,
            strokeWidth: sw,
            roughness: level.rough,
            bowing: level.bow,
            seed,
            preserveVertices: true,
            disableMultiStroke: opts.level !== "loose",
            disableMultiStrokeFill: true,
            fill: hasFill ? fill.color : undefined,
            fillStyle: hasFill ? styleMap[fill.type] : undefined,
            hachureAngle: -41,
            hachureGap: hatchGap(sw, w, h),
            fillWeight: Math.max(1, sw * 0.55),
            zigzagOffset: hatchGap(sw, w, h) * 0.6,
          };
      let drawable;
      const { kind, radius } = el.shape;
      if (kind === "rect" && !radius) drawable = gen.rectangle(0, 0, w, h, o);
      else if (kind === "ellipse") drawable = gen.ellipse(w / 2, h / 2, w, h, o);
      else if (kind === "rect" && cur) {
        const r = radius;
        drawable = gen.path(
          `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0 Z`,
          o
        );
      } else if (cur && kind === "heart") {
        drawable = gen.path(heartPoints().map(([x, y]) => [x * w, y * h]).reduce((d, p, i) => d + (i ? " L" : "M") + p[0] + " " + p[1], ""), o);
      } else {
        // 新方案：圆角 / 心形 / 三角走同一份采样轮廓，rough 只负责抖动，不再喂 Q 曲线
        const pts = resample(outline(el.shape, w, h), 10);
        pts.pop();
        drawable = gen.polygon(pts, o);
      }
      const washFirst = mode === "a" && fill.type === "wash";
      for (const p of gen.toPaths(drawable)) {
        const isFill = p.fill && p.fill !== "none" && p.stroke === "none";
        const isFillLines = !isFill && p.stroke !== stroke;
        const attrs = {
          d: p.d,
          fill: p.fill || "none",
          stroke: p.stroke,
          "stroke-width": p.strokeWidth,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        };
        if (washFirst && isFill) attrs["fill-opacity"] = 0.5;
        if (!cur && isFillLines) attrs["stroke-opacity"] = 0.85;
        node("path", attrs, g);
      }
      return;
    }

    // B / C：自绘轮廓 + 填充
    const rand = rng(seed);
    const base = outline(el.shape, w, h);
    const clip = hasFill && !(mode === "b" && fill.type === "wash") ? clipFor(g, polyD(base) + " Z") : null;
    const gap = hatchGap(sw, w, h);

    if (hasFill) {
      const fg = node("g", { "clip-path": clip, class: fill.type === "wash" ? null : "sk-lines" }, g);
      const fr = rng(seed * 31 + 3);
      if (fill.type === "wash") {
        if (mode === "b") {
          // 马克笔淡涂：轮廓外扩抖动 + 套色错位，multiply 叠在纸上
          const wp = wobble(resample(base, 4), 2.6 + level.amp, fr);
          node("path", { d: polyD(wp) + " Z", fill: fill.color, class: "sk-wash", transform: `translate(3.5 3)` }, fg);
        } else {
          hatchLines(w, h, 2.1, -38, fr, 0.9).forEach(ln =>
            pencil(fg, ln, Math.max(0.8, sw * 0.42), fill.color, fr, level.amp * 0.6, 0.38)
          );
        }
      } else if (fill.type === "scribble") {
        const zz = scribblePath(w, h, gap * 1.3, -41, fr);
        if (mode === "b") inkPath(fg, wobble(resample(zz, 4), 1.2, fr), gap * 0.6, fill.color, fr, { cls: "sk-wash", thinning: 0.2, taperStart: 0, taperEnd: 0 });
        else node("path", { d: polyD(wobble(resample(scribblePath(w, h, gap * 1.9, -41, fr), 4), 1.6, fr)), fill: "none", stroke: fill.color, "stroke-width": Math.max(1, sw * 0.6), "stroke-linejoin": "round", opacity: 0.8 }, fg);
      } else {
        const angles = fill.type === "cross" ? [-41, 49] : [-41];
        angles.forEach(ang =>
          hatchLines(w, h, gap, ang, fr, gap * 0.18).forEach(ln => {
            const pts = resample(ln, 6);
            if (mode === "b") inkPath(fg, wobble(pts, 0.6, fr), Math.max(1.4, sw * 0.7), fill.color, fr, { taperStart: 6, taperEnd: 10 });
            else pencil(fg, ln, Math.max(0.9, sw * 0.45), fill.color, fr, level.amp * 0.4, 0.85);
          })
        );
      }
    }

    if (mode === "b") {
      const pts = loopStroke(base, level.amp, rand, 0.06);
      inkPath(g, pts, sw * 1.3 + 0.5, stroke, rand, { taperStart: sw * 3, taperEnd: sw * 9 });
    } else {
      const sd = sides(el.shape, w, h);
      if (sd) {
        sd.forEach(([a, b]) => {
          for (let pass = 0; pass < 2; pass++) {
            const L = dist(a, b) || 1;
            const cap = Math.min(L * 0.1, 7);
            const e1 = Math.min(cap, (1.5 + rand() * 3.5) * (0.6 + level.amp / 3));
            const e2 = Math.min(cap, (1.5 + rand() * 4.5) * (0.6 + level.amp / 3));
            const ux = (b[0] - a[0]) / L;
            const uy = (b[1] - a[1]) / L;
            const off = (rand() - 0.5) * level.amp;
            pencil(g, [
              [a[0] - ux * e1 - uy * off, a[1] - uy * e1 + ux * off],
              [b[0] + ux * e2 - uy * off, b[1] + uy * e2 + ux * off],
            ], Math.max(1, sw * 0.62), stroke, rand, level.amp, pass ? 0.55 : 0.9);
          }
        });
      } else {
        for (let pass = 0; pass < 2; pass++) {
          const pts = loopStroke(base, level.amp * (pass ? 1.3 : 1), rand, 0.08);
          node("path", { d: polyD(pts), fill: "none", stroke, "stroke-width": Math.max(1, sw * 0.62), "stroke-linecap": "round", "stroke-linejoin": "round", opacity: pass ? 0.55 : 0.9, class: "sk-pencil" }, g);
        }
      }
    }
  }

  function pencil(g, seg, width, color, rand, amp, opacity) {
    const pts = wobble(resample(seg, 4), amp, rand);
    return node("path", { d: polyD(pts), fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", opacity, class: "sk-pencil" }, g);
  }

  // ───────── 箭头 ─────────
  function bezier(p0, c1, c2, p3, n = 40) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
      ]);
    }
    return out;
  }
  /** arrow: { pts, curve?:[c1,c2], dashed, sw, stroke, seed, heads:{start,end} } —— 坐标为绝对坐标 */
  function arrowPolyline(a) {
    if (a.curve) return bezier(a.pts[0], a.curve[0], a.curve[1], a.pts[a.pts.length - 1]);
    return a.pts;
  }
  function arrowD(a) {
    if (a.curve) {
      const [p0, p3] = [a.pts[0], a.pts[a.pts.length - 1]];
      const [c1, c2] = a.curve;
      return `M${p0[0]} ${p0[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`;
    }
    return polyD(a.pts);
  }
  function headDir(poly, atEnd) {
    const pts = resample(poly, 2);
    const tip = atEnd ? pts[pts.length - 1] : pts[0];
    const k = Math.min(pts.length - 1, 7);
    const ref = atEnd ? pts[pts.length - 1 - k] : pts[k];
    const L = dist(ref, tip) || 1;
    return { tip, ux: (tip[0] - ref[0]) / L, uy: (tip[1] - ref[1]) / L };
  }
  function wings(tip, ux, uy, len, spread) {
    const rot = s => {
      const c = Math.cos(s);
      const n = Math.sin(s);
      return [tip[0] - len * (ux * c - uy * n), tip[1] - len * (uy * c + ux * n)];
    };
    return [rot(spread), rot(-spread)];
  }

  function renderArrow(g, a, mode, opts = {}) {
    const { sw = 2, stroke = "var(--sk-ink)" } = a;
    const level = LEVELS[opts.level || "natural"];
    const poly = arrowPolyline(a);
    const heads = a.heads || { end: true };

    if (mode === "precise") {
      node("path", { d: arrowD(a), fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": a.dashed ? `${sw * 3} ${sw * 3}` : null }, g);
      for (const end of [true, false]) {
        if (!(end ? heads.end : heads.start)) continue;
        const { tip, ux, uy } = headDir(poly, end);
        const [l, r] = wings(tip, ux, uy, 8 + sw * 2, 0.45);
        node("path", { d: `M${l} L${tip} L${r} Z`, fill: stroke, stroke, "stroke-width": sw, "stroke-linejoin": "round" }, g);
      }
      return;
    }

    if (mode === "current") {
      // 忠实复刻：每次渲染随机 seed + 实心三角头，尺寸 max(10, 8 × 线宽)
      const o = { stroke, strokeWidth: sw, roughness: level.rough, bowing: 0.5, seed: Math.floor(Math.random() * 2000) };
      if (a.dashed) o.strokeLineDash = [5, 5];
      gen.toPaths(gen.path(arrowD(a), o)).forEach(p => node("path", { d: p.d, fill: "none", stroke: p.stroke, "stroke-width": p.strokeWidth, "stroke-dasharray": a.dashed ? "5 5" : null }, g));
      for (const end of [true, false]) {
        if (!(end ? heads.end : heads.start)) continue;
        const { tip, ux, uy } = headDir(poly, end);
        const size = Math.max(10, 8 * sw);
        const [l, r] = wings(tip, ux, uy, size, 0.5);
        gen.toPaths(gen.polygon([tip, l, r], { stroke, strokeWidth: sw, fill: stroke, fillStyle: "solid", roughness: level.rough, seed: Math.floor(Math.random() * 2000) })).forEach(p =>
          node("path", { d: p.d, fill: p.fill || "none", stroke: p.stroke, "stroke-width": p.strokeWidth }, g)
        );
      }
      return;
    }

    const seed = a.seed || 11;
    const rand = rng(seed);
    const headLen = clamp(9 + sw * 2.6, 10, 22);

    if (mode === "a") {
      const o = { stroke, strokeWidth: sw, roughness: level.rough * 0.8, bowing: level.bow, seed, preserveVertices: true, disableMultiStroke: opts.level !== "loose" };
      if (a.dashed) o.strokeLineDash = [sw * 4, sw * 3];
      gen.toPaths(a.curve ? gen.curve(resample(poly, 14), o) : gen.linearPath(poly, o)).forEach(p => node("path", { d: p.d, fill: "none", stroke: p.stroke, "stroke-width": p.strokeWidth, "stroke-linecap": "round", "stroke-dasharray": a.dashed ? `${sw * 4} ${sw * 3}` : null }, g));
      for (const end of [true, false]) {
        if (!(end ? heads.end : heads.start)) continue;
        const { tip, ux, uy } = headDir(poly, end);
        wings(tip, ux, uy, headLen, 0.48).forEach((wpt, i) =>
          gen.toPaths(gen.line(tip[0], tip[1], wpt[0], wpt[1], { ...o, seed: seed + i + (end ? 0 : 5), strokeLineDash: undefined })).forEach(p =>
            node("path", { d: p.d, fill: "none", stroke: p.stroke, "stroke-width": p.strokeWidth, "stroke-linecap": "round" }, g)
          )
        );
      }
      return;
    }

    const body = wobble(resample(poly, 3), level.amp * 0.55, rand);
    if (mode === "b") {
      const size = sw * 1.2 + 0.5;
      const ink = inkPath(g, body, size, stroke, rand, { taperStart: size * 2, taperEnd: size * 1.2 });
      if (a.dashed) {
        // 虚线 = 连续墨迹 × 虚线遮罩：遮罩是沿中心线描的粗虚线，动画只改遮罩的 dashoffset，墨迹本身不重算
        const dash = sw * 4 + 7;
        const gapL = sw * 2.5 + 4;
        const id = "skm" + ++uid;
        const mask = node("mask", { id, maskUnits: "userSpaceOnUse", x: -5000, y: -5000, width: 10000, height: 10000 }, g);
        node("path", {
          d: polyD(body),
          fill: "none",
          stroke: "#fff",
          "stroke-width": size * 3,
          "stroke-linecap": "round",
          "stroke-dasharray": `${dash} ${gapL + size * 3}`,
          "stroke-dashoffset": 0,
          class: a.animated ? "sk-dash-flow" : null,
          style: a.animated ? `--sk-dash-cycle:${dash + gapL + size * 3}px;animation-duration:${(dash + gapL) / 28}s` : null,
        }, mask);
        ink.setAttribute("mask", `url(#${id})`);
      } else if (a.animated) {
        flowDots(g, body, size, stroke);
      }
      for (const end of [true, false]) {
        if (!(end ? heads.end : heads.start)) continue;
        const { tip, ux, uy } = headDir(body, end);
        const [l, r] = wings(tip, ux, uy, headLen, 0.5 + (rand() - 0.5) * 0.12);
        // 箭头一笔：左翼 → 尖 → 右翼
        inkPath(g, resample([l, tip, r], 2), size, stroke, rand, { taperStart: size * 1.6, taperEnd: size * 2.4, streamline: 0.12 });
      }
      return;
    }

    // C 铅笔
    for (let pass = 0; pass < 2; pass++) {
      const pts = wobble(resample(poly, 4), level.amp * (pass ? 0.8 : 0.5), rand);
      node("path", { d: polyD(pts), fill: "none", stroke, "stroke-width": Math.max(1, sw * 0.62), "stroke-linecap": "round", "stroke-dasharray": a.dashed ? `${sw * 4} ${sw * 3}` : null, opacity: pass ? 0.5 : 0.9, class: "sk-pencil" }, g);
    }
    for (const end of [true, false]) {
      if (!(end ? heads.end : heads.start)) continue;
      const { tip, ux, uy } = headDir(poly, end);
      wings(tip, ux, uy, headLen, 0.48).forEach(wpt => {
        const ext = [tip[0] + ux * 2, tip[1] + uy * 2];
        pencil(g, [ext, wpt], Math.max(1, sw * 0.62), stroke, rand, level.amp * 0.3, 0.9);
      });
    }
  }

  /** 实线流动：沿中心线跑的墨点（与普通模式的流动点同一语义），三颗错开相位 */
  function flowDots(g, pts, size, color) {
    const d = polyD(pts);
    const L = lengthOf(pts);
    const dur = Math.max(1.2, L / 90);
    for (let i = 0; i < 3; i++) {
      const dot = node("circle", { r: size * 1.5 + 1, fill: color, stroke: "var(--sk-paper)", "stroke-width": 1.5, opacity: 0 }, g);
      const begin = `${(-dur * i) / 3}s`;
      node("animateMotion", { dur: `${dur}s`, repeatCount: "indefinite", path: d, begin }, dot);
      node("animate", { attributeName: "opacity", values: "0;1;1;0", keyTimes: "0;0.12;0.85;1", dur: `${dur}s`, repeatCount: "indefinite", begin }, dot);
    }
  }

  /** 画框边：手绘方案下是一圈淡墨虚描，普通/现状是实线圆角框 */
  function renderFrame(g, fr, mode, opts = {}) {
    const { w, h } = fr;
    const color = "var(--sk-frame)";
    if (!MODES[mode].hand) {
      node("rect", { x: 0, y: 0, width: w, height: h, rx: 10, fill: "var(--sk-frame-bg)", stroke: color, "stroke-width": 1.2 }, g);
      return;
    }
    node("rect", { x: 0, y: 0, width: w, height: h, rx: 10, fill: "var(--sk-frame-bg)", stroke: "none" }, g);
    renderShape(g, { shape: { kind: "rect", radius: 10 }, w, h, sw: 1.3, stroke: color, seed: fr.seed || 5 }, mode, { level: opts.level === "loose" ? "natural" : "neat" });
  }

  /** 已有「手写」工具的笔迹（perfect-freehand），各模式一致 —— 方案 B 与它同一套墨水引擎 */
  function renderInk(g, ink) {
    const rand = rng(ink.seed || 3);
    inkPath(g, resample(ink.pts, 2.5), ink.size || 4, ink.color, rand, { taperStart: 8, taperEnd: 16, thinning: 0.6, streamline: 0.4 });
  }

  /** 选项缩略图：在 44×26 里画一个小方块，复用真实渲染 */
  function glyph(mode, el, opts, w = 44, h = 26) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `-4 -4 ${w} ${h}`);
    svg.style.overflow = "visible";
    renderShape(svg, { shape: { kind: "rect" }, w: w - 8, h: h - 8, sw: 1.5, seed: 17, ...el }, mode, opts);
    return svg;
  }

  window.SK = { HAND_FONT, LEVELS, FILLS, MODES, renderShape, renderArrow, renderFrame, renderInk, glyph, node, rng, resample, bezier };
})();
