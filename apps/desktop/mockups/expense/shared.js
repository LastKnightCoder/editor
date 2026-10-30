/*
  记账插件三方案共用：图标 / 壳层 / 格式化 / 图表（SVG 手绘）/ 一句话记账 / AI 流式演示。
  【视觉参考，非导出源】口径以 data.js 的 E.month / E.daily 为准。
*/
(function () {
  "use strict";
  const E = window.E;
  const D = E.D;

  /* ============ 图标（lucide 线性） ============ */
  const ICONS = {
    utensils:
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    bus: '<path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    wallet:
      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    repeat:
      '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    sparkles:
      '<path d="M12 3.5l1.7 4.4 4.4 1.6-4.4 1.7L12 15.6l-1.7-4.4-4.4-1.7 4.4-1.6z"/><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    refresh:
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    fwd: '<path d="m9 18 6-6-6-6"/>',
    "chev-down": '<path d="m6 9 6 6 6-6"/>',
    "chev-right": '<path d="m9 18 6-6-6-6"/>',
    "chev-left": '<path d="m15 18-6-6 6-6"/>',
    trend: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    "trend-down": '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
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
    scale:
      '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    camera:
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    table: '<path d="M12 3v18M3 9h18M3 15h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  };
  function injectSprite() {
    if (document.getElementById("e-sprite")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.id = "e-sprite";
    s.style.display = "none";
    s.innerHTML = Object.entries(ICONS)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
    document.body.prepend(s);
  }
  const icon = (name, cls = "") => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
  E.icon = icon;

  /* ============ 格式化 ============ */
  const WEEK = "日一二三四五六";
  E.md = t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  E.mdw = t => {
    const d = new Date(t);
    return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
  };
  E.dayLabel = t => (t === E.TODAY ? "今天" : t === E.TODAY - D ? "昨天" : E.mdw(t));
  E.money = v => Math.round(v).toLocaleString("en-US");
  E.yen = v => `<span class="yen">${E.money(v)}</span>`;
  E.pct = v => `${Math.round(v * 100)}%`;
  E.catIc = (id, sm = false) =>
    `<span class="cat-ic ${sm ? "sm" : ""} k-${id}">${icon(E.cat(id).icon)}</span>`;
  E.txRow = x =>
    `<div class="tx" data-tx="${x.id}">${E.catIc(x.cat)}<div class="nt"><span>${x.note}${x.fixed ? '<em class="fix">固定</em>' : ""}</span><small>${x.time} · ${E.cat(x.cat).name} · ${x.sub} · ${x.acct}</small></div><span class="amt">−${E.money(x.amt)}</span></div>`;

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
    ["AI", [["chat", "AI 对话"]]],
    [
      "插件",
      [
        ["wallet", "记账", true],
        ["scale", "减重"],
        ["puzzle", "插件中心"],
      ],
    ],
  ];
  E.mountShell = ({ crumb = "<b>记账</b>" } = {}) => {
    injectSprite();
    const theme = localStorage.getItem("w-mock-theme") || "cream";
    document.documentElement.dataset.theme = theme;
    const m = E.month();
    const nav = NAV.map(
      ([label, list]) =>
        `<div class="nav-section">${label ? `<div class="nav-label">${label}</div>` : ""}${list
          .map(
            ([ic, name, active]) =>
              `<button class="nav-item${active ? " active" : ""}">${icon(ic)}${name}${active ? `<span class="badge num">余 ${E.money(E.BUDGET - m.total)}</span>` : ""}</button>`
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
  E.toast = msg => {
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
  E.openDialog = ({ title, body, width = 520, footer, onMount }) => {
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

  /* ============ 通用悬停提示 ============ */
  E.bindTip = (host, targets, render) => {
    let tip = host.querySelector(":scope > .tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      host.appendChild(tip);
    }
    host.querySelectorAll(targets).forEach(el => {
      el.addEventListener("mousemove", ev => {
        tip.innerHTML = render(el);
        tip.classList.add("show");
        const r = host.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        const my = ev.clientY - r.top;
        const tw = tip.offsetWidth;
        tip.style.left = `${mx + 14 + tw > r.width ? mx - tw - 14 : mx + 14}px`;
        tip.style.top = `${Math.max(-10, my - tip.offsetHeight - 10)}px`;
      });
      el.addEventListener("mouseleave", () => tip.classList.remove("show"));
    });
  };

  /* ============ 本月累计 vs 预算线（燃尽视角） ============ */
  // 实线 = 实际累计；虚线 = 均匀花完预算的理想线；今天之后用「按当前日均」虚线外推
  E.burnChart = (el, opts = {}) => {
    const o = { height: 220, ...opts };
    const m = E.month();
    const ds = E.daily(m.from, m.to);
    let acc = 0;
    ds.forEach(d => (d.acc = acc += d.total));
    const avgFlex = E.sum(m.list.filter(x => !x.fixed)) / ((m.to - m.from) / D + 0.5);
    const projected = acc + avgFlex * (m.n - ds.length + 0.5);
    const draw = () => {
      const width = el.clientWidth || 600;
      const padL = 40;
      const padR = 64;
      const padT = 12;
      const plotH = o.height - padT - 24;
      const hi = Math.ceil(Math.max(E.BUDGET, projected, acc) / 2000) * 2000;
      const x = k => padL + (k / (m.n - 1)) * (width - padL - padR);
      const y = v => padT + (1 - v / hi) * plotH;
      let s = `<svg width="${width}" height="${o.height}"><g class="grid">`;
      for (let v = 0; v <= hi; v += 2000)
        s += `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `</g><g class="ax">`;
      for (let v = 0; v <= hi; v += 2000)
        s += `<text x="${padL - 8}" y="${y(v) + 3.5}" text-anchor="end">${v ? v / 1000 + "k" : 0}</text>`;
      for (const k of [0, 6, 13, 20, 27, m.n - 1])
        s += `<text x="${x(k)}" y="${padT + plotH + 17}" text-anchor="middle">${new Date(m.from).getMonth() + 1}/${k + 1}</text>`;
      s += `</g>`;
      // 理想线
      s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(m.n - 1)}" y2="${y(E.BUDGET)}" stroke="var(--ink-3)" stroke-width="1.2" stroke-dasharray="4 4"/>`;
      s += `<line x1="${padL}" x2="${width - padR}" y1="${y(E.BUDGET)}" y2="${y(E.BUDGET)}" stroke="var(--ink-2)" stroke-width="1" opacity="0.5"/>`;
      s += `<text x="${width - padR + 6}" y="${y(E.BUDGET) + 4}" font-size="10.5" fill="var(--ink-2)">预算 ${E.money(E.BUDGET)}</text>`;
      // 面积 + 实线
      const pts = ds.map((d, k) => `${x(k).toFixed(1)},${y(d.acc).toFixed(1)}`);
      s += `<path d="M${x(0)},${y(0)} L${pts.join(" L")} L${x(ds.length - 1)},${y(0)}Z" fill="var(--accent)" opacity="0.08"/>`;
      s += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const lx = x(ds.length - 1);
      const ly = y(acc);
      const over = projected > E.BUDGET;
      s += `<line x1="${lx}" y1="${ly}" x2="${x(m.n - 1)}" y2="${y(projected)}" stroke="${over ? "var(--danger)" : "var(--accent)"}" stroke-width="1.6" stroke-dasharray="2 4" stroke-linecap="round"/>`;
      s += `<circle cx="${x(m.n - 1)}" cy="${y(projected)}" r="3.5" fill="var(--bg-surface)" stroke="${over ? "var(--danger)" : "var(--accent)"}" stroke-width="1.6"/>`;
      s += `<text x="${width - padR + 6}" y="${y(projected) + (Math.abs(y(projected) - y(E.BUDGET)) < 14 ? (projected > E.BUDGET ? -8 : 16) : 4)}" font-size="10.5" font-weight="600" fill="${over ? "var(--danger)" : "var(--ink-1)"}">预计 ${E.money(projected)}</text>`;
      s += `<circle cx="${lx}" cy="${ly}" r="4.5" fill="var(--accent)" stroke="var(--bg-surface)" stroke-width="2"/>`;
      s += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" stroke="var(--ink-2)" stroke-width="1" opacity="0"/>`;
      s += `<circle class="cross-dot" r="4" fill="var(--accent)" stroke="var(--bg-surface)" stroke-width="2" opacity="0"/>`;
      s += `<rect class="hit" x="${padL - 6}" y="0" width="${x(ds.length - 1) - padL + 12}" height="${o.height}" fill="transparent"/></svg><div class="tip"></div>`;
      el.innerHTML = s;
      const tip = el.querySelector(".tip");
      const cross = el.querySelector(".cross");
      const dot = el.querySelector(".cross-dot");
      const hit = el.querySelector(".hit");
      hit.addEventListener("mousemove", ev => {
        const mx = ev.clientX - el.getBoundingClientRect().left;
        const k = Math.max(
          0,
          Math.min(ds.length - 1, Math.round(((mx - padL) / (width - padL - padR)) * (m.n - 1)))
        );
        const d = ds[k];
        const ideal = (E.BUDGET * k) / (m.n - 1);
        cross.setAttribute("x1", x(k));
        cross.setAttribute("x2", x(k));
        cross.setAttribute("opacity", 0.35);
        dot.setAttribute("cx", x(k));
        dot.setAttribute("cy", y(d.acc));
        dot.setAttribute("opacity", 1);
        const top = [...d.list].sort((a, b) => b.amt - a.amt)[0];
        tip.innerHTML = `<div class="t-date">${E.mdw(d.t)}${d.t === E.TODAY ? " · 记录中" : ""}</div>
          <div class="t-row"><span class="sw" style="background:var(--accent)"></span>累计<b>¥${E.money(d.acc)}</b></div>
          <div class="t-row"><span class="sw" style="background:var(--ink-3)"></span>理想进度<b>¥${E.money(ideal)}</b></div>
          <div class="t-row"><span class="sw" style="background:none"></span>当天<b>¥${E.money(d.total)}</b></div>
          ${top ? `<div class="t-date" style="margin:4px 0 0">最大一笔：${top.note} ¥${E.money(top.amt)}</div>` : ""}`;
        tip.classList.add("show");
        const tw = tip.offsetWidth;
        tip.style.left = `${x(k) + 14 + tw > width ? x(k) - tw - 14 : x(k) + 14}px`;
        tip.style.top = `${padT}px`;
      });
      hit.addEventListener("mouseleave", () => {
        tip.classList.remove("show");
        cross.setAttribute("opacity", 0);
        dot.setAttribute("opacity", 0);
      });
    };
    draw();
    new ResizeObserver(draw).observe(el);
    return { projected, avgFlex };
  };

  /* ============ 一句话记账（演示解析，实现时本地规则优先、AI 兜底） ============ */
  const GUESS = [
    [/奶茶|咖啡|瑞幸|喜茶|星巴克/, "food", "咖啡奶茶"],
    [/早饭|早餐|包子/, "food", "早餐"],
    [/午饭|晚饭|外卖|面|饭|火锅|烧烤|夜宵/, "food", "正餐"],
    [/买菜|超市/, "food", "买菜"],
    [/打车|滴滴/, "trans", "打车"],
    [/地铁|公交/, "trans", "地铁公交"],
    [/高铁|机票|火车/, "trans", "长途"],
    [/电影|演出|游戏|会员|订阅/, "fun", "电影演出"],
    [/淘宝|京东|拼多多|买了|衣服|鞋/, "shop", "网购"],
    [/房租|水电|话费/, "home", "水电燃气"],
    [/红包|请客|礼物|份子/, "social", "红包礼物"],
  ];
  E.parse = s => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:元|块)?/);
    const amt = m ? parseFloat(m[1]) : null;
    const note = s.replace(/(\d+(?:\.\d+)?)\s*(?:元|块)?/, "").trim() || "未命名";
    for (const [re, cat, sub] of GUESS) if (re.test(s)) return { note, amt, cat, sub, sure: true };
    return { note, amt, cat: "other", sub: "其他", sure: false };
  };
  // 绑定输入框 + 预览 + 示例；onSave 由各方案刷新自己的视图
  E.bindQuick = (root, onSave) => {
    const inp = root.querySelector(".qin input");
    const prev = root.querySelector(".qprev");
    let cur = null;
    const paint = () => {
      const v = inp.value.trim();
      if (!v) return prev.classList.remove("show");
      cur = cur && cur.lock ? { ...E.parse(v), cat: cur.cat, lock: true } : E.parse(v);
      const m = E.month();
      const c = E.cat(cur.cat);
      const catUsed = m.cats[cur.cat] + (cur.amt || 0);
      const left = E.BUDGET - m.total - (cur.amt || 0);
      prev.innerHTML = `<div class="pr">${E.catIc(cur.cat, true)}<span>${cur.note}</span><b>${cur.amt == null ? '<span style="color:var(--warn)">缺金额</span>' : "−¥" + E.money(cur.amt)}</b></div>
        <div class="cat-pick">${E.CATS.map(k => `<button class="k-${k.id} ${k.id === cur.cat ? "on" : ""}" data-c="${k.id}">${E.catIc(k.id, true)}${k.name}</button>`).join("")}</div>
        <div class="after ${catUsed > c.budget ? "over" : ""}">记下后：${c.name}本月 <b>¥${E.money(catUsed)}</b> / ${E.money(c.budget)}${catUsed > c.budget ? "，已超" : ""} · 本月还剩 <b>¥${E.money(left)}</b></div>
        ${cur.sure ? "" : `<div class="mock-note">${icon("sparkles")}没认出分类，回车前点一下；记过一次后同样的写法会自动归类</div>`}`;
      prev.classList.add("show");
      prev.querySelectorAll(".cat-pick button").forEach(b =>
        b.addEventListener("mousedown", e => {
          e.preventDefault();
          cur = { ...cur, cat: b.dataset.c, sure: true, lock: true };
          paint();
        })
      );
    };
    inp.addEventListener("input", () => {
      cur = null;
      paint();
    });
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter" || !cur || cur.amt == null) return;
      E.tx.unshift({
        id: Date.now(),
        t: E.TODAY,
        time: E.NOW,
        cat: cur.cat,
        sub: cur.sub,
        note: cur.note,
        amt: cur.amt,
        acct: "微信",
        fixed: false,
      });
      E.toast(`已记 ${cur.note} ¥${E.money(cur.amt)}`);
      inp.value = "";
      cur = null;
      prev.classList.remove("show");
      onSave?.();
    });
    root.querySelectorAll(".ex-row button").forEach(b =>
      b.addEventListener("click", () => {
        inp.value = b.textContent;
        inp.focus();
        cur = null;
        paint();
      })
    );
  };
  E.quickHTML = (ph = "写一句：午饭 牛肉面 28") => `
    <div class="qin">${icon("plus")}<input placeholder="${ph}"><kbd>↵</kbd></div>
    <div class="qprev"></div>
    <div class="ex-row"><button>奶茶 18</button><button>打车回家 36</button><button>淘宝买了个台灯 129</button><button>份子钱 600</button></div>`;

  /* ============ AI 流式演示 ============ */
  E.streamAI = (el, chunks, done) => {
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
