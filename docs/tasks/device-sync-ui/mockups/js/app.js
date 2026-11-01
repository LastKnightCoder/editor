// 原型状态机：控制区在产品框之外；产品内按钮只改演示状态，不调用任何真实接口
const VIEWS = [
  ["coord", "桌面 · 协调电脑"],
  ["conn", "桌面 · 连接电脑"],
  ["mobile", "手机 · 连接端"],
];
const RENDER = { A: window.schemeA, B: window.schemeB, C: window.schemeC };
const STATE = (window.STATE = {
  scheme: "A",
  view: "coord",
  status: "unset",
  api: "now",
  mode: "light",
  menu: null,
  toast: null,
  rebuilding: false,
  remembered: {},
  open: {},
});
let timers = [];

function readHash() {
  const [scheme, view, status, api] = location.hash.slice(1).split("/");
  if (RENDER[scheme]) STATE.scheme = scheme;
  if (VIEWS.some(v => v[0] === view)) STATE.view = view;
  if (status) STATE.status = decodeURIComponent(status);
  if (api === "plus") STATE.api = "plus";
}
const writeHash = () =>
  history.replaceState(null, "", `#${STATE.scheme}/${STATE.view}/${STATE.status}/${STATE.api}`);
const statesOf = () => SCHEME_META[STATE.scheme].states[STATE.view];
// 覆盖进行中/完成/失败等过渡态在精简方案里不进控制区，但仍可经产品按钮到达
const TRANSIENT = [
  "ow-running",
  "ow-done",
  "ow-failed",
  "syncing",
  "pasted",
  "firstsync",
  "assets",
  "revoke",
  "pairing",
  "on",
  "fresh",
  "re-pair",
  "copies-open",
  "paused",
  "invalid",
  "pair-sheet",
  "m-syncing",
  "conn-dialog",
  "adv",
];
function normalize() {
  const list = statesOf().map(s => s[0]);
  if (!list.includes(STATE.status) && !TRANSIENT.includes(STATE.status)) STATE.status = list[0];
}

