// 共用件与文案。动作约定：data-go 切状态 · data-then 延时后再切 · data-toast 提示 · data-menu 开合菜单 · data-api 读演示数据
const ui = {};
window.ui = ui;

ui.d = () => (window.STATE.api === "plus" ? DEMO.plus : DEMO.now);
ui.attrs = (a = {}) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, "&quot;")}"`))
    .join("");
ui.act = o => ({
  "data-go": o.go,
  "data-then": o.then,
  "data-then-toast": o.thenToast,
  "data-toast": o.toast,
  "data-menu": o.menu,
  "data-act": o.act,
});
ui.btn = (label, o = {}) =>
  `<button class="btn ${o.cls || ""}"${ui.attrs({ ...ui.act(o), disabled: o.disabled, title: o.title })}>${o.icon ? icon(o.icon, o.spin ? "spin" : "") : ""}${label}</button>`;
ui.ibtn = (name, o = {}) =>
  `<button class="btn ghost icon ${o.cls || ""}" aria-label="${o.label || "更多"}"${ui.attrs({ "data-menu": o.menu, "data-go": o.go })}>${icon(name)}</button>`;
ui.mbtn = (label, o = {}) =>
  `<button class="m-btn ${o.cls || ""}"${ui.attrs({ ...ui.act(o), disabled: o.disabled })}>${o.icon ? icon(o.icon, o.spin ? "spin" : "") : ""}${label}</button>`;
ui.menu = (id, items, pos = "right:0;top:38px") =>
  window.STATE.menu === id
    ? `<div class="menu" style="${pos}">${items
        .map(it =>
          it === "-"
            ? `<div style="height:6px"></div>`
            : `<button class="mi ${it.danger ? "danger" : ""}"${ui.attrs({ ...ui.act(it), disabled: it.disabled })}>${it.icon ? icon(it.icon) : ""}<span>${it.label}${it.sub ? `<small>${it.sub}</small>` : ""}</span></button>`
        )
        .join("")}</div>`
    : "";
ui.lead = (tone, ic, spin) =>
  `<span class="lead ${tone}">${icon(ic, `lg${spin ? " spin" : ""}`)}</span>`;
ui.band = ({ tone, ic, spin, t, s, acts = "" }) =>
  `<div class="band">${ui.lead(tone, ic, spin)}<div class="txt"><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ""}</div><div class="acts">${acts}</div></div>`;
ui.mstatus = ({ tone, ic, spin, t, s }) =>
  `<div class="m-status">${ui.lead(tone, ic, spin)}<div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ""}</div></div>`;
ui.code = (dead = false, o = {}) =>
  `<div class="code-field ${dead ? "dead" : ""}"><span class="val">${DEMO.code}</span>${dead ? "" : ui.btn("复制", { cls: `sm ${o.primary === false ? "" : "primary"}`, icon: "copy", toast: "已复制配对信息（演示）" })}</div>`;
ui.peerIcon = p => (window.STATE.api === "plus" ? p.kind : "device");
ui.peerSub = p => (window.STATE.api === "plus" ? p.seen : "已配对");

// 文案单一来源：三套方案共用同一套说法
ui.T = {
  scope:
    "同步笔记、标签、数据库修改和正文里的图片；聊天记录、独立 PDF 原件、插件与账号设置不在其中。",
  offlineOk: "本机照常阅读和编辑，修改已保存在这台设备上，连上后自动补齐。",
  notAllOnline: "设备不必同时在线：每台设备连上协调电脑时，各自把修改补齐。",
  coordOnly: "一份资料库只由一台电脑协调，之后不能改由其他设备协调。",
  firstCopy: "首次配对会新建一份本机副本，现有资料库保持原样。",
  rePair: "以前配过同一份资料库时，会沿用本机副本，离线修改都保留。",
  owWhat: "以协调电脑的版本为唯一基准，重新下载当前资料库。",
  owLose: [
    "未同步到协调电脑的本机修改",
    "待同步任务、草稿与缓存",
    "撤销记录；正在编辑的窗口会重新打开",
  ],
  owLoseMobile: [
    "未同步到协调电脑的本机修改",
    "待同步任务、草稿与缓存",
    "撤销记录；正在编辑的页面会重新载入",
  ],
  owKeep: "账号、配对信息和其他资料库不受影响",
  owBackupDesk: "原资料库会先备份到 backup 文件夹",
  troubleshoot: [
    "两台设备连着同一个局域网",
    "协调电脑上的 Tau 正在运行、没有暂停连接",
    "协调电脑换了网络地址时，重新粘贴一次配对信息",
  ],
};

