/* 马克笔高亮 mockup：生成 A/B/C 三种笔触的 SVG 背景切片，并为 D（叠加层）逐行手绘笔迹。视觉参考，非导出源（D-001） */
(function () {
  // 与 packages/editor 行内色板一致（明 / 暗两档）
  const PALETTE = {
    gray: ["#8f959e", "#9a9a9a"],
    red: ["#e33a32", "#fa7873"],
    orange: ["#e57d05", "#f5a54a"],
    yellow: ["#dc9b04", "#fcd456"],
    green: ["#2ea121", "#6dd162"],
    blue: ["#245bdb", "#70a0ff"],
    purple: ["#6425d0", "#a472fc"],
  };
  // 备选：荧光笔色（更亮、更像真荧光笔）
  const FLUO = {
    gray: ["#a3a8b0", "#9a9a9a"],
    red: ["#ff5a7a", "#ff7d95"],
    orange: ["#ff9a1f", "#ffae4a"],
    yellow: ["#ffd400", "#ffe14d"],
    green: ["#4fd64a", "#7ae276"],
    blue: ["#3fa4ff", "#6fb9ff"],
    purple: ["#b46bff", "#c08cff"],
  };
  // 每种笔触的不透明度（明 / 暗）；暗色不能用正片叠底，只能压低透明度，免得字被吞掉
  const ALPHA = {
    chisel: [0.4, 0.28],
    "chisel-old": [0.4, 0.3],
    swipe: [0.46, 0.34],
    grain: [0.5, 0.36],
    overlay: [0.42, 0.3],
  };

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const rng = seed => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const uri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const svg = (w, body) =>
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} 100' preserveAspectRatio='none'>${body}</svg>`;

  /* 中段切片的上下沿：两端 y 相同，横向平铺无缝 */
  const edge = (w, base, amp, step, r) => {
    const pts = [];
    for (let x = 0; x <= w; x += step) {
      const end = x === 0 || x >= w;
      pts.push([x, end ? base : base + (r() - 0.5) * amp]);
    }
    return pts;
  };
  const band = (w, top, bottom) =>
    "M" +
    top.map(p => p.join(" ")).join(" L") +
    " L" +
    bottom
      .slice()
      .reverse()
      .map(p => p.join(" "))
      .join(" L") +
    " Z";

  /* A 平头荧光笔：两端平行斜切。笔头与中段共用上下沿高度、浓度和内部纹理，接缝处连续；
     起笔一侧在笔头内渐变积墨，收笔一侧渐变提淡，到接缝时都回到中段浓度（与 Highlight/marker.ts 一致） */
  const TOP = 6;
  const BOTTOM = 95;
  const chiselTexture = (w, color, a) =>
    `<rect x='0' y='${TOP}' width='${w}' height='9' fill='${rgba(color, a * 0.5)}'/>` +
    `<rect x='0' y='${BOTTOM - 10}' width='${w}' height='10' fill='${rgba(color, a * 0.6)}'/>` +
    `<rect x='0' y='42' width='${w}' height='2.5' fill='${rgba(color, a * 0.35)}'/>` +
    `<rect x='0' y='66' width='${w}' height='2' fill='${rgba(color, a * 0.3)}'/>`;
  function chisel(color, a, r) {
    const w = 64;
    const capW = 10;
    const fill = rgba(color, a);
    const mid = svg(
      w,
      `<clipPath id='c'><path d='${band(w, edge(w, TOP, 5, 8, r), edge(w, BOTTOM, 5, 8, r))}'/></clipPath>` +
        `<g clip-path='url(#c)'><rect width='${w}' height='100' fill='${fill}'/>${chiselTexture(w, color, a)}</g>`
    );
    const cap = (shape, stops) =>
      svg(
        capW,
        `<defs><linearGradient id='g'>${stops}</linearGradient></defs>` +
          `<clipPath id='c'><path d='${shape}'/></clipPath>` +
          `<g clip-path='url(#c)'><rect width='${capW}' height='100' fill='url(#g)'/>${chiselTexture(capW, color, a)}</g>`
      );
    const left = cap(
      `M3 ${TOP} L${capW} ${TOP} L${capW} ${BOTTOM} L1.2 ${BOTTOM} Q0 ${BOTTOM} 0.3 ${BOTTOM - 4} Z`,
      `<stop offset='0' stop-color='${rgba(color, a * 1.3)}'/><stop offset='1' stop-color='${fill}'/>`
    );
    const right = cap(
      `M0 ${TOP} L${capW - 0.6} ${TOP} Q${capW} ${TOP} ${capW - 0.3} ${TOP + 4} L7 ${BOTTOM} L0 ${BOTTOM} Z`,
      `<stop offset='0' stop-color='${fill}'/><stop offset='1' stop-color='${rgba(color, a * 0.8)}'/>`
    );
    return { left: uri(left), mid: uri(mid), right: uri(right) };
  }

  /* 修复前的切片（仅用于对比）：左笔头叠了两层且浓于中段，笔头与中段的上下沿、纹理不连续 */
  function chiselOld(color, a, r) {
    const w = 64;
    const top = edge(w, 6, 5, 8, r);
    const bot = edge(w, 95, 5, 8, r);
    const dark = rgba(color, Math.min(1, a * 1.35));
    const mid = svg(
      w,
      `<path d='${band(w, top, bot)}' fill='${rgba(color, a)}'/>` +
        `<rect x='0' y='6' width='${w}' height='9' fill='${rgba(color, a * 0.5)}'/>` +
        `<rect x='0' y='85' width='${w}' height='10' fill='${rgba(color, a * 0.6)}'/>` +
        `<rect x='0' y='${40 + r() * 8}' width='${w}' height='2.5' fill='${rgba(color, a * 0.35)}'/>` +
        `<rect x='0' y='${62 + r() * 8}' width='${w}' height='2' fill='${rgba(color, a * 0.3)}'/>`
    );
    const left = svg(
      10,
      `<path d='M7 6 L10 6 L10 95 L1 95 Q0 70 3 40 Z' fill='${dark}'/>` +
        `<path d='M8.5 6 L10 6 L10 95 L3 95 Z' fill='${rgba(color, a)}'/>`
    );
    const right = svg(
      10,
      `<path d='M0 6 L9 6 Q10 30 7 60 L3 95 L0 95 Z' fill='${rgba(color, a * 0.85)}'/>`
    );
    return { left: uri(left), mid: uri(mid), right: uri(right) };
  }

  /* B 下半划线：只覆盖字身下半，圆头 */
  function swipe(color, a, r) {
    const w = 64;
    const top = edge(w, 48, 6, 8, r);
    const bot = edge(w, 96, 4, 8, r);
    const fill = rgba(color, a);
    const mid = svg(
      w,
      `<path d='${band(w, top, bot)}' fill='${fill}'/>` +
        `<rect x='0' y='88' width='${w}' height='8' fill='${rgba(color, a * 0.45)}'/>`
    );
    const left = svg(10, `<path d='M10 48 Q2 50 1 72 Q2 95 10 96 Z' fill='${fill}'/>`);
    const right = svg(10, `<path d='M0 48 Q8 52 9 70 Q8 94 0 96 Z' fill='${fill}'/>`);
    return { left: uri(left), mid: uri(mid), right: uri(right) };
  }

  /* C 干笔颗粒：毛边 + 噪声镂空，像墨快干的马克笔压在纸上 */
  function grain(color, a, r) {
    const w = 96;
    const seed = Math.floor(r() * 1000);
    const top = edge(w, 8, 10, 6, r);
    const bot = edge(w, 93, 10, 6, r);
    const filter =
      `<filter id='g' x='0' y='0' width='100%' height='100%'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.035 0.6' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75'/>` +
      `<feComposite in='SourceGraphic' operator='in'/></filter>`;
    const d = band(w, top, bot);
    const mid = svg(
      w,
      `<defs>${filter}</defs>` +
        `<path d='${d}' fill='${rgba(color, a * 0.35)}'/>` +
        `<path d='${d}' fill='${rgba(color, a)}' filter='url(#g)'/>`
    );
    const left = svg(
      10,
      `<path d='M10 8 L5 10 L7 22 L2 34 L5 48 L1 62 L4 76 L2 93 L10 93 Z' fill='${rgba(color, a * 0.7)}'/>`
    );
    const right = svg(
      10,
      `<path d='M0 8 L6 12 L4 26 L9 40 L5 55 L8 70 L3 84 L6 93 L0 93 Z' fill='${rgba(color, a * 0.6)}'/>`
    );
    return { left: uri(left), mid: uri(mid), right: uri(right) };
  }

  const MAKERS = { chisel, "chisel-old": chiselOld, swipe, grain };

  /* 为 [data-mode] × [data-v] × [data-c] 生成变量规则；荧光色走 [data-fluo="on"] 同元素复合选择器 */
  function buildStyles() {
    const rules = [];
    const sets = [
      ["", PALETTE],
      ['[data-fluo="on"]', FLUO],
    ];
    sets.forEach(([fluoSel, palette]) => {
      ["light", "dark"].forEach((mode, mi) => {
        Object.entries(palette).forEach(([id, pair], ci) => {
          const color = pair[mi];
          const scope = `[data-mode="${mode}"]${fluoSel}`;
          rules.push(`${scope} mark[data-c="${id}"], ${scope}[data-c="${id}"] { --hl: ${color}; }`);
          Object.entries(MAKERS).forEach(([v, make], vi) => {
            const tiles = make(color, ALPHA[v][mi], rng(97 + ci * 13 + vi * 131 + mi * 7));
            const sel = [
              `${scope} [data-v="${v}"] mark[data-c="${id}"]`,
              `${scope}[data-v="${v}"] mark[data-c="${id}"]`,
              `[data-v="${v}"] ${scope} mark[data-c="${id}"]`,
            ];
            rules.push(
              `${sel.join(", ")} { --cap-l-img: ${tiles.left}; --mid-img: ${tiles.mid}; --cap-r-img: ${tiles.right}; }`
            );
          });
        });
      });
    });
    const style = document.createElement("style");
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  /* 相邻同色 mark 视为同一段高亮（模拟 Slate 因加粗等标记拆开的叶子），衔接处不画笔头 */
  function markJoins(root = document) {
    root.querySelectorAll("mark").forEach(m => m.classList.remove("join-l", "join-r"));
    root.querySelectorAll("mark").forEach(m => {
      if (m.closest("[data-join='off']")) return;
      let next = m.nextSibling;
      while (next && next.nodeType === 3 && next.textContent === "") next = next.nextSibling;
      if (next && next.nodeName === "MARK" && next.dataset.c === m.dataset.c) {
        m.classList.add("join-r");
        next.classList.add("join-l");
      }
    });
  }

  /* ---------- D 叠加层：量每段高亮的逐行矩形，画一笔手绘笔迹 ---------- */
  const hash = s => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) % 2147483646 || 1;
  };

  function runsOf(host) {
    const runs = [];
    host.querySelectorAll("mark").forEach(m => {
      if (m.classList.contains("join-l")) runs[runs.length - 1]?.marks.push(m);
      else runs.push({ color: m.dataset.c, marks: [m] });
    });
    return runs;
  }

  function lineRects(run, origin) {
    const lines = [];
    run.marks.forEach(m => {
      Array.from(m.getClientRects()).forEach(rc => {
        if (rc.width < 1) return;
        const cy = (rc.top + rc.bottom) / 2;
        const line = lines.find(l => Math.abs((l.top + l.bottom) / 2 - cy) < 4);
        if (line) {
          line.left = Math.min(line.left, rc.left);
          line.right = Math.max(line.right, rc.right);
          line.top = Math.min(line.top, rc.top);
          line.bottom = Math.max(line.bottom, rc.bottom);
        } else lines.push({ left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom });
      });
    });
    return lines.map(l => ({
      x0: l.left - origin.left,
      x1: l.right - origin.left,
      y0: l.top - origin.top,
      y1: l.bottom - origin.top,
    }));
  }

  const smooth = pts => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [x, y] = pts[i];
      d += ` Q${px.toFixed(1)} ${py.toFixed(1)} ${((px + x) / 2).toFixed(1)} ${((py + y) / 2).toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
  };

  function strokePath(rect, r) {
    const h = rect.y1 - rect.y0;
    const x0 = rect.x0 - 4 - r() * 3;
    const x1 = rect.x1 + 3 + r() * 5;
    const tilt = (r() - 0.5) * 2.4; // 整笔微斜
    const yTop = rect.y0 + h * 0.08;
    const yBot = rect.y1 - h * 0.02;
    const slant = h * 0.32; // 斜切笔头
    const n = Math.max(3, Math.round((x1 - x0) / 26));
    const top = [];
    const bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + slant + (x1 - x0 - slant) * t;
      top.push([x, yTop + tilt * t + (r() - 0.5) * 1.8]);
      bot.push([x - slant, yBot + tilt * t + (r() - 0.5) * 1.8]);
    }
    const pts = top.concat(bot.reverse());
    return { d: smooth(pts) + " Z", x0, x1, yTop, yBot, tilt };
  }

  function drawOverlay(host) {
    host.querySelector(":scope > svg.hl-layer")?.remove();
    const v = host.closest("[data-v]")?.dataset.v;
    if (v !== "overlay") return;
    const dark = host.closest("[data-mode]")?.dataset.mode === "dark";
    const fluo = host.closest("[data-fluo]")?.dataset.fluo === "on";
    const palette = fluo ? FLUO : PALETTE;
    const a = ALPHA.overlay[dark ? 1 : 0];
    const origin = host.getBoundingClientRect();
    let out = "";
    let gid = 0;
    runsOf(host).forEach(run => {
      const color = (palette[run.color] || palette.yellow)[dark ? 1 : 0];
      const r = rng(hash(run.marks.map(m => m.textContent).join("")));
      lineRects(run, origin).forEach(rect => {
        const s = strokePath(rect, r);
        const id = `hlg${gid++}`;
        out +=
          `<defs><linearGradient id='${id}' x1='${s.x0}' x2='${s.x1}' gradientUnits='userSpaceOnUse'>` +
          `<stop offset='0' stop-color='${rgba(color, Math.min(1, a * 1.45))}'/>` +
          `<stop offset='0.06' stop-color='${rgba(color, a)}'/>` +
          `<stop offset='0.9' stop-color='${rgba(color, a)}'/>` +
          `<stop offset='1' stop-color='${rgba(color, a * 0.7)}'/></linearGradient></defs>` +
          `<path d='${s.d}' fill='url(#${id})'/>`;
        // 两道纤维细纹
        [0.3, 0.68].forEach(k => {
          const y = s.yTop + (s.yBot - s.yTop) * k + (r() - 0.5) * 2;
          out += `<path d='M${s.x0 + 8} ${y.toFixed(1)} L${(s.x1 - 6).toFixed(1)} ${(y + s.tilt).toFixed(1)}' stroke='${rgba(color, a * 0.3)}' stroke-width='1.2' fill='none'/>`;
        });
      });
    });
    host.insertAdjacentHTML(
      "afterbegin",
      `<svg class='hl-layer' xmlns='http://www.w3.org/2000/svg'>${out}</svg>`
    );
  }

  function drawAll() {
    markJoins();
    document.querySelectorAll(".hl-host").forEach(drawOverlay);
  }

  buildStyles();
  window.markerMockup = { drawAll };
  const ro = new ResizeObserver(() => drawAll());
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".hl-host").forEach(h => ro.observe(h));
    drawAll();
    document.fonts?.ready.then(drawAll);
  });
})();
