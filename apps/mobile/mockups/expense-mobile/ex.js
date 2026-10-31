// 记账移动端 mockup：主卡、分类预算、流水、月历、回顾图表与记账条在这里拼装，须在 ai-mobile/ai.js（渲染图标、主题与标签切换）之前执行。
(function () {
  const E = window.EX;
  const S = E.stat;
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const yuan = n => `¥${fmt(n)}`;
  const color = c => `var(--ex-c${c})`;
  const WEEK = "日一二三四五六";
  const dayLabel = date => {
    if (date === E.TODAY) return "今天";
    if (date === "2026-10-21") return "昨天";
    const d = new Date(`${date}T00:00`);
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${WEEK[d.getDay()]}`;
  };
  const cico = (id, size = 30) => {
    const c = E.cat(id);
    return `<span class="cico" style="--cc:${color(c.c)};width:${size}px;height:${size}px" data-i="${c.icon}" data-s="${Math.round(size * 0.5)}"></span>`;
  };
  window.EXR = { yuan, fmt, cico, dayLabel };

  const meter = (ratio, pace, over) =>
    `<div class="x-meter${ratio > 1 ? " over" : ""}"><i style="width:${Math.min(100, ratio * 100)}%;background:${over ? "var(--danger)" : "var(--brand)"}"></i>${pace != null ? `<em style="left:${pace * 100}%"></em>` : ""}</div>`;

  const HERO = {
    normal: () => `<div class="w-card x-hero">
      <div class="lbl" data-i="wallet" data-s="13">10 月还能花 · 剩 ${S.daysLeft} 天</div>
      <div class="row"><b class="big num">${yuan(S.left)}</b><span class="pill ok" data-i="check" data-s="12">节奏正常</span></div>
      ${meter(S.total / S.budget, S.pace)}
      <div class="foot"><span>已花 <b class="num">${yuan(S.total)}</b> / ${yuan(S.budget)}</span><span class="sp"></span><span>剩下每天最多 <b class="num">${yuan(S.perDay)}</b></span></div>
      <div class="x-tiles">
        <div><span class="k">今天</span><b class="num">${yuan(S.today)}</b><small>${S.todayCount} 笔</small></div>
        <div><span class="k">昨天</span><b class="num">¥141</b><small>日均额度 ${yuan(S.allowance)}</small></div>
        <div><span class="k">比 9 月同期</span><b class="num up">+${fmt(S.total - S.lastSame)}</b><small>人情多了 ¥349</small></div>
      </div></div>`,
    fast: () => `<div class="w-card x-hero">
      <div class="lbl" data-i="wallet" data-s="13">10 月还能花 · 剩 ${S.daysLeft} 天</div>
      <div class="row"><b class="big num">¥1,180</b><span class="pill bad" data-i="triangle-alert" data-s="12">比时间进度快 19%</span></div>
      ${meter(0.887, S.pace, true)}
      <div class="foot"><span>已花 <b class="num">¥9,270</b> / ${yuan(S.budget)}</span><span class="sp"></span><span>剩下每天最多 <b class="num">¥118</b></span></div></div>`,
    over: () => `<div class="w-card x-hero">
      <div class="lbl" data-i="wallet" data-s="13">10 月已超预算 · 剩 ${S.daysLeft} 天</div>
      <div class="row"><b class="big num" style="color:var(--danger)">−¥420</b><span class="pill bad" data-i="triangle-alert" data-s="12">已超预算</span></div>
      ${meter(1.04, S.pace, true)}
      <div class="foot"><span>已花 <b class="num">¥10,870</b> / ${yuan(S.budget)}</span><span class="sp"></span><span>剩下的天尽量只花必要的</span></div></div>`,
    none: () => `<div class="w-card x-hero">
      <div class="lbl" data-i="wallet" data-s="13">10 月已花</div>
      <div class="row"><b class="big num">${yuan(S.total)}</b></div>
      <div class="foot" style="margin-top:6px"><span class="lnk">设一个月预算，就能看到还能花多少</span></div></div>`,
  };

  const catRow = (c, sel) => {
    const ratio = c.budget ? c.spent / c.budget : 0;
    const diff = c.spent - c.average;
    const tag =
      c.status === "over"
        ? `<span class="tag bad">超 ${fmt(c.spent - c.budget)}</span>`
        : c.status === "fast"
          ? `<span class="tag warn">偏快</span>`
          : Math.abs(diff) < 30
            ? `<span class="tag">持平</span>`
            : `<span class="tag ${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}</span>`;
    return `<div class="x-cat${sel ? " sel" : ""}">${cico(c.id, 30)}<div class="m"><div class="t"><span>${c.name}${c.fixedOnly ? `<small data-i="repeat" data-s="10">固定</small>` : ""}</span><span class="sp"></span><b class="num">${yuan(c.spent)}</b><span class="of num">/ ${fmt(c.budget)}</span></div>${meter(ratio, c.fixedOnly ? null : S.pace, c.status === "over")}</div>${tag}</div>`;
  };
  const sortedCats = () =>
    [...E.cats].sort((a, b) => b.spent / (b.budget || 1) - a.spent / (a.budget || 1));

  const txRow = (t, opts = {}) => {
    const c = E.cat(t.cat);
    return `<div class="w-row x-tx${opts.hl ? " hl" : ""}">${cico(t.cat, 30)}<span class="tx">${t.note}<small>${t.time} · ${c.name}${t.fixed ? " · 固定支出" : ""}</small></span><span class="kc num">${yuan(t.amt)}</span></div>`;
  };
  const dayGroup = (date, rows) =>
    `<div class="x-day"><span>${dayLabel(date)}</span><span class="sp"></span><span class="num">${yuan(rows.filter(t => !t.fixed).reduce((s, t) => s + t.amt, 0))}</span></div>${rows.map(t => txRow(t)).join("")}`;

  const TPL = {
    hero: () => HERO.normal(),
    "hero-fast": () => HERO.fast(),
    "hero-over": () => HERO.over(),
    "hero-none": () => HERO.none(),
    cats: el => {
      const n = Number(el.dataset.n || 4);
      const list = sortedCats();
      return `<div class="w-card" style="padding-bottom:6px"><div class="w-head">分类预算<small>竖线 = 时间进度</small><span class="sp"></span>${n < list.length ? `<span class="more">全部 ${list.length} 类<span data-i="chevron-right" data-s="13"></span></span>` : ""}</div>${list
        .slice(0, n)
        .map(c => catRow(c, c.id === el.dataset.sel))
        .join("")}</div>`;
    },
    txs: el => {
      const days = [...new Set(E.txs.map(t => t.date))].slice(0, Number(el.dataset.days || 2));
      return `<div class="w-card" style="padding-bottom:4px"><div class="w-head">流水<small>10 月 ${E.txs.filter(t => t.date.startsWith("2026-10")).length} 笔</small><span class="sp"></span><span class="more" data-i="search" data-s="14"></span></div>${days
        .map(d =>
          dayGroup(
            d,
            E.txs.filter(t => t.date === d)
          )
        )
        .join("")}</div>`;
    },
    log: el =>
      `<div class="w-log">${el.dataset.chips != null ? `<div class="chips"><span class="chip">瑞幸 生椰拿铁 <span class="k">13</span></span><span class="chip">地铁 <span class="k">5</span></span><span class="chip">牛肉面 <span class="k">28</span></span><span class="chip">打车回家</span></div>` : ""}<div class="bar"><span class="ph">午饭 牛肉面 28</span><span class="b" data-i="mic" data-s="20"></span><span class="b main" data-i="arrow-up" data-s="19" style="opacity:.35"></span></div></div>`,
  };
  document.querySelectorAll("[data-tpl]").forEach(el => {
    el.outerHTML = TPL[el.dataset.tpl](el);
  });
  // 分类行、单笔流水单独出现时：data-cat="food" / data-cico="food"
  document.querySelectorAll("[data-catrow]").forEach(el => {
    el.outerHTML = catRow(E.cat(el.dataset.catrow), el.dataset.sel != null);
  });
  document.querySelectorAll("[data-cico]").forEach(el => {
    el.outerHTML = cico(el.dataset.cico, Number(el.dataset.size || 30));
  });
  document.querySelectorAll("[data-meter]").forEach(el => {
    const [ratio, pace] = el.dataset.meter.split(",").map(Number);
    el.outerHTML = meter(ratio, Number.isNaN(pace) ? null : pace, ratio > 1);
  });

  const nav = (title, right) =>
    `<span class="ib" data-i="chevron-left" data-s="23"></span><span class="t">${title}</span>${right ?? '<span class="ib" data-i="calendar-days" data-s="19"></span><span class="ib" data-i="chart-column" data-s="19"></span><span class="ib" data-i="settings" data-s="19"></span>'}`;
  document.querySelectorAll("[data-wnav]").forEach(el => {
    el.classList.add("w-nav");
    el.innerHTML = nav(el.dataset.wnav, el.dataset.right);
  });

  // 月历：data-cal，data-sel="选中日期"，data-cat="只看某类"
  document.querySelectorAll("[data-cal]").forEach(el => {
    const sel = el.dataset.sel;
    const only = el.dataset.cat ? E.cat(el.dataset.cat) : null;
    const allowance = only ? only.budget / S.days : S.allowance;
    let html = [..."一二三四五六日"].map(c => `<span class="h">${c}</span>`).join("");
    const lead = (new Date(`${E.calendar[0].date}T00:00`).getDay() + 6) % 7;
    html += "<span></span>".repeat(lead);
    for (const day of E.calendar) {
      const amount = only ? day.by[only.id] : day.flex;
      const cls = [
        "c",
        day.date === E.TODAY && "today",
        day.date === sel && "sel",
        day.future && "fut",
      ]
        .filter(Boolean)
        .join(" ");
      let bar = "";
      if (amount > 0) {
        const len = Math.min(1, amount / (2 * allowance));
        const segs = (only ? [only] : E.cats)
          .filter(c => day.by[c.id] > 0)
          .map(c => `<i style="flex:${day.by[c.id]};background:${color(c.c)}"></i>`)
          .join("");
        bar = `<span class="bar" style="width:${len * 100}%">${segs}</span>`;
      }
      html += `<span class="${cls}"><span class="d">${day.d}${!only && day.fixed ? "<em></em>" : ""}</span>${day.future ? "" : `<span class="a num${amount > allowance ? " hi" : ""}">${amount ? fmt(amount) : ""}</span>`}${bar}</span>`;
    }
    el.classList.add("x-cal");
    el.innerHTML = html;
  });

  // 近 6 个月堆叠柱：data-months，data-sel="2026-10"
  document.querySelectorAll("[data-months]").forEach(el => {
    const W = 296,
      H = 170,
      top = 14,
      axis = 22,
      left = 30;
    const max = 11000;
    const y = v => top + (1 - v / max) * (H - top - axis);
    const bw = 26;
    const step = (W - left) / E.history.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
    [0, 5000, 10000].forEach(
      v =>
        (svg += `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-2)"/><text x="0" y="${y(v) + 3.5}" font-size="9.5" fill="var(--ink-3)">${v ? `${v / 1000}k` : "0"}</text>`)
    );
    E.history.forEach((m, i) => {
      const cx = left + step * (i + 0.5);
      let acc = 0;
      const dim = el.dataset.sel && m.month !== el.dataset.sel;
      E.cats.forEach(c => {
        const v = m.by[c.id];
        if (!v) return;
        svg += `<rect x="${cx - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${color(c.c)}" opacity="${dim ? 0.38 : 1}"/>`;
        acc += v;
      });
      svg += `<text x="${cx}" y="${H - 6}" font-size="10.5" text-anchor="middle" fill="${dim ? "var(--ink-3)" : "var(--ink-1)"}" font-weight="${dim ? 400 : 650}">${Number(m.month.slice(5))} 月</text>`;
      if (!dim)
        svg += `<text x="${cx}" y="${y(acc) - 5}" font-size="10" text-anchor="middle" fill="var(--ink-1)" font-weight="600">${(acc / 1000).toFixed(1)}k</text>`;
    });
    svg += `<line x1="${left}" x2="${W}" y1="${y(S.budget)}" y2="${y(S.budget)}" stroke="var(--ink-2)" stroke-dasharray="4 3"/></svg>`;
    el.classList.add("w-chart");
    el.innerHTML = svg;
  });

  // 一周里哪天花得多：data-weekday
  document.querySelectorAll("[data-weekday]").forEach(el => {
    const sums = Array(7).fill(0),
      counts = Array(7).fill(0);
    E.txs
      .filter(t => !t.fixed && t.date >= "2026-07-24" && t.date < E.TODAY)
      .forEach(t => {
        const k = (new Date(`${t.date}T00:00`).getDay() + 6) % 7;
        sums[k] += t.amt;
      });
    for (let d = new Date(2026, 6, 24); d < new Date(2026, 9, 22); d.setDate(d.getDate() + 1))
      counts[(d.getDay() + 6) % 7]++;
    const mean = sums.map((s, i) => s / counts[i]);
    const max = Math.max(...mean);
    el.classList.add("x-week");
    el.innerHTML = mean
      .map(
        (v, i) =>
          `<span class="${v === max ? "top" : ""}"><b class="num">${fmt(v)}</b><i style="height:${(v / max) * 100}%"></i><em>${"一二三四五六日"[i]}</em></span>`
      )
      .join("");
  });
})();
