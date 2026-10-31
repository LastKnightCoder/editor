// 结构：按目录层级的树图，点击下钻，面积 = 非空行
(function () {
  const S = window.Stats;
  let path = []; // 当前下钻的路径段，[] 为仓库根
  let colorBy = "lang"; // lang：主语言着色；size：按体量单色深浅

  // 把文件列表折叠成当前层级的子节点
  function children(list, depth) {
    const nodes = new Map();
    for (const f of list) {
      const key = f.parts[depth];
      const isFile = depth === f.parts.length - 1;
      if (!nodes.has(key)) nodes.set(key, { name: key, isFile, items: [] });
      nodes.get(key).items.push(f);
    }
    return [...nodes.values()]
      .map(n => ({ ...n, ...S.sum(n.items), byLang: S.langSplit(n.items) }))
      .sort((a, b) => b.nonEmpty - a.nonEmpty);
  }

  // squarify 布局：长宽比尽量接近 1，便于阅读标签
  function squarify(nodes, x, y, w, h) {
    const total = nodes.reduce((s, n) => s + n.nonEmpty, 0);
    if (!total) return [];
    const scale = (w * h) / total;
    const items = nodes.map(n => ({ n, area: n.nonEmpty * scale }));
    const out = [];
    let rect = { x, y, w, h };
    while (items.length) {
      const side = Math.min(rect.w, rect.h);
      const row = [items.shift()];
      const worst = r => {
        const s = r.reduce((a, b) => a + b.area, 0);
        const max = Math.max(...r.map(i => i.area)),
          min = Math.min(...r.map(i => i.area));
        return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
      };
      while (items.length && worst([...row, items[0]]) <= worst(row)) row.push(items.shift());
      const rowArea = row.reduce((a, b) => a + b.area, 0);
      const thick = rowArea / side;
      let pos = 0;
      for (const it of row) {
        const len = it.area / thick;
        out.push(
          rect.w >= rect.h
            ? { n: it.n, x: rect.x, y: rect.y + pos, w: thick, h: len }
            : { n: it.n, x: rect.x + pos, y: rect.y, w: len, h: thick }
        );
        pos += len;
      }
      rect =
        rect.w >= rect.h
          ? { x: rect.x + thick, y: rect.y, w: rect.w - thick, h: rect.h }
          : { x: rect.x, y: rect.y + thick, w: rect.w, h: rect.h - thick };
    }
    return out;
  }

  function mainLang(byLang) {
    return S.ALL_LANGS.reduce((a, b) => (byLang[b] > byLang[a] ? b : a));
  }

  function fill(node, maxAvg) {
    if (colorBy === "lang")
      return { bg: S.color(mainLang(node.byLang)), dark: S.DARK_INK.has(mainLang(node.byLang)) };
    // 按平均文件体量分 6 档：一眼找到「胖文件」聚集处
    const avg = node.nonEmpty / node.files;
    const step = Math.min(
      6,
      1 + Math.floor((Math.log2(1 + (avg / Math.max(1, maxAvg)) * 31) / 5) * 6)
    );
    return { bg: `var(--seq-${step})`, dark: step <= 2 };
  }

  function render(stage) {
    const list = S.filtered().filter(
      f => path.every((seg, i) => f.parts[i] === seg) && f.parts.length > path.length
    );
    const nodes = children(list, path.length);
    const total = S.sum(list);
    const crumbs = [
      `<button data-depth="0">仓库</button>`,
      ...path.map(
        (seg, i) => `<span class="sep">/</span><button data-depth="${i + 1}">${S.esc(seg)}</button>`
      ),
    ].join("");
    stage.innerHTML = `<div class="tm-wrap">
      <div class="crumbs">${crumbs}<span class="tot num">${S.fmt(total.nonEmpty)} 行 · ${S.fmt(total.files)} 个文件</span>
        <span class="sp" style="flex:1"></span>
        <div class="mode"><button data-color="lang" aria-pressed="${colorBy === "lang"}">按主语言</button><button data-color="size" aria-pressed="${colorBy === "size"}">按平均文件体量</button></div></div>
      <div class="tm-body"><div class="card tm-card"><div class="tm" id="tm"></div></div>
        <div class="tm-side">${side(nodes, total)}</div></div></div>`;

    const box = stage.querySelector("#tm");
    const { width, height } = box.getBoundingClientRect();
    const maxAvg = Math.max(1, ...nodes.map(n => n.nonEmpty / n.files));
    const gap = 2;
    box.innerHTML = squarify(nodes, 0, 0, width, height)
      .map(({ n, x, y, w, h }) => {
        const { bg, dark } = fill(n, maxAvg);
        const label = w > 54 && h > 22;
        const sub = w > 70 && h > 38;
        const tip = {
          title: [...path, n.name].join("/"),
          rows: [
            ["非空行", `${S.fmt(n.nonEmpty)} · ${S.pct(n.nonEmpty, total.nonEmpty)}`],
            ["文件", S.fmt(n.files)],
            ...(n.isFile ? [] : S.langRows(n.byLang, n.nonEmpty)),
          ],
        };
        return `<div class="tm-node${n.isFile ? " leaf" : ""}${dark ? " ink-dark" : ""}" data-name="${S.esc(n.name)}" ${S.tipAttr(tip)}
        style="left:${x + gap / 2}px;top:${y + gap / 2}px;width:${Math.max(0, w - gap)}px;height:${Math.max(0, h - gap)}px;background:${bg}">
        ${label ? `<div class="t">${S.esc(n.name)}</div>` : ""}${sub ? `<div class="s num">${S.short(n.nonEmpty)}</div>` : ""}</div>`;
      })
      .join("");

    box.addEventListener("click", e => {
      const el = e.target.closest(".tm-node");
      if (!el || el.classList.contains("leaf")) return;
      path = [...path, el.dataset.name];
      S.emit();
    });
    stage.querySelectorAll("[data-depth]").forEach(b =>
      b.addEventListener("click", () => {
        path = path.slice(0, +b.dataset.depth);
        S.emit();
      })
    );
    stage.querySelectorAll("[data-color]").forEach(b =>
      b.addEventListener("click", () => {
        colorBy = b.dataset.color;
        S.emit();
      })
    );
  }

  function side(nodes, total) {
    const top = nodes
      .slice(0, 10)
      .map(
        n => `<li ${S.tipAttr({ title: n.name, rows: [["文件", S.fmt(n.files)]] })}>
      <span class="path" style="direction:ltr"><b>${S.esc(n.name)}</b></span><span class="n num">${S.pct(n.nonEmpty, total.nonEmpty)}</span></li>`
      )
      .join("");
    const byLang = S.langSplit(nodes.flatMap(n => n.items));
    const segs = S.ALL_LANGS.filter(l => byLang[l])
      .sort((a, b) => byLang[b] - byLang[a])
      .map(l => `<span style="flex:${byLang[l]};background:${S.color(l)}"></span>`)
      .join("");
    const legend =
      colorBy === "lang"
        ? S.legend()
        : `<div class="scale">小 ${[1, 2, 3, 4, 5, 6].map(i => `<span class="s" style="background:var(--seq-${i})"></span>`).join("")} 大</div>`;
    return `<div class="card"><div class="card-head"><h2>本层语言</h2></div><div class="langbar" style="margin:0 0 10px">${segs}</div>${legend}</div>
      <div class="card"><div class="card-head"><h2>本层占比</h2></div><ul class="biglist">${top}</ul></div>`;
  }

  S.views.treemap = {
    render,
    reset() {
      path = [];
    },
  };
})();
