// 记账移动端 mockup：按示意数据填充滚动后的流水、某天的面板与设置页分类列表，须在 ex.js 之后、ai-mobile/ai.js 之前执行。
(function () {
  const E = window.EX;
  const { yuan, cico, dayLabel } = window.EXR;
  const row = t =>
    `<div class="w-row x-tx">${cico(t.cat)}<span class="tx">${t.note}<small>${t.time} · ${E.cat(t.cat).name}${t.fixed ? " · 固定支出" : ""}</small></span><span class="kc num">${yuan(t.amt)}</span></div>`;
  const fill = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  const days = [...new Set(E.txs.map(t => t.date))].filter(d => d < "2026-10-22").slice(0, 3);
  fill(
    "scroll-txs",
    days
      .map(d => {
        const rows = E.txs.filter(t => t.date === d);
        const flex = rows.filter(t => !t.fixed).reduce((s, t) => s + t.amt, 0);
        return `<div class="x-day"><span>${dayLabel(d)}</span><span class="sp"></span><span class="num">${yuan(flex)}</span></div>${rows.map(row).join("")}`;
      })
      .join("")
  );
  fill(
    "day-sheet",
    E.txs
      .filter(t => t.date === "2026-10-18")
      .map(row)
      .join("")
  );
  fill(
    "set-cats",
    E.cats
      .map(
        c =>
          `<div class="row">${cico(c.id, 26)}${c.name}<span class="val"><b class="num">${yuan(c.budget)}</b><span data-i="chevron-right" data-s="16"></span></span></div>`
      )
      .join("")
  );
})();
