// 示意站点与卡片渲染函数；封面用渐变代替真实 og:image
window.SITES = {
  mdn: {
    site: "MDN Web Docs",
    host: "developer.mozilla.org",
    path: "/zh-CN/docs/Web/API/View_Transition_API",
    title: "View Transition API - Web API | MDN",
    desc: "View Transition API 提供了一种机制，可以在更新 DOM 内容的同时，轻松地创建不同 DOM 状态之间的动画过渡。",
    fav: { bg: "#1b1b1b", t: "M" },
    cover: "linear-gradient(135deg,#0b1a33 0%,#183a6b 55%,#2f6fd1 100%)",
  },
  gh: {
    site: "GitHub",
    host: "github.com",
    path: "/ianstormtaylor/slate",
    title:
      "ianstormtaylor/slate: A completely customizable framework for building rich text editors.",
    desc: "A completely customizable framework for building rich text editors. (Currently in beta.)",
    fav: { bg: "#24292f", t: "G" },
    cover: "linear-gradient(135deg,#f6f8fa 0%,#dfe4ea 100%)",
  },
  sspai: {
    site: "少数派",
    host: "sspai.com",
    path: "/post/88213",
    title: "卡片笔记写作法实践：我如何用三个月把零散想法变成一篇长文",
    desc: "从闪念笔记到永久笔记，再到一篇完整的文章，这里记录了我按照卢曼的方法做了三个月之后的真实体会，以及中途放弃过的几个做法。",
    fav: { bg: "#d71a1b", t: "派" },
    cover: "linear-gradient(135deg,#f4d9c6 0%,#e7a983 60%,#c8664a 100%)",
  },
  yt: {
    site: "YouTube",
    host: "www.youtube.com",
    path: "/watch?v=Q5nqLmCvm-k",
    title: "How Figma's multiplayer technology works",
    desc: "A deep dive into CRDT-inspired syncing, conflict resolution and the server architecture behind real-time collaboration.",
    fav: { bg: "#ff0033", t: "▶" },
    cover: "linear-gradient(135deg,#2a1636 0%,#7b3fa0 50%,#f06292 100%)",
  },
  bare: {
    site: "",
    host: "intranet.example.cn",
    path: "/wiki/oncall-handbook",
    title: "",
    desc: "",
    fav: null,
    cover: "",
  },
};

const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

window.favicon = (s, size = 16) =>
  s.fav
    ? `<span class="fav" style="background:${s.fav.bg};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.6)}px">${s.fav.t}</span>`
    : `<span class="fav none" style="width:${size}px;height:${size}px">${ic("globe", size - 4)}</span>`;

/** variant: row（A，默认）/ cover（B）/ compact（C）；opts.noCover 去掉封面 */
window.bookmark = (key, variant = "row", opts = {}) => {
  const s = SITES[key];
  const site = s.site || s.host;
  if (variant === "compact") {
    return `<div class="bm compact">${favicon(s)}<span class="ttl">${esc(s.title || s.host + s.path)}</span><span class="host">${esc(s.host)}</span><span class="go">${ic("external", 14)}</span></div>`;
  }
  const cover =
    s.cover && !opts.noCover ? `<div class="cover" style="background:${s.cover}"></div>` : "";
  return `<div class="bm ${variant === "cover" ? "cover-top" : ""}">
    <div class="txt">
      <div class="ttl">${esc(s.title)}</div>
      <div class="desc">${esc(s.desc)}</div>
      <div class="src">${favicon(s)}<span class="site">${esc(site)}</span><span>· ${esc(s.host + s.path)}</span></div>
    </div>${cover}
  </div>`;
};

/** 带左侧手柄与右上角操作条的块外壳 */
window.block = (inner, cls = "", ops = true) =>
  `<div class="blk ${cls}"><button class="grip">${ic("grip", 14)}</button>${inner}${
    ops
      ? `<div class="ops"><button title="打开">${ic("external", 14)}</button><button title="复制链接">${ic("copy", 14)}</button><button title="编辑">${ic("pencil", 14)}</button><span class="sep"></span><button title="更多">${ic("more", 14)}</button></div>`
      : ""
  }</div>`;

window.esc = esc;
