// 单书笔记页与各底部面板的模板；依赖 wr.js 导出的 WRT。
(function () {
  const W = window.WR;
  const T = window.WRT;
  const { icon, cover } = T;
  const bool = (el, key) => el.dataset[key] != null;
  const book = W.book("zsns");

  T.bookHead = () =>
    `<div class="r-bh">${cover(book)}<div class="m"><h1>${book.title}</h1><div class="au">${book.author} · ${book.pub}</div><div class="pg num">${T.prog(book)}${book.progress}%</div><div class="st num"><span>阅读 <b>12 小时 22 分</b></span><span>划线 <b>${book.notes}</b></span><span>想法 <b>${book.reviews}</b></span><span>最近阅读 <b>今天</b></span></div></div></div>`;

  T.bookActs = el =>
    `<div class="r-acts"><span class="r-btn">${icon("book-open", 15)}在微信读书中打开</span><span class="r-btn${bool(el, "offline") ? " dis" : ""}">${icon(bool(el, "loading") ? "loader-circle" : "refresh-cw", 15)}${bool(el, "loading") ? "拉取中…" : "重新拉取"}</span><span class="r-btn icon">${icon("ellipsis", 17)}</span></div>`;

  T.review = () =>
    `<div class="r-review"><div class="h">${icon("pen-line", 13)}我的书评</div>${W.review}</div>`;

  T.fbar = el => {
    const f = el.dataset.f || "all";
    const colors = [5, 3, 1, 4, 2];
    const chapter = el.dataset.chapter;
    return `<div class="r-fbar${bool(el, "stuck") ? " stuck" : ""}"><span class="r-pill${f === "all" ? " on" : ""}">全部</span><span class="r-pill${f === "review" ? " on" : ""}">有想法</span><span class="gap"></span>${colors
      .map(c => `<span class="r-dot${String(c) === f ? " on" : ""}"><i class="c${c}"></i></span>`)
      .join(
        ""
      )}<span class="r-toc-btn">${icon("list-tree", 16)}<span>${chapter || "目录"}</span></span></div>`;
  };

  const note = (n, opts) => {
    const pressed = opts.pressed === n.id ? " pressed" : "";
    const flash = opts.flash === n.id ? " flash" : "";
    return `<div class="r-note${pressed}${flash}"><div class="q"><mark class="m${n.style} k${n.color}">${n.text}</mark></div>${
      n.review
        ? `<div class="r-thought">${icon("message-square-quote", 13)}<div>${n.review}</div></div>`
        : ""
    }${opts.more ? `<span class="more">${icon("ellipsis", 16)}</span>` : ""}</div>`;
  };
  T.chapters = el => {
    const from = Number(el.dataset.from || 0);
    const count = Number(el.dataset.n || 2);
    const f = el.dataset.f || "all";
    const opts = { pressed: el.dataset.pressed, flash: el.dataset.flash, more: bool(el, "more") };
    return W.chapters
      .slice(from, from + count)
      .map((ch, i) => {
        let notes = ch.notes;
        if (f === "review") notes = notes.filter(n => n.review);
        else if (f !== "all") notes = notes.filter(n => String(n.color) === f);
        if (!notes.length && f !== "all") return "";
        const thoughts = f === "all" || f === "review" ? ch.thoughts : [];
        return `<section class="r-ch"><h2><span class="no">${String(from + i + 1).padStart(2, "0")}</span>${ch.title}<span class="n">${ch.count}</span></h2><div class="r-notes">${notes
          .map(n => note(n, opts))
          .join(
            ""
          )}</div>${thoughts.map(t => `<div class="r-thought">${icon("message-square-quote", 13)}<div>${t.join("")}</div></div>`).join("")}</section>`;
      })
      .join("");
  };

  const opt = (ic, label, extra = "") =>
    `<div class="r-opt ${extra}">${icon(ic, 19)}${label}</div>`;
  const radio = (label, on) =>
    `<div class="r-opt${on ? " on" : ""}">${label}${on ? `<span class="chk">${icon("check", 18)}</span>` : ""}</div>`;

  T.filterSheet = el => {
    const status = el.dataset.status || "全部状态";
    const sort = el.dataset.sort || "最近阅读";
    const layout = el.dataset.layout || "封面";
    const rows = (items, current) =>
      items
        .map((s, i) => radio(s, s === current).replace("r-opt", i === 0 ? "r-opt first" : "r-opt"))
        .join("");
    const lay = (ic, label, i) =>
      `<div class="r-opt${i === 0 ? " first" : ""}${layout === label ? " on" : ""}">${icon(ic, 19)}${label}${layout === label ? `<span class="chk">${icon("check", 18)}</span>` : ""}</div>`;
    return `<div class="r-mask"></div><div class="r-sheet r-fsheet"><div class="grab"></div><div class="sh">筛选与排列<span class="x">${icon("x", 20)}</span></div><div class="grp">状态</div><div class="r-chips">${[
      "全部状态",
      "在读",
      "读完",
      "未开始",
      "有笔记",
    ]
      .map(s => `<span class="r-pill${s === status ? " on" : ""}">${s}</span>`)
      .join(
        ""
      )}</div><div class="grp">排序</div>${rows(["最近阅读", "阅读进度", "阅读时长", "笔记数"], sort)}<div class="grp">排布</div>${lay("layout-grid", "封面", 0)}${lay("list", "列表", 1)}<div class="home-ind"></div></div>`;
  };

  T.noteSheet = el => {
    const n = W.chapters[0].notes[0];
    const unsynced = bool(el, "unsynced");
    return `<div class="r-mask"></div><div class="r-sheet"><div class="grab"></div><div class="r-preview">${n.text}<span class="from">${book.title} · 第一章 地方政府的权力与事务</span></div>${opt("layers", "转为卡片", "first" + (unsynced ? " dis-opt" : ""))}${opt("copy", "复制划线")}${opt("message-square-quote", "复制划线和想法")}${unsynced ? '<div class="r-hint" style="padding:0 18px">这条划线还没有写入摘录，同步完成后才能转为卡片。</div>' : ""}<div class="home-ind"></div></div>`;
  };

  T.moreSheet = () =>
    `<div class="r-mask"></div><div class="r-sheet"><div class="grab"></div>${opt("copy", "复制全书笔记为 Markdown", "first")}${opt("refresh-cw", "重新拉取笔记")}${opt("square-arrow-out-up-right", "在微信读书中打开")}<div class="home-ind"></div></div>`;

  T.tocSheet = el => {
    const active = Number(el.dataset.active || 2);
    return `<div class="r-mask"></div><div class="r-sheet r-toc"><div class="grab"></div><div class="sh">目录<small>${W.toc.length} 章 · 有笔记的章节</small><span class="x">${icon("x", 20)}</span></div>${W.toc
      .map(
        ([t, n], i) =>
          `<div class="r-opt${i === 0 ? " first" : ""}${i === active ? " on" : ""}"><span class="no">${String(i + 1).padStart(2, "0")}</span><span class="t">${t}</span><small class="num">${n}</small></div>`
      )
      .join("")}<div class="home-ind"></div></div>`;
  };
})();

// 书架同步面板（⋯）：上次同步结果、全量重新同步、账号与连接
(function () {
  const T = window.WRT;
  const { icon } = T;
  T.syncSheet = () =>
    `<div class="r-mask"></div><div class="r-sheet"><div class="grab"></div><div class="sh">同步<small>10 分钟前同步 · 更新 3 本 · 2 本下次重试</small></div><div class="r-opt first r-opt2">${icon("refresh-cw", 19)}<span class="m"><b>全量重新同步</b><small>把整个书架重新拉一遍，约 24 个请求，书多时较慢；同步期间尽量不要切到后台。</small></span></div><div class="r-opt r-opt2">${icon("key-round", 19)}<span class="m"><b>账号与连接</b><small>已连接 · 更换或断开 API Key</small></span></div><div class="home-ind"></div></div>`;
})();