function chip(label, on, attrs, extra = "") {
  return `<button class="chip ${on ? "on" : ""} ${extra}"${ui.attrs(attrs)}>${label}</button>`;
}
function renderCtl() {
  const schemes = Object.entries(SCHEME_META)
    .map(([k, m]) =>
      chip(`${k} · ${m.name}`, STATE.scheme === k, { "data-scheme": k }, k === "A" ? "rec" : "")
    )
    .join("");
  const views = VIEWS.map(([k, l]) => chip(l, STATE.view === k, { "data-view": k })).join("");
  const states = statesOf()
    .map(([k, l]) => chip(l, STATE.status === k, { "data-status": k }))
    .join("");
  const demo =
    STATE.view === "coord" && STATE.status === "pairing"
      ? `<span class="sep"></span>${chip("模拟：对方完成配对", false, { "data-demo": "paired" }, "act")}`
      : "";
  document.getElementById("ctl").innerHTML = `
    <div class="row"><span class="title">局域网设备同步 · 原型<small>原型控制区，不属于产品界面</small></span>
      <span class="demo-tag">演示数据</span>
      <span class="grp"><span class="lbl">方案</span>${schemes}</span></div>
    <div class="row"><span class="grp"><span class="lbl">视角</span>${views}</span><span class="sep"></span>
      <span class="grp"><span class="lbl">接口</span>${chip("现有接口", STATE.api === "now", { "data-api": "now" })}${chip("补充字段后", STATE.api === "plus", { "data-api": "plus" })}</span><span class="sep"></span>
      <span class="grp"><span class="lbl">明暗</span>${chip("浅色", STATE.mode === "light", { "data-mode": "light" })}${chip("深色", STATE.mode === "dark", { "data-mode": "dark" })}</span></div>
    <div class="row"><span class="grp"><span class="lbl">状态</span>${states}</span>${demo}</div>`;
}
function renderNotes() {
  const meta = SCHEME_META[STATE.scheme];
  const n = NOTES[`${STATE.view}.${STATE.status}`] || {};
  const extra = RENDER[STATE.scheme].notes?.(STATE.view, STATE.status) || [];
  const list = (title, items, cls = "") =>
    items?.length
      ? `<h4>${title}</h4><ul>${items.map(x => `<li class="${cls}">${x}</li>`).join("")}</ul>`
      : "";
  document.getElementById("notes").innerHTML =
    `<h3>方案 ${STATE.scheme} · ${meta.name}</h3><p class="tagline">${meta.tagline}</p>
    ${list("这一屏的设计", extra)}${list("数据来源（现有接口）", n.src)}${list("依赖", n.need, "need")}
    <h4>说明</h4><ul><li>设备名、时间、配对信息均为演示数据。</li><li>「补充字段后」只用于看依赖落地后的样子，主方案按「现有接口」成立。</li></ul>`;
}
function render() {
  normalize();
  document.documentElement.dataset.mode = STATE.mode;
  renderCtl();
  document.getElementById("frame").innerHTML = RENDER[STATE.scheme][STATE.view](STATE.status);
  renderNotes();
  writeHash();
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}
function toast(text) {
  STATE.toast = text;
  timers.push(
    setTimeout(() => {
      STATE.toast = null;
      render();
    }, 2600)
  );
}
function go(target) {
  const [view, status] = target.includes(":") ? target.split(":") : [STATE.view, target];
  STATE.view = view;
  STATE.status = status;
  STATE.remembered[`${STATE.scheme}.${STATE.view}`] = status;
}
function afterThen(target, text) {
  // 桌面覆盖完成：先走一次「重新打开当前库」的整窗过渡
  if (target === "ow-done" && STATE.view !== "mobile") {
    STATE.rebuilding = true;
    render();
    timers.push(
      setTimeout(() => {
        STATE.rebuilding = false;
        go(target);
        toast(text || "已换成协调电脑的版本，原资料库已备份");
        render();
      }, 1300)
    );
    return;
  }
  go(target);
  if (text) toast(text);
  render();
}

document.addEventListener("click", e => {
  const el = e.target.closest(
    "[data-scheme],[data-view],[data-status],[data-api],[data-mode],[data-demo],[data-go],[data-toast],[data-menu],[data-act],[data-toggle]"
  );
  if (!el) {
    if (STATE.menu) {
      STATE.menu = null;
      render();
    }
    return;
  }
  const d = el.dataset;
  if (d.scheme || d.view || d.status) {
    clearTimers();
    STATE.toast = null;
    STATE.menu = null;
    STATE.rebuilding = false;
    if (d.scheme) STATE.scheme = d.scheme;
    if (d.view) STATE.view = d.view;
    if (d.scheme || d.view)
      STATE.status = STATE.remembered[`${STATE.scheme}.${STATE.view}`] || statesOf()[0][0];
    if (d.status) go(d.status);
    return render();
  }
  if (d.api) {
    STATE.api = d.api;
    return render();
  }
  if (d.mode) {
    STATE.mode = d.mode;
    return render();
  }
  if (d.demo === "paired") {
    go("on");
    toast("「我的手机」已配对");
    return render();
  }
  if (d.menu) {
    STATE.menu = STATE.menu === d.menu ? null : d.menu;
    return render();
  }
  if (d.toggle) {
    STATE.open[d.toggle] = !STATE.open[d.toggle];
    STATE.menu = null;
    return render();
  }
  STATE.menu = null;
  if (d.act === "revoke-confirm") {
    go("on");
    toast("已解除「LAPTOP-8F2KQ」的配对");
    return render();
  }
  if (d.go) go(d.go);
  if (d.toast) toast(d.toast);
  if (d.then) timers.push(setTimeout(() => afterThen(d.then, d.thenToast), 1500));
  render();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && STATE.menu) {
    STATE.menu = null;
    render();
  }
});

readHash();
render();
