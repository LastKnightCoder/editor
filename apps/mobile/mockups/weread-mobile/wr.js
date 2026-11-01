// 微信读书移动端 mockup：书架、单书笔记与各面板在这里拼装，须在 ai-mobile/ai.js（渲染图标、主题与标签切换）之前执行。
(function () {
  const W = window.WR;
  const icon = (name, size = 16) => `<span data-i="${name}" data-s="${size}"></span>`;
  const bool = (el, key) => el.dataset[key] != null;

  const cover = (b, extra = "", bare = false) =>
    `<div class="r-cover t${b.tone}${bare ? " bare" : ""} ${extra}">${bare ? "" : `<span class="ct">${b.title}</span><span class="ca">${b.author}</span>`}${
      b.status === "reading" && extra.includes("pbar")
        ? `<span class="pb"><i style="width:${b.progress}%"></i></span>`
        : ""
    }</div>`;
  const prog = b =>
    `<span class="r-prog${b.status === "finished" ? " done" : ""}"><i style="width:${b.progress}%"></i></span>`;

  const host = el =>
    `<div class="r-host${bool(el, "line") ? " with-line" : ""}"><span class="ib">${icon("chevron-left", 24)}</span><span class="t">${el.dataset.title || "微信读书"}</span></div>`;

  const bar = el => {
    const state = el.dataset.state || "default";
    if (state === "search")
      return `<div class="r-bar"><div class="r-search">${icon("search", 16)}<span>${el.dataset.q || ""}</span><span class="caret"></span>${el.dataset.q ? "" : '<span class="ph">搜索书名或作者</span>'}<span class="sp"></span>${el.dataset.q ? `<span class="muted">${icon("x", 15)}</span>` : ""}</div><span class="r-cancel">取消</span></div>`;
    const stat = `<span class="stat"><b>12</b> 本<i>·</i>累计 <b>60 小时</b><i>·</i>${el.dataset.when || "10 分钟前同步"}</span>`;
    const search = `<span class="r-ib">${icon("search", 19)}</span>`;
    if (state === "none" || state === "invalid")
      return `<div class="r-bar">${stat}${search}<span class="r-btn soft">${icon("key-round", 15)}${state === "none" ? "连接" : "重新填写"}</span><span class="r-ib">${icon("ellipsis", 19)}</span></div>`;
    if (state === "syncing")
      return `<div class="r-bar">${stat.replace(el.dataset.when || "10 分钟前同步", "正在同步")}${search}<span class="r-btn num"><span class="spin-wrap" data-i="loader-circle" data-s="15"></span>同步中 12/40</span><span class="r-ib">${icon("ellipsis", 19)}</span></div>`;
    return `<div class="r-bar">${stat}${search}<span class="r-btn">${icon("refresh-cw", 15)}同步</span><span class="r-ib">${icon("ellipsis", 19)}</span></div>`;
  };

  const pills = el => {
    const active = el.dataset.active || "";
    const list = [
      { name: "", label: "全部", count: 12 },
      ...W.archives.map(a => ({ name: a.name, label: a.name, count: a.count })),
    ];
    return `<div class="r-pills${bool(el, "stuck") ? " stuck" : ""}"><div class="row">${list
      .map(
        a =>
          `<span class="r-pill${a.name === active ? " on" : ""}">${a.label}<small>${a.count}</small></span>`
      )
      .join(
        ""
      )}</div><span class="r-ib${bool(el, "filter") ? " on" : ""}">${icon("list-filter", 19)}${bool(el, "filter") ? '<span class="dot"></span>' : ""}</span></div>`;
  };

  const readingBooks = () => W.books.filter(b => b.status === "reading");
  const reading = el => {
    const list = readingBooks().filter(
      b => !el.dataset.archive || b.archive === el.dataset.archive
    );
    return `<div class="r-reading">${list
      .slice(0, 3)
      .map(
        b =>
          `<div class="r-rc">${cover(b, "", true)}<div class="m"><span class="tt">${b.title}</span><span class="au">${b.author} · ${b.last}</span></div><div class="pg num"><span>${b.progress}%</span>${prog(b)}</div></div>`
      )
      .join("")}</div>`;
  };

  const sec = el =>
    `<div class="r-sec">${el.dataset.title}${el.dataset.hint ? `<small>${el.dataset.hint}</small>` : ""}${el.dataset.more ? `<span class="more">${el.dataset.more}${icon("chevron-right", 14)}</span>` : ""}</div>`;

  const shelfBooks = el => {
    let list = W.books;
    const f = el.dataset.filter;
    if (f === "notes") list = list.filter(b => b.notes > 0);
    if (f === "finished") list = list.filter(b => b.status === "finished");
    if (el.dataset.archive) list = list.filter(b => b.archive === el.dataset.archive);
    if (el.dataset.sort === "notes") list = [...list].sort((a, b) => b.notes - a.notes);
    return list.slice(
      Number(el.dataset.from || 0),
      Number(el.dataset.from || 0) + Number(el.dataset.n || 12)
    );
  };
  const tileMeta = b =>
    b.status === "finished"
      ? `<span class="ok">读完</span><span>${b.notes ? `${b.notes} 划线` : b.author}</span>`
      : b.status === "reading"
        ? `<span>${b.progress}%</span><span>${b.notes ? `${b.notes} 划线` : b.author}</span>`
        : `<span>${b.author}</span>`;
  const grid = el =>
    `<div class="r-grid">${shelfBooks(el)
      .map(
        b =>
          `<div class="r-tile">${cover(b, "pbar")}<span class="tt">${b.title}</span><span class="mt num">${tileMeta(b)}</span></div>`
      )
      .join("")}</div>`;
  const list = el =>
    `<div class="r-list">${shelfBooks(el)
      .map(
        b =>
          `<div class="r-li">${cover(b, "", true)}<div class="m"><div class="tt">${b.title}</div><div class="au">${b.author}${b.last ? ` · ${b.last}` : ""}</div></div><div class="side num">${
            b.status === "unread"
              ? '<span class="muted">未开始</span>'
              : `<span>${b.status === "finished" ? "读完" : `${b.progress}%`}${b.notes ? ` · <b>${b.notes}</b> 划线` : ""}</span>${prog(b)}`
          }</div></div>`
      )
      .join("")}</div>`;

  window.WRT = { icon, cover, prog, host, bar, pills, reading, sec, grid, list };
})();
