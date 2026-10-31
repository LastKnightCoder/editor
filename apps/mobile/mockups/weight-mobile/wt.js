// 减重移动端 mockup：示意数据、顶栏、余额环、趋势图、打卡格与刻度尺在这里拼装，须在 ai-mobile/ai.js（渲染图标、主题与标签切换）之前执行。
(function () {
  // 固定种子的 90 天示意数据：晨重缓降 + 噪声，少吃/多动的日子次日略轻
  let seed = 20261031;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const DAYS = 90;
  const days = [];
  let base = 78.6;
  for (let i = 0; i < DAYS; i++) {
    const eat = rnd() < 0.68;
    const move = rnd() < 0.55;
    const intake = Math.round((eat ? 1350 + rnd() * 300 : 1750 + rnd() * 500) / 10) * 10;
    base -= 0.045 + (eat ? 0.03 : -0.02) + (move ? 0.015 : 0);
    const am = +(base + (rnd() - 0.5) * 0.7).toFixed(1);
    days.push({ am, intake, eat, move, budget: 1680 });
  }
  days.forEach((d, i) => {
    const win = days.slice(Math.max(0, i - 6), i + 1);
    d.avg = win.reduce((s, x) => s + x.am, 0) / win.length;
  });
  // 今天（最后一天）还没结束：晨重已称，睡前未称
  const today = days[DAYS - 1];
  today.intake = 920;
  window.WT = { days };

  // 重复片段：data-tpl="hero|hero-empty|log|log-chips|today"
  const row = (kind, text, sub, kcal) =>
    `<div class="w-row"><span class="ico ${kind}" data-i="${kind === "food" ? "utensils-crossed" : "footprints"}" data-s="15"></span><span class="tx">${text}<small>${sub}</small></span><span class="kc num ${kind}">${kind === "move" ? "+" : ""}${kcal}</span></div>`;
  const TPL = {
    hero: `<div class="w-card"><div class="w-hero"><div data-ring="920,1820"></div><div class="txt"><div class="lbl">今天还能吃 · 10 月 31 日 周六</div><div class="big num">900<small>kcal</small></div><div class="eq">预算 <b class="num">1680</b> + 运动 <b class="num">140</b> − 已吃 <b class="num">920</b></div></div></div>
      <div class="w-tiles"><div class="w-tile"><span class="k" data-i="sunrise" data-s="12">晨重</span><span class="v num">72.2<small class="lose">−0.1</small></span></div>
      <div class="w-tile empty"><span class="k" data-i="sunset" data-s="12">睡前</span><span class="v" data-i="plus" data-s="14">称一下</span></div>
      <div class="w-tile"><span class="k" data-i="footprints" data-s="12">运动</span><span class="v num">20<small class="muted">/ 30 分</small></span><div class="bar"><i style="width:66%"></i></div></div></div></div>`,
    "hero-empty": `<div class="w-card"><div class="w-hero"><div data-ring="0,1680"></div><div class="txt"><div class="lbl">今天还能吃 · 11 月 1 日 周日</div><div class="big num">1680<small>kcal</small></div><div class="eq">还没记饮食，预算按 7 日均值 <b class="num">72.4</b> kg 计算</div></div></div>
      <div class="w-tiles"><div class="w-tile empty"><span class="k" data-i="sunrise" data-s="12">晨重</span><span class="v" data-i="plus" data-s="14">起床称</span></div>
      <div class="w-tile empty" style="box-shadow:inset 0 0 0 1.5px var(--line-1);color:var(--ink-3)"><span class="k" style="color:var(--ink-3)" data-i="sunset" data-s="12">睡前</span><span class="v">晚上再称</span></div>
      <div class="w-tile"><span class="k" data-i="footprints" data-s="12">运动</span><span class="v num">0<small class="muted">/ 30 分</small></span><div class="bar"><i style="width:0"></i></div></div></div></div>`,
    log: `<div class="w-log"><div class="bar"><span class="ph">吃了什么、动了多久…</span><span class="b" data-i="mic" data-s="20"></span><span class="b main" data-i="arrow-up" data-s="19" style="opacity:.35"></span></div></div>`,
    "log-chips": `<div class="w-log"><div class="chips"><span class="chip">燕麦拿铁 <span class="k">180</span></span><span class="chip">鸡胸沙拉 <span class="k">420</span></span><span class="chip">散步 30 分</span><span class="chip">苹果</span></div><div class="bar"><span class="ph">吃了什么、动了多久…</span><span class="b" data-i="mic" data-s="20"></span><span class="b main" data-i="arrow-up" data-s="19" style="opacity:.35"></span></div></div>`,
    "log-chips-empty": `<div class="w-log"><div class="chips"><span class="chip">早饭两个包子</span><span class="chip">午饭牛肉面</span><span class="chip">散步 30 分钟</span></div><div class="bar"><span class="ph">吃了什么、动了多久…</span><span class="b" data-i="mic" data-s="20"></span><span class="b main" data-i="arrow-up" data-s="19" style="opacity:.35"></span></div></div>`,
    "trend-mini": `<div class="w-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px"><div style="flex:1;min-width:0"><div style="font-size:12px;color:var(--ink-3)">7 日均值 · 30 天</div><div style="font-size:20px;font-weight:700;letter-spacing:-.02em" class="num">72.4 <small class="lose" style="font-size:12.5px;font-weight:600">−2.6 kg</small></div><div style="font-size:11.5px;color:var(--ink-2);margin-top:2px">距目标 2.4 kg · 少吃比多动管用</div></div><div data-spark="30" data-w="104" data-h="44"></div><span data-i="chevron-right" data-s="18" style="color:var(--ink-3)"></span></div>`,
    today: `<div class="w-card" style="padding-bottom:6px"><div class="w-head">今天<small>3 条饮食 · 1 次运动</small><span class="sp"></span></div><div class="w-list">
      ${row("food", "燕麦拿铁", "08:12 · 常吃", 180)}${row("food", "鸡胸沙拉 + 全麦面包", "12:30 · AI 估算", 520)}${row("move", "快走 20 分钟", "13:10", 140)}${row("food", "苹果一个", "15:40 · 常吃", 220)}
      <div class="w-row ph"><span class="ico" data-i="utensils-crossed" data-s="15"></span><span class="tx"><b>晚饭</b> 还没记 · 建议 ≤ 800 kcal</span></div></div></div>`,
  };
  document.querySelectorAll("[data-tpl]").forEach(el => {
    el.outerHTML = TPL[el.dataset.tpl];
  });

  const nav = (title, right) =>
    `<span class="ib" data-i="chevron-left" data-s="23"></span><span class="t">${title}</span>${right ?? '<span class="ib" data-i="chart-line" data-s="19"></span><span class="ib" data-i="settings" data-s="19"></span>'}`;
  document.querySelectorAll("[data-wnav]").forEach(el => {
    el.classList.add("w-nav");
    el.innerHTML = nav(el.dataset.wnav, el.dataset.right);
  });

  // 余额环：data-ring="已吃,预算+运动"
  document.querySelectorAll("[data-ring]").forEach(el => {
    const [eaten, total] = el.dataset.ring.split(",").map(Number);
    const r = 42,
      c = 2 * Math.PI * r,
      p = Math.min(1, eaten / total);
    const over = eaten > total;
    el.classList.add("ring");
    el.innerHTML =
      `<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--tau-bg-track)" stroke-width="9"/>` +
      `<circle cx="48" cy="48" r="${r}" fill="none" stroke="${over ? "var(--gain)" : "var(--food)"}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 48 48)"/></svg>` +
      `<b class="num">${over ? "−" : ""}${Math.abs(total - eaten)}<small>${over ? "超了 kcal" : "还能吃"}</small></b>`;
  });

  // 趋势图：data-chart="天数"，data-scrub="倒数第几天" 显示按住后的读数
  const W = 328;
  document.querySelectorAll("[data-chart]").forEach(el => {
    const n = Number(el.dataset.chart);
    const h = Number(el.dataset.h || 190);
    const list = days.slice(-n);
    const top = 10,
      kgH = h * 0.58,
      barTop = top + kgH + 12,
      barH = h - barTop - 18;
    const all = list.flatMap(d => [d.am, d.avg]);
    const goal = Number(el.dataset.goal || 0);
    const lo = Math.min(...all, goal || 99) - 0.3,
      hi = Math.max(...all) + 0.3;
    const x = i => 8 + (i + 0.5) * ((W - 40) / n);
    const y = v => top + ((hi - v) / (hi - lo)) * kgH;
    const bw = Math.max(2, ((W - 40) / n) * 0.62);
    const maxI = 2400;
    let svg = `<svg viewBox="0 0 ${W} ${h}" height="${h}">`;
    [0, 0.5, 1].forEach(t => {
      const v = hi - t * (hi - lo);
      svg += `<line x1="8" x2="${W - 32}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-2)"/><text x="${W - 28}" y="${y(v) + 3.5}" font-size="10" fill="var(--ink-3)">${v.toFixed(1)}</text>`;
    });
    if (goal)
      svg += `<line x1="8" x2="${W - 32}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--tau-ok)" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    // 预算线与摄入柱
    const by = v => barTop + barH - (v / maxI) * barH;
    list.forEach((d, i) => {
      svg += `<rect x="${x(i) - bw / 2}" y="${by(d.intake)}" width="${bw}" height="${barTop + barH - by(d.intake)}" rx="${Math.min(2, bw / 2)}" fill="${d.intake <= d.budget ? "var(--food)" : "var(--ink-3)"}" opacity="${d.intake <= d.budget ? 0.75 : 0.35}"/>`;
      if (d.move && n <= 30)
        svg += `<circle cx="${x(i)}" cy="${barTop + barH + 7}" r="2.2" fill="var(--move)"/>`;
    });
    svg += `<line x1="8" x2="${W - 32}" y1="${by(1680)}" y2="${by(1680)}" stroke="var(--ink-3)" stroke-dasharray="2 3" opacity="0.6"/><text x="${W - 28}" y="${by(1680) + 3.5}" font-size="9.5" fill="var(--ink-3)">预算</text>`;
    if (n <= 30)
      list.forEach(
        (d, i) =>
          (svg += `<circle cx="${x(i)}" cy="${y(d.am)}" r="2.6" fill="var(--ink-3)" opacity="0.55"/>`)
      );
    svg += `<path d="${list.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.avg).toFixed(1)}`).join("")}" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    const scrub = el.dataset.scrub;
    if (scrub != null) {
      const i = n - 1 - Number(scrub);
      svg += `<line x1="${x(i)}" x2="${x(i)}" y1="${top - 4}" y2="${barTop + barH}" stroke="var(--ink-1)" stroke-width="1.2"/><circle cx="${x(i)}" cy="${y(list[i].avg)}" r="5" fill="var(--bg-surface)" stroke="var(--brand)" stroke-width="2.4"/>`;
      const d = list[i];
      const left = Math.min(W - 150, Math.max(0, x(i) - 70));
      el.insertAdjacentHTML(
        "afterbegin",
        `<div class="w-tip" style="left:${left + 16}px;top:-6px">10 月 ${31 - Number(scrub)} 日 · 晨重 <b class="num">${d.am.toFixed(1)}</b><br>均值 ${d.avg.toFixed(1)} · 吃了 ${d.intake} kcal${d.intake > d.budget ? "（超）" : ""}</div>`
      );
    }
    svg += "</svg>";
    el.classList.add("w-chart");
    el.style.position = "relative";
    el.insertAdjacentHTML("beforeend", svg);
  });

  // 迷你折线：data-spark="天数"
  document.querySelectorAll("[data-spark]").forEach(el => {
    const list = days.slice(-Number(el.dataset.spark));
    const w = Number(el.dataset.w || 120),
      h = Number(el.dataset.h || 36);
    const vs = list.map(d => d.avg),
      lo = Math.min(...vs),
      hi = Math.max(...vs);
    const pts = vs.map(
      (v, i) =>
        `${((i / (vs.length - 1)) * (w - 4) + 2).toFixed(1)},${(((hi - v) / (hi - lo || 1)) * (h - 6) + 3).toFixed(1)}`
    );
    el.innerHTML = `<svg width="${w}" height="${h}"><polyline points="${pts.join(" ")}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts.at(-1).split(",")[0]}" cy="${pts.at(-1).split(",")[1]}" r="3" fill="var(--brand)"/></svg>`;
  });

  // 打卡格：data-habit="周数"；最后一行周六为今天
  document.querySelectorAll("[data-habit]").forEach(el => {
    const weeks = Number(el.dataset.habit);
    const tail = days.slice(-(weeks * 7 - 1));
    let html = `<span></span>${"一二三四五六日"
      .split("")
      .map(c => `<span class="h">${c}</span>`)
      .join("")}`;
    const start = 31 - (weeks * 7 - 2);
    for (let w = 0; w < weeks; w++) {
      const md = start + w * 7;
      html += `<span class="w">${md > 0 ? `10/${md}` : `9/${30 + md}`}</span>`;
      for (let k = 0; k < 7; k++) {
        const idx = w * 7 + k;
        if (idx >= tail.length) {
          html += `<span class="c fut"></span>`;
          continue;
        }
        const d = tail[idx];
        const isToday = idx === tail.length - 1;
        html += `<span class="c${isToday ? " today" : ""}"><i class="dt food${d.eat && !isToday ? " f" : ""}"></i><i class="dt move${d.move ? " f" : ""}"></i></span>`;
      }
    }
    el.classList.add("hgrid");
    el.innerHTML = html;
  });

  // 刻度尺：data-ruler="当前值"，每格 0.1 kg
  document.querySelectorAll("[data-ruler]").forEach(el => {
    const v = Number(el.dataset.ruler);
    let ticks = "",
      labels = "";
    const center = Math.round(v * 10);
    for (let t = center - 22; t <= center + 22; t++)
      ticks += `<i class="${t % 10 === 0 ? "full" : t % 5 === 0 ? "half" : ""}"></i>`;
    // 每 10 格（100px）一个整数标签，按中心偏移对齐
    const offset = (center % 10) * 10 - 0;
    for (let k = -2; k <= 2; k++) labels += `<span>${Math.floor(v) + k}</span>`;
    el.classList.add("ruler");
    el.innerHTML = `<div class="ticks">${ticks}</div><div class="labels" style="transform:translateX(${-offset}px)">${labels}</div><div class="needle"></div>${el.dataset.prev ? `<span class="prev" style="left:calc(50% + ${(Number(el.dataset.prev) * 10 - center) * 10}px)"></span>` : ""}`;
  });
})();
