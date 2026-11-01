// 产品外壳：桌面设置浮层与手机设置页。只画与本任务相关的骨架，其余设置项为静态导航
const NAV = [
  ["通用", [["palette", "外观"]]],
  [
    "数据",
    [
      ["refresh", "同步", true],
      ["hdd", "资源存储"],
      ["archive", "剪藏与缓存"],
      ["swap", "导入与导出"],
    ],
  ],
  ["连接", [["globe", "浏览器扩展"]]],
  [
    "AI 服务",
    [
      ["sparkles", "大语言模型"],
      ["layers", "嵌入模型"],
    ],
  ],
];

window.shell = {
  // tabs: null 不画页签；否则 [label, on] 数组
  desktop({ body, overlay = "", tabs = null }) {
    const nav = NAV.map(
      ([g, items]) =>
        `<div class="nav-g"><div>${g}</div>${items
          .map(
            ([ic, label, on]) =>
              `<div class="nav-i ${on ? "on" : ""}">${icon(ic)}<span>${label}</span></div>`
          )
          .join("")}</div>`
    ).join("");
    const tabRow = tabs
      ? `<div class="tabs" role="tablist">${tabs.map(([l, on]) => `<span class="tab ${on ? "on" : ""}">${l}</span>`).join("")}</div>`
      : "";
    return `<div class="win" data-frame>
      <div class="side"><div class="lights"><i></i><i></i><i></i></div>
        <div class="back">${icon("arrowL")}<span>返回应用</span></div>${nav}</div>
      <div class="col"><div class="tbar"></div><div class="scroll"><div class="inner">
        <header class="page-h"><h1>同步</h1><p>在局域网自动同步已配对设备，或通过存储服务同步数据库与资源</p></header>
        ${tabRow}${body}
      </div></div></div>${overlay}${shell.rebuild()}${shell.toast()}</div>`;
  },
  phone({ title = "同步", body, dock = "", overlay = "", headEnd = "" }) {
    return `<div class="phone" data-frame>
      <div class="sbar"><span class="num">9:41</span><span class="r">${icon("wifi", "sm")}<span class="bat"></span></span></div>
      <div class="hdr"><span class="back">${icon("chevL", "lg")}设置</span><h2>${title}</h2><span class="end">${headEnd}</span></div>
      <div class="body ${dock ? "with-dock" : ""}">${body}</div>
      ${dock ? `<div class="m-dock">${dock}</div>` : ""}${overlay}${shell.toast(true)}<div class="home"></div></div>`;
  },
  toast(mobile) {
    const t = window.STATE.toast;
    if (!t) return "";
    return mobile
      ? `<div class="m-toast">${t}</div>`
      : `<div class="toast">${icon("checkCircle")}<span>${t}</span></div>`;
  },
  // 覆盖完成：桌面重建当前库窗口的整窗过渡
  rebuild() {
    return window.STATE.rebuilding
      ? `<div class="rebuild">${icon("refresh", "lg spin")}<div>正在重新打开「${ui.d().replicaLibrary}」…</div></div>`
      : "";
  },
};
