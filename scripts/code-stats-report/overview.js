// 总览：一屏回答「多少、在哪、什么语言、哪些文件最大」
(function () {
  const S = window.Stats;
  let expanded = false;

  function kpis(list, total) {
    const byLang = S.langSplit(list);
    const projects = new Set(list.map(f => f.project)).size;
    const avg = total.files ? Math.round(total.nonEmpty / total.files) : 0;
    const segs = S.ALL_LANGS.filter(l => byLang[l])
      .sort((a, b) => byLang[b] - byLang[a])
      .map(
        l =>
          `<span style="flex:${byLang[l]};background:${S.color(l)}" ${S.tipAttr({
            title: S.LANG_LABEL[l],
            rows: [
              ["非空行", S.fmt(byLang[l])],
              ["占比", S.pct(byLang[l], total.nonEmpty)],
            ],
          })}></span>`
      )
      .join("");
    return `<div class="kpis">
      <div class="card kpi hero"><div class="label">非空行（含注释）</div><div class="value num">${S.fmt(total.nonEmpty)}</div>
        <div class="langbar">${segs}</div></div>
      <div class="card kpi"><div class="label">文件</div><div class="value num">${S.fmt(total.files)}</div><div class="sub">平均 ${S.fmt(avg)} 行 / 文件</div></div>
      <div class="card kpi"><div class="label">项目</div><div class="value num">${projects}</div><div class="sub">${S.GROUPS.filter(g => S.state.groups.has(g)).join(" · ")}</div></div>
      <div class="card kpi"><div class="label">空行</div><div class="value num">${S.fmt(total.blank)}</div><div class="sub">总行数 ${S.fmt(total.lines)}</div></div>
    </div>`;
  }

  function projectBars(list) {
    const projects = S.groupBy(list, f => f.project);
    const max = projects[0]?.nonEmpty || 1;
    const shown = expanded ? projects : projects.slice(0, 16);
    const rows = shown
      .map(p => {
        const [group, name] = p.key.split("/");
        const segs = S.ALL_LANGS.filter(l => p.byLang[l])
          .map(
            l =>
              `<span style="width:${(p.byLang[l] / max) * 100}%;background:${S.color(l)}"></span>`
          )
          .join("");
        const tip = {
          title: p.key,
          rows: [
            ["非空行", S.fmt(p.nonEmpty)],
            ["文件", S.fmt(p.files)],
            ...S.langRows(p.byLang, p.nonEmpty),
          ],
        };
        return `<div class="prow" ${S.tipAttr(tip)}><span class="name"><i>${group}/</i>${S.esc(name)}</span>
        <span class="bar">${segs}</span><span class="v num">${S.short(p.nonEmpty)}</span></div>`;
      })
      .join("");
    const more =
      projects.length > 16
        ? `<button class="more" data-act="more">${expanded ? "收起" : `显示全部 ${projects.length} 个项目`}</button>`
        : "";
    return `<div class="card projects"><div class="card-head"><h2>项目<small>按非空行排序，条内按语言拆分</small></h2><span class="sp"></span>${S.legend()}</div>${rows}${more}</div>`;
  }

  function donut(list, total) {
    const byLang = S.langSplit(list);
    const langs = S.ALL_LANGS.filter(l => byLang[l]).sort((a, b) => byLang[b] - byLang[a]);
    const R = 46,
      C = 2 * Math.PI * R,
      gap = langs.length > 1 ? 2 : 0;
    let offset = 0;
    const arcs = langs
      .map(l => {
        const len = (byLang[l] / total.nonEmpty) * C;
        const arc = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${S.color(l)}" stroke-width="16"
        stroke-dasharray="${Math.max(len - gap, 0.5)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"
        ${S.tipAttr({
          title: S.LANG_LABEL[l],
          rows: [
            ["非空行", S.fmt(byLang[l])],
            ["占比", S.pct(byLang[l], total.nonEmpty)],
          ],
        })}/>`;
        offset += len;
        return arc;
      })
      .join("");
    const rows = langs
      .map(
        l => `<tr><td><i class="sw" style="background:${S.color(l)}"></i> ${S.LANG_LABEL[l]}</td>
      <td class="r num">${S.fmt(byLang[l])}</td><td class="p num">${S.pct(byLang[l], total.nonEmpty)}</td></tr>`
      )
      .join("");
    return `<div class="card"><div class="card-head"><h2>语言</h2></div><div class="donut-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120">${arcs}</svg>
      <table class="ltable">${rows}</table></div></div>`;
  }

  function biggest(list) {
    const top = [...list].sort((a, b) => b.nonEmpty - a.nonEmpty).slice(0, 8);
    const items = top
      .map(f => {
        const name = f.parts.at(-1),
          dir = f.parts.slice(0, -1).join("/");
        return `<li ${S.tipAttr({
          title: f.path,
          rows: [
            ["语言", S.LANG_LABEL[f.lang], f.lang],
            ["非空行", S.fmt(f.nonEmpty)],
            ["空行", S.fmt(f.blank)],
          ],
        })}>
        <span class="path"><bdi>${S.esc(dir)}/<b>${S.esc(name)}</b></bdi></span><span class="n num">${S.fmt(f.nonEmpty)}</span></li>`;
      })
      .join("");
    return `<div class="card"><div class="card-head"><h2>最大文件</h2></div><ul class="biglist">${items}</ul></div>`;
  }

  // 文件体量分布：对数分桶，看「大文件」是不是少数
  function histogram(list) {
    const edges = [0, 50, 100, 200, 400, 800, 1600, Infinity];
    const labels = ["<50", "50", "100", "200", "400", "800", "1.6k+"];
    const counts = edges
      .slice(0, -1)
      .map((lo, i) => list.filter(f => f.nonEmpty >= lo && f.nonEmpty < edges[i + 1]));
    const max = Math.max(1, ...counts.map(c => c.length));
    const bars = counts
      .map(
        (c, i) =>
          `<div style="height:${(c.length / max) * 100}%" ${S.tipAttr({
            title: i === 6 ? "≥ 1,600 行" : `${S.fmt(edges[i])} – ${S.fmt(edges[i + 1] - 1)} 行`,
            rows: [
              ["文件", S.fmt(c.length)],
              ["占文件数", S.pct(c.length, list.length)],
              ["占非空行", S.pct(S.sum(c).nonEmpty, S.sum(list).nonEmpty)],
            ],
          })}></div>`
      )
      .join("");
    return `<div class="card"><div class="card-head"><h2>文件体量<small>每文件非空行</small></h2></div>
      <div class="hist">${bars}</div><div class="hist-axis">${labels.map(l => `<span>${l}</span>`).join("")}</div></div>`;
  }

  S.views.overview = {
    render(stage) {
      const list = S.filtered();
      const total = S.sum(list);
      stage.innerHTML = `<div class="ov">${kpis(list, total)}${projectBars(list)}
        <div class="side">${donut(list, total)}${histogram(list)}${biggest(list)}</div></div>`;
      stage.querySelector("[data-act=more]")?.addEventListener("click", () => {
        expanded = !expanded;
        S.emit();
      });
    },
  };
})();
