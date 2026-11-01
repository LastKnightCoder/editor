// 分布：项目 × 语言热力矩阵 + 规模散点，偏向「对比与发现异常」
(function () {
  const S = window.Stats;
  let sortLang = null; // 点击列头按该语言排序

  // 对数分 6 档，避免 desktop 一家把其余项目都压成最浅色
  function step(v, max) {
    if (!v) return 0;
    return Math.max(1, Math.min(6, Math.ceil((Math.log10(v) / Math.log10(max)) * 6)));
  }

  function matrix(list) {
    const langs = S.ALL_LANGS.filter(l => S.state.langs.has(l) && list.some(f => f.lang === l));
    const projects = S.groupBy(list, f => f.project);
    const max = Math.max(1, ...projects.flatMap(p => langs.map(l => p.byLang[l])));
    const sorted = sortLang
      ? [...projects].sort((a, b) => b.byLang[sortLang] - a.byLang[sortLang])
      : projects;
    const body = S.GROUPS.filter(g => S.state.groups.has(g))
      .map(group => {
        const rows = sorted.filter(p => p.key.startsWith(group + "/"));
        if (!rows.length) return "";
        return (
          `<tr class="group"><th colspan="${langs.length + 2}">${group} · ${rows.length} 个项目</th></tr>` +
          rows
            .map(p => {
              const cells = langs
                .map(l => {
                  const v = p.byLang[l],
                    s = step(v, max);
                  const ink = s >= 4 ? "#fff" : "var(--ink-2)";
                  const tip = {
                    title: `${p.key} · ${S.LANG_LABEL[l]}`,
                    rows: [
                      ["非空行", S.fmt(v)],
                      ["占项目", S.pct(v, p.nonEmpty)],
                      ["文件", S.fmt(p.items.filter(f => f.lang === l).length)],
                    ],
                  };
                  return `<td class="c num" style="${v ? `background:var(--seq-${s});color:${ink}` : ""}" ${S.tipAttr(tip)}>${v ? S.short(v) : ""}</td>`;
                })
                .join("");
              return `<tr><th class="row"><i>${group}/</i>${S.esc(p.key.slice(group.length + 1))}</th>${cells}<td class="tot num">${S.short(p.nonEmpty)}</td></tr>`;
            })
            .join("")
        );
      })
      .join("");
    const head = langs
      .map(
        l =>
          `<th class="col" data-lang="${l}" ${sortLang === l ? 'aria-sort="descending"' : ""}>${S.LANG_LABEL[l]}${sortLang === l ? " ↓" : ""}</th>`
      )
      .join("");
    const scale = `<div class="scale">0 <span class="s" style="background:var(--seq-0)"></span>${[1, 2, 3, 4, 5, 6].map(i => `<span class="s" style="background:var(--seq-${i})"></span>`).join("")} ${S.short(max)}（对数）</div>`;
    return `<div class="card"><div class="card-head"><h2>项目 × 语言<small>点列头按该语言排序</small></h2><span class="sp"></span>${scale}</div>
      <table class="mx-table"><thead><tr><th></th>${head}<th style="text-align:right">合计</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // 横轴文件数、纵轴非空行，双对数；斜线是「平均每文件 N 行」等值线
  function scatter(list) {
    const projects = S.groupBy(list, f => f.project);
    const W = 520,
      H = 340,
      m = { l: 48, r: 16, t: 12, b: 32 };
    const lx = v => m.l + (Math.log10(v) / 4) * (W - m.l - m.r); // 1 – 10k 个文件
    const ly = v => H - m.b - (Math.log10(v) / 6) * (H - m.t - m.b); // 1 – 1M 行
    const ticksX = [1, 10, 100, 1000, 10000],
      ticksY = [1, 10, 100, 1e3, 1e4, 1e5, 1e6];
    const grid =
      ticksX
        .map(
          t =>
            `<line class="grid" x1="${lx(t)}" x2="${lx(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${lx(t)}" y="${H - m.b + 16}" text-anchor="middle">${S.short(t)}</text>`
        )
        .join("") +
      ticksY
        .map(
          t =>
            `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${ly(t)}" y2="${ly(t)}"/><text x="${m.l - 6}" y="${ly(t) + 4}" text-anchor="end">${S.short(t)}</text>`
        )
        .join("");
    const iso = [50, 200]
      .map(avg => {
        const x1 = 1,
          x2 = 1e6 / avg;
        return `<line class="axis" stroke-dasharray="3 4" x1="${lx(x1)}" y1="${ly(avg)}" x2="${lx(Math.min(x2, 1e4))}" y2="${ly(Math.min(x2, 1e4) * avg)}"/>
        <text x="${lx(3000)}" y="${ly(3000 * avg) - 6}" text-anchor="middle">${avg} 行/文件</text>`;
      })
      .join("");
    const top = new Set(projects.slice(0, 6).map(p => p.key));
    const dots = projects
      .map(p => {
        const x = lx(p.files),
          y = ly(p.nonEmpty),
          avg = Math.round(p.nonEmpty / p.files);
        const tip = {
          title: p.key,
          rows: [
            ["非空行", S.fmt(p.nonEmpty)],
            ["文件", S.fmt(p.files)],
            ["平均", `${S.fmt(avg)} 行/文件`],
          ],
        };
        return `<g ${S.tipAttr(tip)}><circle cx="${x}" cy="${y}" r="12" fill="transparent"/>
        <circle cx="${x}" cy="${y}" r="5" fill="var(--seq-4)" stroke="var(--surface)" stroke-width="2"/>
        ${top.has(p.key) ? `<text x="${x + 9}" y="${y + 4}" style="fill:var(--ink-2)">${S.esc(p.key.split("/")[1])}</text>` : ""}</g>`;
      })
      .join("");
    return `<div class="card"><div class="card-head"><h2>项目规模<small>文件数 × 非空行，双对数</small></h2></div>
      <svg viewBox="0 0 ${W} ${H}" width="100%">${grid}<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>${iso}${dots}</svg></div>`;
  }

  function groupShare(list) {
    const total = S.sum(list);
    const groups = S.groupBy(list, f => f.group);
    const rows = groups
      .map(g => {
        const segs = S.ALL_LANGS.filter(l => g.byLang[l])
          .map(l => `<span style="flex:${g.byLang[l]};background:${S.color(l)}"></span>`)
          .join("");
        return `<div class="prow" style="grid-template-columns:72px 1fr 92px" ${S.tipAttr({ title: g.key, rows: [["非空行", S.fmt(g.nonEmpty)], ["文件", S.fmt(g.files)], ...S.langRows(g.byLang, g.nonEmpty)] })}>
        <span class="name">${g.key}</span><span class="bar" style="width:${(g.nonEmpty / (groups[0]?.nonEmpty || 1)) * 100}%">${segs}</span>
        <span class="v num">${S.short(g.nonEmpty)} · ${S.pct(g.nonEmpty, total.nonEmpty)}</span></div>`;
      })
      .join("");
    return `<div class="card"><div class="card-head"><h2>分组</h2><span class="sp"></span>${S.legend()}</div>${rows}</div>`;
  }

  S.views.matrix = {
    render(stage) {
      const list = S.filtered();
      stage.innerHTML = `<div class="mx"><div class="mx-grid">${scatter(list)}<div style="display:flex;flex-direction:column;gap:14px">${groupShare(list)}</div></div>${matrix(list)}</div>`;
      stage.querySelectorAll("th[data-lang]").forEach(th =>
        th.addEventListener("click", () => {
          sortLang = sortLang === th.dataset.lang ? null : th.dataset.lang;
          S.emit();
        })
      );
    },
  };
})();
