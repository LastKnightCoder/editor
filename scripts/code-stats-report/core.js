// 共享层：逐文件明细 → 筛选 → 聚合；各视图只调用这里的函数，不自己遍历原始数据。
(function () {
  const { files: rows, groups: GROUPS } = window.CODE_STATS;
  const NAMES = {
    ts: "TS",
    tsx: "TSX",
    js: "JS",
    jsx: "JSX",
    rs: "Rust",
    css: "CSS",
    scss: "SCSS",
    html: "HTML",
    sql: "SQL",
    py: "Python",
    kt: "Kotlin",
    objc: "Obj-C",
    cpp: "C++",
  };
  // 行数前五的语言按固定顺序占用调色板槽位，其余并入「其他」，避免生成第六种色相
  const totals = new Map();
  for (const [, language, nonEmpty] of rows)
    totals.set(language, (totals.get(language) ?? 0) + nonEmpty);
  const LANGS = [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([language]) => language);
  const ALL_LANGS = totals.size > LANGS.length ? [...LANGS, "other"] : LANGS;
  const SLOT = Object.fromEntries([...LANGS.map((l, i) => [l, i + 1]), ["other", "other"]]);
  const LANG_LABEL = Object.fromEntries([
    ...LANGS.map(l => [l, NAMES[l] ?? l.toUpperCase()]),
    ["other", "其他"],
  ]);
  // 第 3–5 槽（绿、黄、粉）与灰色底上白字对比不足，改用深色字
  const DARK_INK = new Set([...LANGS.slice(2), "other"]);

  const files = rows.map(([path, language, nonEmpty, blank]) => {
    const parts = path.split("/");
    return {
      path,
      nonEmpty,
      blank,
      language,
      lang: LANGS.includes(language) ? language : "other",
      group: parts[0],
      project: `${parts[0]}/${parts[1]}`,
      parts,
    };
  });

  const state = { view: "overview", groups: new Set(GROUPS), langs: new Set(ALL_LANGS) };
  const listeners = [];

  function filtered() {
    return files.filter(f => state.groups.has(f.group) && state.langs.has(f.lang));
  }

  function sum(list) {
    let nonEmpty = 0,
      blank = 0;
    for (const f of list) {
      nonEmpty += f.nonEmpty;
      blank += f.blank;
    }
    return { files: list.length, nonEmpty, blank, lines: nonEmpty + blank };
  }

  // 按 key 分桶，桶内附带语言拆分；按非空行降序
  function groupBy(list, keyOf) {
    const map = new Map();
    for (const f of list) {
      const key = keyOf(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return [...map]
      .map(([key, items]) => ({ key, items, ...sum(items), byLang: langSplit(items) }))
      .sort((a, b) => b.nonEmpty - a.nonEmpty || a.key.localeCompare(b.key));
  }

  function langSplit(list) {
    const out = Object.fromEntries(ALL_LANGS.map(l => [l, 0]));
    for (const f of list) out[f.lang] += f.nonEmpty;
    return out;
  }

  const fmt = n => n.toLocaleString("en-US");
  const trim = s => s.replace(/\.0+$|(\.\d*?)0+$/, "$1");
  const short = n =>
    n >= 1e6
      ? trim((n / 1e6).toFixed(2)) + "M"
      : n >= 1e3
        ? trim((n / 1e3).toFixed(n >= 1e4 ? 1 : 2)) + "k"
        : String(n);
  const pct = (a, b) => (b ? ((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0) + "%" : "0%");
  const color = lang => `var(--lang-${SLOT[lang]})`;
  const esc = s =>
    String(s).replace(
      /[&<>"]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
    );

  // 悬停提示：元素上挂 data-tip（JSON），统一由这里定位
  const tip = document.getElementById("tip");
  function tipHtml(t) {
    const rows = (t.rows || [])
      .map(
        ([k, v, sw]) =>
          `<div class="r"><span>${sw ? `<i class="sw" style="background:${color(sw)}"></i> ` : ""}${esc(k)}</span><b>${esc(v)}</b></div>`
      )
      .join("");
    return `<div class="h">${esc(t.title)}</div>${rows}`;
  }
  document.addEventListener("pointermove", e => {
    const el = e.target.closest("[data-tip]");
    if (!el) {
      tip.classList.remove("on");
      return;
    }
    tip.innerHTML = tipHtml(JSON.parse(el.dataset.tip));
    tip.classList.add("on");
    const { innerWidth: w, innerHeight: h } = window;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX + 14, w - r.width - 8) + "px";
    tip.style.top = Math.min(e.clientY + 14, h - r.height - 8) + "px";
  });
  document.addEventListener("pointerleave", () => tip.classList.remove("on"));

  function langRows(byLang, total) {
    return ALL_LANGS.filter(l => byLang[l])
      .sort((a, b) => byLang[b] - byLang[a])
      .map(l => [LANG_LABEL[l], `${fmt(byLang[l])} · ${pct(byLang[l], total)}`, l]);
  }
  const tipAttr = t => `data-tip='${esc(JSON.stringify(t)).replace(/'/g, "&#39;")}'`;

  function legend(langs = ALL_LANGS) {
    return `<div class="legend">${langs
      .filter(l => state.langs.has(l))
      .map(l => `<span><i class="sw" style="background:${color(l)}"></i>${LANG_LABEL[l]}</span>`)
      .join("")}</div>`;
  }

  window.Stats = {
    LANGS,
    ALL_LANGS,
    LANG_LABEL,
    GROUPS,
    DARK_INK,
    files,
    state,
    filtered,
    sum,
    groupBy,
    langSplit,
    langRows,
    fmt,
    short,
    pct,
    color,
    esc,
    tipAttr,
    legend,
    onChange: fn => listeners.push(fn),
    emit: () => listeners.forEach(fn => fn()),
    views: {},
  };
})();
