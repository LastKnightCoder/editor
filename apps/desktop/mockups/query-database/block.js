// 正文里的查询块
function docShell(inner, o = {}) {
  return `<div class="app doc-app">${sidebar()}<main class="paper">
    <div class="doc-col">
      <h1 class="doc-t">十一月读书复盘</h1>
      <p class="doc-p">这个月主要在读行为经济学和历史。下面是这个月写过的读书卡片，按更新时间排，方便回头补链接。</p>
      ${inner}
      <p class="doc-p">回头看，心理学相关的卡片最多，但每张都偏短，下个月试着把「峰终定律」和「助推」串成一篇文章。</p>
      ${o.slash || ""}
    </div>
  </main></div>`;
}

function blockHead(o) {
  const st = o.err
    ? `<span class="bh-st err">${ic("alert", "xs")}查询出错 · 显示上次结果</span>`
    : o.run
      ? `<span class="bh-st run"><i></i>正在更新</span>`
      : `<span class="bh-st">${o.count ?? 6} 条 · 实时</span>`;
  return `<div class="bh ${o.show ? "show" : ""}">
    <span class="bh-src">${ic("card", "s")}卡片</span>${st}
    <span class="sp"></span>
    ${
      o.readonly
        ? ""
        : `<span class="bh-tools">
      <button class="tool">${ic("filter")}</button><button class="tool">${ic("sort")}</button><button class="tool">${ic("eye")}</button>
      <button class="tool">${ic("refresh")}</button>
      <button class="qbtn sm ${o.src ? "on" : ""}">${ic("code", "s")}查询</button>
      <button class="tool">${ic("more")}</button></span>`
    }
  </div>`;
}

function blockTable(o) {
  const rows = o.rows ?? ROWS.slice(0, 6);
  return `<table class="tbl btbl ${o.stale ? "stale" : ""}">
    <tr>${COLS.map(c => `<th class="${c.num ? "num" : ""}" style="${c.w ? `width:${c.w}` : ""}"><span class="h">${ic(c.ic)}${c.n}</span></th>`).join("")}</tr>
    ${rows
      .map(
        r => `<tr><td><span class="ent">${ic("card")}<span>${r[0]}</span><span class="go">${ic("out", "xs")}</span></span></td>
      <td>${r[1].map(t => `<span class="tg" style="--c:${TAG_C[t]}">${t}</span>`).join("")}</td>
      <td class="num">${r[2].toLocaleString()}</td><td class="dt">${r[3]}</td></tr>`
      )
      .join("")}
  </table>`;
}

function qblock(o) {
  let body;
  if (o.empty)
    body = `<div class="bempty">没有符合条件的卡片 · 条件：带「读书」标签、更新于本月</div>`;
  else
    body =
      blockTable(o) +
      (o.more
        ? `<button class="bmore">再显示 6 条 ${ic("chev", "xs")}<span>共 12 条</span></button>`
        : "");
  const src = o.src
    ? `<div class="bsrc">${sourcePanel({ ...o.srcOpt, readonly: o.readonly })}</div>`
    : "";
  return `<div class="qb ${o.sel ? "sel" : ""}">${blockHead(o)}${src}${body}</div>`;
}

const BLOCK_STATES = {
  read: {
    label: "阅读",
    cap: "<b>正文里的查询块</b>：读起来就是一张表。上方一行淡墨「卡片 · 6 条 · 实时」交代来源，不画卡片外框、不加投影，和普通表格块同一张纸。原来 360px 最小高度 + 卡片底 + 常驻「查询代码 / 显示列 / 刷新」的工具条去掉。",
    html: () => docShell(qblock({ more: true })),
  },
  selected: {
    label: "选中",
    cap: "<b>光标进入或点选块</b>：同一行右侧出现筛选 / 排序 / 显示列 / 刷新 / 查询（占固定槽位，不推动布局）；路过不出。块左侧一条 accent 细线表示选中。",
    html: () => docShell(qblock({ sel: true, show: true, more: true })),
  },
  source: {
    label: "编辑查询",
    cap: "<b>在正文里改查询</b>：源码面板在表上方展开，与独立数据库页同一组件。光标离开块后自动收起，只留表。",
    html: () => docShell(qblock({ sel: true, show: true, src: true, rows: ROWS.slice(0, 4) })),
  },
  insert: {
    label: "刚插入",
    cap: "<b>/查询 插入后</b>：源码面板展开、光标在 AI 行，下面是来源快捷选择。选来源或写一句话后才出表。",
    html: () =>
      docShell(`<div class="qb sel"><div class="bh show"><span class="bh-src">${ic("live", "s")}新查询</span><span class="sp"></span></div>
      <div class="bsrc"><div class="src">
        <div class="ai first">${ic("spark")}<span class="val">本月写的读书卡片<span class="caret"></span></span><span class="kbd">↵</span></div>
        <div class="quick"><span class="lbl">或从来源开始</span>${SOURCES.slice(0, 7)
          .map(s => `<button class="qs">${ic(s.icon, "s")}${s.name}</button>`)
          .join("")}<button class="qs">写代码</button></div>
      </div></div></div>`),
  },
  running: {
    label: "更新中",
    cap: "<b>源数据变化后</b>：表保持原样，来源行写「正在更新」。块内不出现进度条，避免正文里闪动。",
    html: () => docShell(qblock({ run: true, more: true })),
  },
  error: {
    label: "出错",
    cap: "<b>出错</b>：来源行变红写明「显示上次结果」，表变淡；点红字展开源码看具体问题。正文读者不会被一整块红色错误打断。",
    html: () => docShell(qblock({ err: true, stale: true, more: true })),
  },
  empty: {
    label: "空结果",
    cap: "<b>空结果</b>：一行淡墨复述条件，不占大块空白。",
    html: () => docShell(qblock({ count: 0, empty: true })),
  },
  readonly: {
    label: "只读文档",
    cap: "<b>只读文档 / 分享出去</b>：只有来源行和表，没有工具；卡片名仍可点开。",
    html: () => docShell(qblock({ readonly: true, show: true, more: true })),
  },
};