ui.dlgOverwrite = (phase, o = {}) => {
  const lib = o.lib || ui.d().replicaLibrary;
  if (phase === "running")
    return `<div class="scrim"><div class="dialog"><h3>正在下载协调电脑版本</h3><span class="ctx badge">${lib}</span><p>下载、校验后替换当前资料库。期间这份资料库暂停编辑，其他资料库不受影响。</p><div class="indet" style="margin:16px 0 4px"></div><div class="foot">${ui.btn("下载中…", { cls: "danger", icon: "refresh", spin: true, disabled: true })}</div></div></div>`;
  if (phase === "failed")
    return `<div class="scrim"><div class="dialog"><h3>下载没有完成</h3><span class="ctx badge">${lib}</span><p>与协调电脑的连接中断了。当前资料库已恢复原样，可以继续编辑；之前的修改都还在。</p><div class="foot">${ui.btn("关闭", { go: o.closeTo || "daily" })}${ui.btn("重试", { cls: "danger", go: "ow-running", then: "ow-done" })}</div></div></div>`;
  return `<div class="scrim"><div class="dialog"><h3>下载协调电脑版本并覆盖本机</h3><span class="ctx badge">${lib}</span>
    <p>${ui.T.owWhat}这台电脑上会丢弃：</p>
    <ul class="fact-list">${ui.T.owLose.map(x => `<li>${icon("x", "sm")}<span>${x}</span></li>`).join("")}</ul>
    <p class="impact">${icon("shield", "sm")} ${ui.T.owKeep}；${ui.T.owBackupDesk}。</p>
    <div class="foot">${ui.btn("取消", { go: o.closeTo || "daily" })}${ui.btn("下载并覆盖", { cls: "danger", go: "ow-running", then: "ow-done" })}</div></div></div>`;
};

ui.sheetOverwrite = (phase, o = {}) => {
  const lib = o.lib || ui.d().replicaLibrary;
  if (phase === "running")
    return `<div class="m-scrim"></div><div class="m-sheet"><div class="grab"></div><h3>正在下载电脑版本</h3><p>${lib} 暂停编辑，完成后自动打开新版本。请保持 Tau 在前台。</p><div class="indet" style="margin:6px 0 10px"></div><div class="acts">${ui.mbtn("下载中…", { cls: "danger", icon: "refresh", spin: true, disabled: true })}</div></div>`;
  if (phase === "failed")
    return `<div class="m-scrim"></div><div class="m-sheet"><div class="grab"></div><h3>下载没有完成</h3><p>和协调电脑的连接中断了。这台手机上的资料保持原样，可以继续编辑。</p><div class="acts">${ui.mbtn("重试", { cls: "danger", go: "ow-running", then: "ow-done", thenToast: "已换成电脑上的版本" })}${ui.mbtn("关闭", { cls: "plain", go: o.closeTo || "daily" })}</div></div>`;
  return `<div class="m-scrim" data-go="${o.closeTo || "daily"}"></div><div class="m-sheet"><div class="grab"></div>
    <h3>用电脑版本覆盖这台手机</h3><p>「${lib}」会以协调电脑为准重新下载。这台手机会丢弃：</p>
    <ul class="fact-list">${ui.T.owLoseMobile.map(x => `<li>${icon("x", "sm")}<span>${x}</span></li>`).join("")}</ul>
    <p style="font-size:13px">${ui.T.owKeep}。</p>
    <div class="acts">${ui.mbtn("下载并覆盖", { cls: "danger", go: "ow-running", then: "ow-done", thenToast: "已换成电脑上的版本" })}${ui.mbtn("取消", { cls: "plain", go: o.closeTo || "daily" })}</div></div>`;
};
