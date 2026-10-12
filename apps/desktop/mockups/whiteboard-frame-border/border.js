/*
  白板画框边框线型 mockup · 渲染引擎：与落地实现同一套算法（逐边角对齐 / 拖入流动 / 手绘遮罩）。
  视觉参考，非导出源（D-001）。
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const f = n => Math.round(n * 100) / 100;
  let uid = 0;
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /** 线型节奏（画布单位）：visible = 一段墨的可见长度（点线为 0，点由圆头形成），pitch = 周期 */
  const RHYTHM = {
    plain: {
      dashed: bw => ({ visible: 4 * bw, pitch: 7 * bw }),
      dotted: bw => ({ visible: 0, pitch: 2.5 * bw }),
    },
    sketch: {
      dashed: bw => ({ visible: 7 * bw, pitch: 11.5 * bw }),
      dotted: bw => ({ visible: 0, pitch: 5 * bw }),
    },
  };
  const FLOW_SPEED = 24;
  const NEAT_AMP = 0.55;
  const inkSize = bw => bw * 1.3 + 0.5;

  /** 四条边：从上一个角的弧中点顺时针走到下一个角的弧中点 */
  function sides(w, h, radius) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    const k = r * (1 - Math.SQRT1_2);
    const q = (Math.PI * r) / 4;
    const arc = (x, y) => (r > 0 ? ` A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y)}` : ` L${f(x)} ${f(y)}`);
    const hl = w - 2 * r + 2 * q;
    const vl = h - 2 * r + 2 * q;
    return [
      { d: `M${f(k)} ${f(k)}${arc(r, 0)} L${f(w - r)} 0${arc(w - k, k)}`, length: hl },
      { d: `M${f(w - k)} ${f(k)}${arc(w, r)} L${w} ${f(h - r)}${arc(w - k, h - k)}`, length: vl },
      { d: `M${f(w - k)} ${f(h - k)}${arc(w - r, h)} L${f(r)} ${h}${arc(k, h - k)}`, length: hl },
      { d: `M${f(k)} ${f(h - k)}${arc(0, h - r)} L0 ${f(r)}${arc(k, k)}`, length: vl },
    ];
  }

  /** 节奏贴合到一段长度：整数个周期；cap = 圆头向两端多出的总长 */
  function fit(length, rhythm, cap) {
    const n = Math.max(1, Math.round(length / rhythm.pitch));
    const pitch = length / n;
    const dash = Math.max(0, rhythm.visible * (pitch / rhythm.pitch) - cap);
    return { dash, gap: pitch - dash, pitch, n };
  }

  function plainBorder(g, w, h, r, style, bw, color) {
    if (style === "solid") {
      el(
        "rect",
        { width: w, height: h, rx: r, fill: "none", stroke: color, "stroke-width": bw },
        g
      );
      return;
    }
    const rhythm = RHYTHM.plain[style](bw);
    for (const side of sides(w, h, r)) {
      const p = fit(side.length, rhythm, bw);
      el(
        "path",
        {
          d: side.d,
          fill: "none",
          stroke: color,
          "stroke-width": bw,
          "stroke-linecap": "round",
          "stroke-dasharray": `${f(p.dash)} ${f(p.gap)}`,
          "stroke-dashoffset": f(p.dash / 2),
        },
        g
      );
    }
  }

  /** 拖入反馈：线宽 +1，整圈一条虚线顺时针流动；实线框借用虚线节奏 */
  function flowBorder(g, w, h, radius, style, bw, color) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
    const width = bw + 1;
    const p = fit(perimeter, RHYTHM.plain[style === "dotted" ? "dotted" : "dashed"](width), width);
    const rect = el(
      "rect",
      {
        width: w,
        height: h,
        rx: r,
        fill: "none",
        stroke: color,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-dasharray": `${f(p.dash)} ${f(p.gap)}`,
      },
      g
    );
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      el(
        "animate",
        {
          attributeName: "stroke-dashoffset",
          from: 0,
          to: f(-p.pitch),
          dur: `${f(p.pitch / FLOW_SPEED)}s`,
          repeatCount: "indefinite",
        },
        rect
      );
  }

  // ── 手绘：utils/sketch 的精简移植 ──
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  function resample(pts, step) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    const count = Math.max(2, Math.ceil(total / step));
    const out = [];
    let j = 1;
    for (let k = 0; k <= count; k++) {
      const at = (total * k) / count;
      while (j < cum.length - 1 && cum[j] < at) j++;
      const a = pts[j - 1],
        b = pts[j],
        t = (at - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }
  function wobble(pts, amp, rand) {
    const lw = (Math.PI * 2) / (110 + rand() * 90),
      sw = (Math.PI * 2) / (28 + rand() * 18);
    const lp = rand() * Math.PI * 2,
      sp = rand() * Math.PI * 2;
    let s = 0;
    return pts.map((p, i) => {
      if (i > 0) s += dist(pts[i - 1], p);
      const prev = pts[Math.max(0, i - 1)],
        next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next[0] - prev[0],
        dy = next[1] - prev[1],
        len = Math.hypot(dx, dy) || 1;
      const o = amp * (0.72 * Math.sin(s * lw + lp) + 0.28 * Math.sin(s * sw + sp));
      return [p[0] - (dy / len) * o, p[1] + (dx / len) * o];
    });
  }
  function roundedRect(w, h, r) {
    const pts = [];
    const corner = (cx, cy, a0) => {
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (Math.PI / 2) * (i / 8);
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    };
    corner(w - r, r, -Math.PI / 2);
    corner(w - r, h - r, 0);
    corner(r, h - r, Math.PI / 2);
    corner(r, r, Math.PI);
    pts.push([pts[0][0], pts[0][1]]);
    return pts;
  }
  function inkD(pts, size, rand, o) {
    const n = pts.length;
    const input = pts.map((p, i) => {
      const t = i / Math.max(1, n - 1);
      const pr =
        0.62 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.22 * t + (rand() - 0.5) * 0.05;
      return [p[0], p[1], Math.min(1, Math.max(0.2, pr))];
    });
    const out = PF.getStroke(input, {
      size,
      thinning: 0.5,
      smoothing: 0.55,
      streamline: 0.22,
      simulatePressure: false,
      start: { taper: o.taperStart, cap: true },
      end: { taper: o.taperEnd, cap: true },
      last: true,
    });
    let d = `M${f(out[0][0])} ${f(out[0][1])} Q`;
    for (let i = 0; i < out.length; i++) {
      const [x0, y0] = out[i],
        [x1, y1] = out[(i + 1) % out.length];
      d += ` ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
    }
    return d + " Z";
  }
  function loopStroke(loop, amp, rand) {
    const base = resample(loop, 3);
    base.pop();
    const n = base.length,
      start = Math.floor(rand() * n);
    const ring = base.slice(start).concat(base.slice(0, start));
    let per = 0;
    for (let i = 1; i < ring.length; i++) per += dist(ring[i - 1], ring[i]);
    const overlapN = Math.max(4, Math.round((n * Math.max(12, per * 0.06)) / per));
    const cx = ring.reduce((s, p) => s + p[0], 0) / n,
      cy = ring.reduce((s, p) => s + p[1], 0) / n;
    const tail = ring.slice(0, overlapN).map((p, i) => {
      const dx = p[0] - cx,
        dy = p[1] - cy,
        len = Math.hypot(dx, dy) || 1,
        k = (i / overlapN) * (1.5 + amp);
      return [p[0] + (dx / len) * k, p[1] + (dy / len) * k];
    });
    return wobble(ring.concat([ring[0]], tail), amp, rand);
  }

  /** 手绘虚线 / 点线：无搭接的一笔闭合墨迹 × 逐边虚线遮罩；起笔接缝藏在上边中段的空隙里 */
  function sketchBorder(g, w, h, radius, style, bw, color, seed) {
    const rand = rng(seed),
      size = inkSize(bw);
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    if (style === "solid") {
      const d = inkD(loopStroke(roundedRect(w, h, r), NEAT_AMP, rand), size, rand, {
        taperStart: bw * 3,
        taperEnd: bw * 9,
      });
      el("path", { d, fill: color }, g);
      return;
    }
    const maskWidth = style === "dotted" ? size * 1.3 : size * 3;
    const all = sides(w, h, r);
    const fits = all.map(s => fit(s.length, RHYTHM.sketch[style](bw), maskWidth));
    const seamX = r - (Math.PI * r) / 4 + (Math.floor((fits[0].n - 1) / 2) + 0.5) * fits[0].pitch;
    const base = resample(roundedRect(w, h, r), 3);
    base.pop();
    let si = 0;
    base.forEach((p, i) => {
      if (dist(p, [seamX, 0]) < dist(base[si], [seamX, 0])) si = i;
    });
    const ring = base.slice(si).concat(base.slice(0, si));
    ring.push(ring[0]);
    const id = `fm${++uid}`;
    const mask = el(
      "mask",
      { id, maskUnits: "userSpaceOnUse", x: -50, y: -50, width: w + 100, height: h + 100 },
      g
    );
    all.forEach((s, i) =>
      el(
        "path",
        {
          d: s.d,
          fill: "none",
          stroke: "#fff",
          "stroke-width": f(maskWidth),
          "stroke-linecap": "round",
          "stroke-dasharray": `${f(fits[i].dash)} ${f(fits[i].gap)}`,
          "stroke-dashoffset": f(fits[i].dash / 2),
        },
        mask
      )
    );
    el(
      "path",
      {
        d: inkD(wobble(ring, NEAT_AMP, rand), size, rand, { taperStart: 0, taperEnd: 0 }),
        fill: color,
        mask: `url(#${id})`,
      },
      g
    );
  }

  /** 标题：内嵌 chip 盖住它所在那段边框（左上与外沿对齐），上方标题不变 */
  function title(g, fr) {
    const inline = fr.titlePos !== "top";
    const c = fr.sketch ? inkSize(fr.bw) / 2 + NEAT_AMP : fr.bw / 2;
    const fo = inline
      ? el("foreignObject", { x: -c, y: -c, width: fr.w, height: 32 + fr.bw / 2 + c }, g)
      : el("foreignObject", { x: 0, y: -50, width: fr.w, height: 40 }, g);
    const wrap = document.createElement("div");
    wrap.className = "chip-wrap";
    const chip = document.createElement("div");
    chip.className = `chip ${inline ? "inline" : "top"}${fr.sketch ? " hand" : ""}`;
    chip.textContent = fr.title;
    chip.style.background = fr.color;
    if (inline) {
      chip.style.borderRadius = `${fr.r + c}px 0 6px 0`;
      chip.style.paddingLeft = `${10 + fr.bw / 2 + c}px`;
    }
    wrap.appendChild(chip);
    fo.appendChild(wrap);
  }

  function frame(svg, fr) {
    const g = el("g", { transform: `translate(${fr.x} ${fr.y})` }, svg);
    el("rect", { width: fr.w, height: fr.h, rx: fr.r, fill: fr.bg }, g);
    if (fr.dropping) flowBorder(g, fr.w, fr.h, fr.r, fr.style, fr.bw, fr.color);
    else if (fr.sketch) sketchBorder(g, fr.w, fr.h, fr.r, fr.style, fr.bw, fr.color, fr.seed || 7);
    else plainBorder(g, fr.w, fr.h, fr.r, fr.style, fr.bw, fr.color);
    if (fr.title) title(g, fr);
    return g;
  }

  window.FB = { el, frame, RHYTHM };
})();
