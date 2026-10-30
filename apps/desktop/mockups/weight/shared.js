/*
  减重插件三方案共用：图标 / 壳层 / 统计口径 / 图表（SVG 手绘）/ 记录弹窗 / AI 流式演示。
  【视觉参考，非导出源】实现时图表改用 echarts（桌面端已依赖）或插件内 SVG 组件，口径以本文件 stats 为准。
*/
(function () {
  "use strict";
  const W = window.W;
  const D = W.D;

  /* ============ 图标（lucide 线性） ============ */
  const ICONS = {
    scale:
      '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    utensils:
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    footprints:
      '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4M4 13h4"/>',
    hourglass:
      '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    sunrise:
      '<path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
    sunset:
      '<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>',
    cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
    sparkles:
      '<path d="M12 3.5l1.7 4.4 4.4 1.6-4.4 1.7L12 15.6l-1.7-4.4-4.4-1.7 4.4-1.6z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    flask: '<path d="M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.52 16h12.96"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    refresh:
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    table: '<path d="M12 3v18M3 9h18M3 15h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    trend: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    flame:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    "list-todo":
      '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    timer:
      '<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    "file-text":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    puzzle:
      '<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    camera:
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  };
  function injectSprite() {
    if (document.getElementById("w-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "w-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  W.icon = icon;

  /* ============ 格式化 ============ */
  const WEEK = "日一二三四五六";
  W.md = t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  W.mdw = t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
  };
  W.kg = v => (v == null ? "—" : v.toFixed(1));
  W.signed = (v, digits = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
  W.deltaCls = (v, eps = 0.05) => (v < -eps ? "down" : v > eps ? "up" : "flat");
  W.chip = (id, extra = "", tagName = "span") => {
    const t = W.tag(id);
    return `<${tagName} class="chip c-${t.cat} ${extra}" data-tag="${id}"><span class="ci">${icon(W.CATS[t.cat].icon)}</span>${t.name}</${tagName}>`;
  };

  /* ============ 统计口径 ============ */
  // 7 日滑动均值：只用晨重（同条件可比），缺测日跳过
  W.avg7 = idx => {
    const vals = [];
    for (let k = Math.max(0, idx - 6); k <= idx; k++)
      if (W.days[k].am != null) vals.push(W.days[k].am);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  W.days.forEach((d, i) => (d.avg = W.avg7(i)));
  // 次晨变化：当天行动 → 第二天晨重 − 当天晨重
  W.days.forEach((d, i) => {
    const n = W.days[i + 1];
    d.next = n && n.am != null && d.am != null ? Math.round((n.am - d.am) * 100) / 100 : null;
  });
  // 区间周速率：滑动均值的线性回归斜率 × 7
  W.rate = (from, to) => {
    const pts = W.days.filter(d => d.t >= from && d.t <= to && d.avg != null);
    if (pts.length < 3) return null;
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.i, 0) / n;
    const my = pts.reduce((s, p) => s + p.avg, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num += (p.i - mx) * (p.avg - my);
      den += (p.i - mx) ** 2;
    }
    return (num / den) * 7;
  };
  // 行动效果：做了 vs 没做的次晨变化均值差；样本 < 8 标为「样本少」
  W.effects = () =>
    W.TAGS.map(t => {
      const withT = W.days.filter(d => d.next != null && d.actions.includes(t.id)).map(d => d.next);
      const without = W.days
        .filter(d => d.next != null && !d.actions.includes(t.id))
        .map(d => d.next);
      const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
      return { ...t, n: withT.length, diff: mean(withT) - mean(without), withMean: mean(withT) };
    }).sort((a, b) => a.diff - b.diff);
  W.summary = () => {
    const last = [...W.days].reverse().find(d => d.am != null);
    const first = W.days.find(d => d.am != null);
    const t = W.today();
    return {
      latest: last,
      today: t,
      start: first.am,
      lost: first.am - last.avg,
      week: W.rate(W.TODAY - 13 * D, W.TODAY),
      toGoal: last.avg - W.GOAL,
      bmi: last.avg / W.HEIGHT ** 2,
      streak: (() => {
        let s = 0;
        for (let k = W.days.length - 1; k >= 0 && W.days[k].am != null; k--) s++;
        return s;
      })(),
    };
  };
  W.expStats = e => {
    const r = W.rate(e.from, e.to);
    const ds = W.days.filter(d => d.t >= e.from && d.t <= e.to);
    const am = ds.filter(d => d.am != null);
    return {
      rate: r,
      days: ds.length,
      change: am.length ? am[am.length - 1].avg - am[0].avg : 0,
      adherence: e.tags
        ? ds.filter(d => e.tags.every(t => d.actions.includes(t))).length / ds.length
        : null,
    };
  };

  /* ============ 壳层 ============ */
  const NAV = [
    [
      "",
      [
        ["flame", "首页"],
        ["calendar", "日历"],
        ["list-todo", "待办"],
        ["timer", "番茄钟"],
      ],
    ],
    [
      "知识",
      [
        ["layers", "卡片库"],
        ["file-text", "文章"],
        ["pen", "日记"],
      ],
    ],
    ["学习", [["help", "问题"]]],
    ["AI", [["chat", "AI 对话"]]],
    [
      "插件",
      [
        ["scale", "减重", true],
        ["puzzle", "插件中心"],
      ],
    ],
  ];
  W.mountShell = ({ crumb = "<b>减重</b>" } = {}) => {
    injectSprite();
    const theme = localStorage.getItem("w-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section">${label ? `<div class="nav-label">${label}</div>` : ""}${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? `<span class="badge num">${W.kg(W.summary().latest.am)}</span>` : ""}</button>`
          )
          .join("")}</div>`
    ).join("");
    document.getElementById("app").innerHTML = `
      <div class="app">
        <nav class="sidebar"><div class="sidebar-head"><span class="brand-mark">τ</span><span class="brand-name">Tau</span></div>${nav}
          <div class="spacer"></div><button class="nav-item">${icon("sliders")}设置</button></nav>
        <main class="main">
          <div class="titlebar">
            <button class="titlebar-btn" disabled>${icon("back")}</button>
            <button class="titlebar-btn" disabled>${icon("fwd")}</button>
            <span class="titlebar-crumb">${crumb}</span>
            <span class="spacer"></span>
            <a class="mock-back" href="index.html">← 设计总览</a>
            <button class="titlebar-search">${icon("search")}搜索<kbd>⌘K</kbd></button>
            <button class="titlebar-btn" id="theme-toggle" title="切换明暗">${icon(theme === "cream" ? "moon" : "sun")}</button>
          </div>
          <div id="page-root"></div>
        </main>
      </div>`;
    document.getElementById("theme-toggle").addEventListener("click", e => {
      const next = document.documentElement.dataset.theme === "cream" ? "cocoa" : "cream";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("w-mock-theme", next);
      e.currentTarget.innerHTML = icon(next === "cream" ? "moon" : "sun");
    });
    return document.getElementById("page-root");
  };

  let toastEl;
  let toastTimer;
  W.toast = msg => {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  };
  W.openDialog = ({ title, body, width = 560, footer, onMount }) => {
    const mask = document.createElement("div");
    mask.className = "dlg-mask";
    mask.innerHTML = `<div class="dlg" style="width:min(92vw,${width}px)">
      <div class="dlg-head"><h3>${title}</h3><button class="icon-btn" data-close>${icon("x")}</button></div>
      <div class="dlg-body">${body}</div>${footer ? `<div class="dlg-foot">${footer}</div>` : ""}</div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add("open"));
    const close = () => {
      mask.classList.remove("open");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => mask.remove(), 180);
    };
    const onKey = e => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey, true);
    mask.addEventListener("mousedown", e => e.target === mask && close());
    mask.querySelector("[data-close]").onclick = close;
    onMount?.(mask.querySelector(".dlg"), close);
    return close;
  };
  /* ============ 趋势图：晨重点 + 7 日均线 + 睡前点（可选）+ 目标线 + 实验底带 + 行动条带 ============ */
  W.trendChart = (el, opts = {}) => {
    const o = {
      from: W.TODAY - 89 * D,
      to: W.TODAY,
      height: 260,
      pm: false,
      bands: true,
      strip: true,
      goal: true,
      ...opts,
    };
    const draw = () => {
      const width = el.clientWidth || 600;
      const ds = W.days.filter(d => d.t >= o.from && d.t <= o.to);
      const stripRows = o.strip ? ["diet", "move", "fast", "cheat"] : [];
      const padL = 34;
      const padR = 12;
      const padT = 10;
      const stripH = stripRows.length ? stripRows.length * 9 + 12 : 0;
      const plotH = o.height - padT - 22 - stripH;
      const vals = ds.flatMap(d => [d.am, o.pm ? d.pm : null, d.avg]).filter(v => v != null);
      if (o.goal) vals.push(W.GOAL);
      let lo = Math.floor(Math.min(...vals) - 0.3);
      let hi = Math.ceil(Math.max(...vals) + 0.3);
      if (!o.goal) lo = Math.floor(Math.min(...vals) - 0.3);
      const x = t => padL + ((t - o.from) / (o.to - o.from || 1)) * (width - padL - padR);
      const y = v => padT + ((hi - v) / (hi - lo)) * plotH;
      const step = hi - lo > 8 ? 2 : 1;
      let svg = `<svg width="${width}" height="${o.height}">`;
      if (o.bands)
        for (const e of W.EXPERIMENTS.filter(e => !e.base && e.to >= o.from && e.from <= o.to)) {
          const x0 = x(Math.max(e.from, o.from));
          const x1 = x(Math.min(e.to, o.to) + D * 0.999);
          svg += `<rect x="${x0}" y="${padT}" width="${Math.max(0, x1 - x0)}" height="${plotH}" rx="6" fill="var(--bg-sunken)" opacity="${e.off ? 0.35 : 0.6}"/>`;
          if (x1 - x0 > 60)
            svg += `<text x="${x0 + 8}" y="${padT + 15}" font-size="10.5" fill="var(--ink-2)">${e.name}${e.running ? " · 进行中" : ""}</text>`;
        }
      svg += `<g class="grid">`;
      for (let v = lo; v <= hi; v += step)
        svg += `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `</g><g class="ax">`;
      for (let v = lo; v <= hi; v += step)
        svg += `<text x="${padL - 8}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
      const span = (o.to - o.from) / D;
      const tickEvery = span > 60 ? 14 : span > 20 ? 7 : 1;
      ds.forEach((d, k) => {
        if ((ds.length - 1 - k) % tickEvery === 0)
          svg += `<text x="${x(d.t)}" y="${padT + plotH + 16}" text-anchor="middle">${W.md(d.t)}</text>`;
      });
      svg += `</g>`;
      if (o.goal && W.GOAL >= lo)
        svg += `<line x1="${padL}" x2="${width - padR}" y1="${y(W.GOAL)}" y2="${y(W.GOAL)}" stroke="var(--ok)" stroke-width="1.5" stroke-dasharray="4 4"/><text x="${width - padR}" y="${y(W.GOAL) - 6}" text-anchor="end" font-size="10.5" fill="var(--ok)">目标 ${W.GOAL}</text>`;
      if (o.pm)
        for (const d of ds)
          if (d.pm != null)
            svg += `<circle cx="${x(d.t)}" cy="${y(d.pm)}" r="2.5" fill="none" stroke="var(--ink-3)" stroke-width="1.2" opacity="0.7"/>`;
      for (const d of ds)
        if (d.am != null)
          svg += `<circle cx="${x(d.t)}" cy="${y(d.am)}" r="${span > 40 ? 2.4 : 3.2}" fill="var(--ink-3)" opacity="0.55"/>`;
      const line = ds
        .filter(d => d.avg != null)
        .map((d, k) => `${k ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.avg).toFixed(1)}`)
        .join("");
      svg += `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const last = [...ds].reverse().find(d => d.avg != null);
      if (last)
        svg += `<circle cx="${x(last.t)}" cy="${y(last.avg)}" r="4.5" fill="var(--accent)" stroke="var(--bg-surface)" stroke-width="2"/>`;
      if (stripRows.length) {
        const sy = padT + plotH + 26;
        const bw = Math.max(1.5, (width - padL - padR) / ds.length - 1.5);
        stripRows.forEach((cat, r) => {
          svg += `<text x="${padL - 8}" y="${sy + r * 9 + 6}" text-anchor="end" font-size="9" fill="var(--ink-3)">${W.CATS[cat].name}</text>`;
          for (const d of ds)
            if (d.actions.some(a => W.tag(a).cat === cat))
              svg += `<rect x="${x(d.t) - bw / 2}" y="${sy + r * 9}" width="${bw}" height="7" rx="2" fill="var(--cat-${cat})"/>`;
        });
      }
      svg += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" stroke="var(--ink-2)" stroke-width="1" opacity="0"/>`;
      svg += `<circle class="cross-dot" r="4.5" fill="var(--accent)" stroke="var(--bg-surface)" stroke-width="2" opacity="0"/>`;
      svg += `<rect class="hit" x="${padL}" y="0" width="${width - padL - padR}" height="${o.height}" fill="transparent"/></svg>`;
      el.innerHTML = `${svg}<div class="tip"></div>`;
      const tip = el.querySelector(".tip");
      const cross = el.querySelector(".cross");
      const dot = el.querySelector(".cross-dot");
      el.querySelector(".hit").addEventListener("mousemove", ev => {
        const r = el.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        let best = ds[0];
        for (const d of ds) if (Math.abs(x(d.t) - mx) < Math.abs(x(best.t) - mx)) best = d;
        const cx = x(best.t);
        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.setAttribute("opacity", 0.35);
        if (best.avg != null) {
          dot.setAttribute("cx", cx);
          dot.setAttribute("cy", y(best.avg));
          dot.setAttribute("opacity", 1);
        }
        tip.innerHTML = `<div class="t-date">${W.mdw(best.t)}</div>
          <div class="t-row"><span class="sw" style="background:var(--ink-3)"></span>晨重<b>${W.kg(best.am)}</b></div>
          ${o.pm ? `<div class="t-row"><span class="sw" style="background:none;box-shadow:inset 0 0 0 1.2px var(--ink-3)"></span>睡前<b>${W.kg(best.pm)}</b></div>` : ""}
          <div class="t-row"><span class="sw" style="background:var(--accent)"></span>7 日均值<b>${W.kg(best.avg)}</b></div>
          ${best.actions.length ? `<div class="t-tags">${best.actions.map(a => W.chip(a)).join("")}</div>` : ""}`;
        tip.classList.add("show");
        const tw = tip.offsetWidth;
        tip.style.left = `${cx + 14 + tw > width ? cx - tw - 14 : cx + 14}px`;
        tip.style.top = `${padT + 6}px`;
        o.onHover?.(best);
      });
      el.querySelector(".hit").addEventListener("mouseleave", () => {
        tip.classList.remove("show");
        cross.setAttribute("opacity", 0);
        dot.setAttribute("opacity", 0);
      });
      el.querySelector(".hit").addEventListener("click", () => o.onPick?.());
    };
    draw();
    new ResizeObserver(draw).observe(el);
    return { redraw: next => (Object.assign(o, next), draw()) };
  };

  /* ============ 迷你折线（7 日均值） ============ */
  W.spark = (days, w = 120, h = 32, color = "var(--accent)") => {
    const v = days.map(d => d.avg).filter(x => x != null);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pts = v.map(
      (val, k) =>
        `${((k / (v.length - 1)) * w).toFixed(1)},${(2 + ((hi - val) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`
    );
    return `<svg width="${w}" height="${h}" style="display:block;overflow:visible"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${w}" cy="${pts[pts.length - 1].split(",")[1]}" r="3" fill="${color}"/></svg>`;
  };

  /* ============ 行动效果排行（发散条，0 居中） ============ */
  W.effectBars = (el, { limit = 11 } = {}) => {
    const rows = W.effects().slice(0, limit);
    const max = Math.max(...rows.map(r => Math.abs(r.diff)), 0.3);
    el.innerHTML =
      rows
        .map(r => {
          const pct = (Math.abs(r.diff) / max) * 50;
          const weak = r.n < 8;
          return `<div class="eff-row" title="做了 ${r.n} 天；做了的次晨平均 ${W.signed(r.withMean, 2)} kg">
            <div>${W.chip(r.id)}</div>
            <div class="bar-zone"><div class="axis0"></div><div class="bar ${r.diff < 0 ? "lose" : "gain"}${weak ? " weak" : ""}" style="width:${pct}%"></div></div>
            <div class="val delta ${W.deltaCls(r.diff, 0.02)}">${W.signed(r.diff, 2)}<span class="n">${weak ? "样本少 · " : ""}${r.n} 天</span></div>
          </div>`;
        })
        .join("") +
      `<div class="eff-scale"><span></span><div><span>← 次晨更轻</span><span>0</span><span>次晨更重 →</span></div><span></span></div>`;
  };

  /* ============ 日历热力：次晨变化（发散 7 阶） ============ */
  const heatStep = v =>
    v == null
      ? null
      : v <= -0.45
        ? "lose-3"
        : v <= -0.2
          ? "lose-2"
          : v <= -0.05
            ? "lose-1"
            : v < 0.05
              ? "mid"
              : v < 0.2
                ? "gain-1"
                : v < 0.45
                  ? "gain-2"
                  : "gain-3";
  W.heatmap = (el, { weeks = 13, onPick } = {}) => {
    const end = new Date(W.TODAY);
    const lastSat = W.TODAY + (6 - end.getDay()) * D;
    const start = lastSat - (weeks * 7 - 1) * D;
    let cells = "";
    for (let t = start; t <= lastSat; t += D) {
      const d = W.dayAt(t);
      const step = d
        ? heatStep(
            d.next ??
              (d.am != null && d.i > 0 && W.days[d.i - 1].am != null
                ? d.am - W.days[d.i - 1].am
                : null)
          )
        : null;
      cells += `<div class="cell ${step ? "" : "empty"} ${t === W.TODAY ? "today" : ""}" data-t="${t}" ${step ? `style="background:var(--div-${step})"` : ""}></div>`;
    }
    el.innerHTML = `<div class="chart"><div class="heat">${cells}</div><div class="tip"></div></div>`;
    const tip = el.querySelector(".tip");
    el.querySelectorAll(".cell[data-t]").forEach(c =>
      c.addEventListener("mouseenter", () => {
        const d = W.dayAt(+c.dataset.t);
        if (!d) return;
        tip.innerHTML = `<div class="t-date">${W.mdw(d.t)}</div>
          <div class="t-row">晨重<b>${W.kg(d.am)}</b></div>
          <div class="t-row">次晨变化<b class="delta ${d.next == null ? "flat" : W.deltaCls(d.next)}">${d.next == null ? "—" : W.signed(d.next, 1)}</b></div>
          ${d.actions.length ? `<div class="t-tags">${d.actions.map(a => W.chip(a)).join("")}</div>` : ""}`;
        tip.classList.add("show");
        const host = el.querySelector(".chart").getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        tip.style.left = `${Math.min(cr.left - host.left + 20, host.width - 160)}px`;
        tip.style.top = `${cr.top - host.top - 10}px`;
      })
    );
    el.querySelector(".heat").addEventListener("mouseleave", () => tip.classList.remove("show"));
    el.querySelectorAll(".cell[data-t]").forEach(c =>
      c.addEventListener("click", () => onPick?.(+c.dataset.t))
    );
  };
  W.heatLegend = () =>
    `<div class="heat-legend">更轻 ${["lose-3", "lose-2", "lose-1", "mid", "gain-1", "gain-2", "gain-3"].map(s => `<i style="background:var(--div-${s})"></i>`).join("")} 更重</div>`;

  /* ============ 记录弹窗：体重 / 行动 / 饮食 一次记完 ============ */
  W.openLog = (initial = "weight", onSaved) => {
    const t = W.today();
    const hour = 7;
    const isMorning = hour < 14;
    const prev = W.days[W.days.length - 2];
    const body = `
      <div class="seg log-tabs"><button data-k="am" class="${isMorning ? "on" : ""}">${icon("sunrise")}起床</button><button data-k="pm" class="${isMorning ? "" : "on"}">${icon("sunset")}睡前</button></div>
      <div class="weigh-field"><input class="num" id="w-in" value="${W.kg(prev.am)}" inputmode="decimal"><span class="u">kg</span>
        <span class="hint">昨天晨重 ${W.kg(prev.am)}<br><span style="color:var(--ink-3)">空腹、如厕后称最准</span></span></div>
      ${
        W.LOG_WEIGHT_ONLY
          ? ""
          : `<div class="field-label">今天做了什么</div>
      <div class="chips" id="log-tags">${W.TAGS.map(tg => W.chip(tg.id, t.actions.includes(tg.id) ? "on" : "", "button")).join("")}<button class="chip add">${icon("plus")}自定义</button></div>
      <div class="field-label">吃了什么 <span style="font-weight:400;color:var(--ink-3)">· 可选，写一句话就行，AI 帮你估热量</span></div>
      <div class="meal-input"><input placeholder="例：午饭 牛肉面面减半，加了个卤蛋"><button class="btn btn-soft lg">${icon("camera")}拍照</button></div>`
      }`;
    W.openDialog({
      title: (W.LOG_WEIGHT_ONLY ? "称重 · " : "记录 · ") + W.mdw(t.t),
      body,
      footer: `<span class="ai-meta">${icon("info")} 睡前体重只用于看日内波动，趋势只看晨重</span><span class="spacer"></span><button class="btn btn-ghost" data-close2>取消</button><button class="btn btn-primary" data-save>保存</button>`,
      onMount(dlg, close) {
        dlg.querySelectorAll(".seg button").forEach(b =>
          b.addEventListener("click", () => {
            dlg.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
          })
        );
        dlg
          .querySelectorAll("#log-tags button.chip:not(.add)")
          .forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
        const inp = dlg.querySelector("#w-in");
        setTimeout(() => (inp.focus(), inp.select()), 60);
        dlg.querySelector("[data-close2]").onclick = close;
        dlg.querySelector("[data-save]").onclick = () => {
          const v = parseFloat(inp.value);
          if (!Number.isNaN(v)) {
            if (dlg.querySelector(".seg .on").dataset.k === "am") t.am = v;
            else t.pm = v;
          }
          if (!W.LOG_WEIGHT_ONLY)
            t.actions = [...dlg.querySelectorAll("#log-tags .chip.on")].map(b => b.dataset.tag);
          t.avg = W.avg7(t.i);
          close();
          W.toast("已记录 " + W.kg(v) + " kg");
          onSaved?.();
        };
        if (initial === "action") dlg.querySelector("#log-tags")?.scrollIntoView();
      },
    });
  };

  /* ============ AI 流式演示 ============ */
  W.AI_REPORT = [
    `<p>过去 90 天，7 日均值从 <b>${W.kg(W.days[6].avg)}</b> 降到 <b>${W.kg(W.summary().latest.avg)}</b> kg。按阶段的周速率看，<b>「控碳水 + 散步」最快</b> <span class="cite" data-exp="e4">实验 · 控碳水 + 散步</span>，其次是 16:8 断食 <span class="cite" data-exp="e2">实验 · 16:8 断食</span>；单独饭后散步效果有，但只比基线快一点。</p>`,
    `<p>单项行动里，<b>聚餐和夜宵</b>是次晨反弹最大的两项 <span class="cite">效果排行</span>。国庆 6 天涨回去的部分，节后大约 9 天才消掉。这里面一部分是水分和胃容物，所以别被单日数字吓到，看均线。</p>`,
    `<p><b>建议</b>：继续当前实验到满 4 周再下结论；聚餐无法避免时，前一天和后一天都按控碳水吃，散步照走。你的晚饭记录里米饭出现得多，可以先从「晚饭主食减半」开始。</p>`,
  ];
  W.streamAI = (el, chunks = W.AI_REPORT, done) => {
    // 标签整段输出、文字逐字输出，避免切到半个标签
    const tokens = chunks.join("").match(/<[^>]+>|[^<]/g);
    let i = 0;
    const tick = () => {
      i = Math.min(tokens.length, i + 4);
      while (i < tokens.length && tokens[i - 1][0] === "<") i++;
      el.innerHTML =
        tokens.slice(0, i).join("") + (i < tokens.length ? '<span class="ai-caret"></span>' : "");
      if (i < tokens.length) setTimeout(tick, 18);
      else done?.();
    };
    tick();
  };
})();
