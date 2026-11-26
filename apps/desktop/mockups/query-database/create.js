// 新建流程与数据库列表
function listPage(overlay) {
  const cards = [
    ["读书卡片 · 近 30 天", "实时查询 · 卡片", true, "12 条"],
    ["本周待办", "实时查询 · 待办", true, "7 条"],
    ["支出明细", "自建表", false, "248 行"],
    ["阅读书单", "自建表", false, "36 行"],
    ["日记心情", "实时查询 · 日记", true, "30 条"],
  ];
  return `<div class="app">${sidebar()}<main class="paper">
    <div class="hd"><span class="title">数据库</span><span class="sp"></span>
      <div class="split"><button class="btn primary">${ic("plus", "s")}新建</button><button class="btn primary caret">${ic("chev", "xs")}</button></div></div>
    <div class="lgrid">${cards
      .map(
        ([
          t,
          d,
          live,
          m,
        ]) => `<div class="lcard"><div class="t">${ic(live ? "live" : "db", "s")}${t}</div>
      <div class="d">${d}</div><div class="m"><span>${m}</span>${live ? '<span class="lv"><span class="dot"></span>随源数据更新</span>' : ""}</div></div>`
      )
      .join("")}</div>
    ${overlay || ""}
  </main></div>`;
}

function newMenu() {
  return `<div class="menu" style="right:22px;top:52px;width:280px">
    <div class="mi">${ic("table")}<span class="tx"><b>空白数据库</b><span>自己定义列，手动录入</span></span></div>
    <div class="mi hl">${ic("live")}<span class="tx"><b>实时查询</b><span>从卡片、待办、日记等汇总，随原文更新</span></span></div>
  </div>`;
}

function createDialog(o) {
  const srcs = SOURCES.map(
    s =>
      `<button class="srcb ${o.sel === s.id ? "sel" : ""}">${ic(s.icon)}<span><b>${s.name}</b><span>${s.fields}</span></span></button>`
  ).join("");
  return `<div class="scrim"><div class="dlg">
    <div class="dlg-h"><span class="t">新建实时查询</span><span class="sp"></span><button class="icon-btn">${ic("x")}</button></div>
    <div class="dlg-b">
      <div class="ask ${o.typed ? "typed" : ""}">${ic("spark")}
        ${o.typed ? `<span class="val">最近 30 天带「读书」标签的卡片，显示字数和更新时间<span class="caret"></span></span>` : '<span class="ph">描述你想看的数据，AI 写好查询</span>'}
        <button class="btn sm ${o.typed ? "primary" : ""}" ${o.typed ? "" : "disabled"}>生成</button>
      </div>
      <div class="or">或者从一个来源开始</div>
      <div class="srcs">${srcs}</div>
      ${o.sel ? `<div class="pick-hint">${ic("check", "s")}将从「卡片」开始，先列出标题、标签、更新时间，进入后再改。</div>` : ""}
    </div>
    <div class="dlg-f"><span class="hint">${o.typed ? "生成在后台进行，可以先关掉这个窗口。" : "也可以直接写查询语言或 JavaScript。"}</span>
      <button class="btn">写代码</button>
      <button class="btn primary" ${o.sel || o.typed ? "" : "disabled"}>${o.typed ? "生成并打开" : "创建"}</button></div>
  </div></div>`;
}

const CREATE_STATES = {
  list: {
    label: "列表",
    cap: "<b>数据库列表</b>：查询数据库用「实时」图标与「随源数据更新」区分自建表，条数取上次结果。原来卡片上写死的「实时查询」替代了行数，现在仍给真实条数。",
    html: () => listPage(),
  },
  menu: {
    label: "新建菜单",
    cap: "<b>新建入口</b>：主按钮的下拉里两项，直接说清区别。不再先进一个只有两个按钮的弹窗。",
    html: () => listPage(newMenu()),
  },
  pick: {
    label: "选起点",
    cap: "<b>选起点</b>：上面是一句话让 AI 写，下面是来源网格（每个来源列出主要字段）。不把整套源码编辑器塞进 1080×760 的弹窗里——选完就进数据库页编辑，结果在真实页面里看。",
    html: () => listPage(createDialog({})),
  },
  picked: {
    label: "已选来源",
    cap: "<b>选了来源</b>：生成一条起步查询，「创建」后打开页面，源码面板默认展开。",
    html: () => listPage(createDialog({ sel: "cards" })),
  },
  typed: {
    label: "描述需求",
    cap: "<b>一句话生成</b>：AI 生成是后台任务——点「生成并打开」后弹窗关闭，数据库立刻出现在列表并打开，页面处于「AI 编写中」状态，写完即落库。名称由 AI 一并给出，可在标题处直接改。",
    html: () => listPage(createDialog({ typed: true })),
  },
  opened: {
    label: "创建后",
    cap: "<b>创建后的第一屏</b>：标题可直接改，源码展开，AI 在底行编写，列头先出。",
    html: () =>
      page({
        title: "最近 30 天的读书卡片",
        status: "ai",
        srcOpen: true,
        ai: "busy",
        firstLoad: true,
      }),
  },
};
