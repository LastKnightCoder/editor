/* 渐变背景样板间 · 交互与渲染（视觉参考，非实现源） */

const STYLES = [
  [
    "mist",
    "A 晨雾",
    "四角柔光，静态。渐变只出现在白色大卡外面：侧栏、标题栏和大卡四周的留白。最克制，长时间阅读写作也不打扰。",
    ["静态，零性能开销", "侧栏与正文共用一层底，保持融合骨架", "卡片仍是实底，可读性不受影响"],
  ],
  [
    "aurora",
    "B 极光",
    "三团大色块在窗口后缓慢漂移（30 秒一个来回），叠一层颗粒噪点，接近 Arc 空白页的质感。最「炫」，存在感也最强。",
    [
      "可在设置里单独关「动态效果」",
      "系统开启减少动态效果时自动静止",
      "动画只用 transform，GPU 合成，不触发重排",
    ],
  ],
  [
    "horizon",
    "C 天光",
    "只在窗口顶部铺一道渐变，往下自然溶进纸底，像页面头顶的一片天。标题栏与侧栏头部有色，正文区域保持干净。",
    ["渐变只占上方约 40%", "对现有页面的视觉影响最小", "适合内容密集的页面"],
  ],
  [
    "wash",
    "D 晕染",
    "背后同晨雾；另让渐变从白色大卡的顶边渗进纸面约 150px，往下淡回纯白。大卡和外面的颜色连成一片，标题区有色、正文区干净。",
    [
      "正文主体仍是纯白实底",
      "大卡顶部的渐变只是叠一层，不影响内容",
      "实现上要给大卡加一层顶部渐变，需要统一大卡外壳",
    ],
  ],
  [
    "glass",
    "E 磨砂",
    "背后色团更浓，白色大卡本身变成约 72% 不透明的磨砂纸，隐约透出后面的颜色。整体最通透、最「新」。",
    [
      "backdrop-filter 有性能成本，大面积使用要实测",
      "开关渐变时大卡在实底与磨砂间切换",
      "文字对比度要按最浓的背景色重新校验",
    ],
  ],
];
const THEMES = [
  ["paper", "暖纸", "#c06a3f"],
  ["ocean", "海盐", "#3d6fb3"],
  ["mint", "薄荷", "#33805c"],
  ["sakura", "樱花", "#c22e5f"],
  ["wisteria", "紫藤", "#7252b5"],
  ["ink", "水墨", "#435460"],
];
const MODES = [
  ["light", "浅色"],
  ["dark", "深色"],
];
const PAGES = [
  ["home", "今日页"],
  ["settings", "设置 · 外观"],
];
const VIEWS = [
  ["single", "单窗口"],
  ["grid", "六主题对照"],
];
const INTENSITY = [
  ["soft", "柔和"],
  ["vivid", "鲜明"],
  ["bold", "浓烈"],
];

const state = Object.assign(
  {
    style: "aurora",
    intensity: "soft",
    theme: "paper",
    mode: "light",
    page: "home",
    view: "single",
    on: true,
    motion: true,
  },
  JSON.parse(localStorage.getItem("gradient-bg") || "{}")
);
if (!state.intensity) state.intensity = "vivid";
if (!STYLES.some(x => x[0] === state.style)) state.style = "mist";
const save = () => localStorage.setItem("gradient-bg", JSON.stringify(state));

const icon = name => `<i data-lucide="${name}"></i>`;

function sidebar() {
  const item = (ic, label) => `<a>${icon(ic)}<span>${label}</span></a>`;
  const home = state.page === "home";
  return `
  <aside class="side">
    <div class="lights"><i></i><i></i><i></i></div>
    <div class="ws"><b>T</b>我的知识库</div>
    <a class="${home ? "on" : ""}" data-page="home">${icon("sun")}<span>今日</span></a>
    ${item("search", "搜索")}
    ${item("message-circle", "AI 对话")}
    <div class="sec">知识</div>
    ${item("file-text", "文档")}
    ${item("folder-kanban", "项目")}
    ${item("layers", "卡片")}
    ${item("presentation", "白板")}
    <div class="sec">日常</div>
    ${item("notebook-pen", "日记")}
    ${item("list-checks", "待办")}
    ${item("calendar", "日历")}
    <span style="flex:1"></span>
    <a class="${home ? "" : "on"}" data-page="settings">${icon("settings")}<span>设置</span></a>
  </aside>`;
}

function homePage() {
  const bars = [38, 62, 44, 80, 56, 92, 70]
    .map((h, i) => `<i class="${i === 5 ? "hi" : ""}" style="height:${h}%"></i>`)
    .join("");
  return `
  <section class="hello ${state.page === "home" ? "on" : ""}">
    <h1>下午好，今天是 11 月 13 日</h1>
    <p>本周写了 6,240 字，还有 3 件待办。</p>
    <div class="cards">
      <div class="card span2">
        <h3>${icon("clock")}最近编辑</h3>
        <div class="row"><span class="dot"></span><span class="t">渐变背景 · 设计方案对比</span><span class="d">10 分钟前</span></div>
        <div class="row"><span class="dot" style="background:var(--ink-3)"></span><span class="t">实时协作架构拆分笔记</span><span class="d">今天 14:20</span></div>
        <div class="row"><span class="dot" style="background:var(--ink-3)"></span><span class="t">读书笔记 ·《设计中的设计》第三章</span><span class="d">昨天</span></div>
        <div class="row"><span class="dot" style="background:var(--ink-3)"></span><span class="t">0.63.0 发布说明草稿</span><span class="d">11 月 10 日</span></div>
      </div>
      <div class="card">
        <h3>${icon("pen-line")}本周字数</h3>
        <div class="big">6,240</div>
        <div class="bars">${bars}</div>
      </div>
      <div class="card">
        <h3>${icon("list-checks")}今日待办</h3>
        <div class="check done"><s></s><span>整理主题色板</span></div>
        <div class="check"><s></s><span>挑选渐变背景方案</span></div>
        <div class="check"><s></s><span>回复协作评审意见</span></div>
        <div class="check"><s></s><span>周报</span></div>
      </div>
      <div class="card span2">
        <h3>${icon("sparkles")}今日灵感</h3>
        <p style="margin:0;color:var(--ink-2)">「好的界面像一张纸：颜色在边缘呼吸，内容在中心安静。」</p>
        <p class="muted" style="margin:8px 0 0">来自 · 卡片 #128</p>
      </div>
    </div>
  </section>`;
}

function themeThumb([key, name]) {
  return `<div class="th ${state.theme === key ? "on" : ""}" data-theme-pick="${key}">
    <div class="pv" data-theme="${key}" data-mode="${state.mode}" data-intensity="${state.intensity}"
      style="background:radial-gradient(70% 80% at 0% 0%, var(--g1), transparent 70%),radial-gradient(70% 80% at 100% 100%, var(--g3), transparent 70%),linear-gradient(135deg,var(--g2),var(--page))"><i style="background:color-mix(in oklab, var(--surface) 80%, transparent)"></i></div>
    ${name}</div>`;
}

function settingsPage() {
  const seg = (k, list) =>
    `<div class="seg">${list.map(([v, l]) => `<span class="${state[k] === v ? "on" : ""}" data-set="${k}" data-v="${v}">${l}</span>`).join("")}</div>`;
  const tog = (k, dis) =>
    `<div class="toggle ${state[k] ? "on" : ""} ${dis ? "dis" : ""}" data-toggle="${k}"></div>`;
  return `
  <section class="set ${state.page === "settings" ? "on" : ""}">
    <h1>外观</h1>
    <div class="panel">
      <div class="opt"><div class="l"><b>主题</b><span>每个主题自带一套渐变配色</span></div></div>
      <div class="themes" style="padding-top:0">${THEMES.map(themeThumb).join("")}</div>
      <div class="opt"><div class="l"><b>深浅模式</b></div>${seg("mode", MODES)}</div>
    </div>
    <div class="panel">
      <div class="opt"><div class="l"><b>渐变背景</b><span>按主题在窗口背后铺一层柔和渐变；关闭后回到纯色纸底</span></div>${tog("on")}</div>
      <div class="opt"><div class="l"><b>强度</b><span>柔和：淡彩；鲜明：明亮但不刺眼（默认）；浓烈：高饱和满版色</span></div>${seg("intensity", INTENSITY)}</div>
      ${state.style === "aurora" ? `<div class="opt"><div class="l"><b>动态效果</b><span>色团缓慢流动；系统开启「减少动态效果」时始终静止</span></div>${tog("motion", !state.on)}</div>` : ""}
    </div>
  </section>`;
}

function windowHtml(theme = state.theme) {
  return `
  <div class="win" data-theme="${theme}" data-mode="${state.mode}" data-style="${state.style}" data-intensity="${state.intensity}" data-on="${state.on ? 1 : 0}" data-motion="${state.motion ? 1 : 0}">
    <div class="bg"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="grain"></span></div>
    ${sidebar()}
    <div class="right">
      <div class="title"><span class="crumb">${state.page === "home" ? "今日" : "设置"}</span><span class="sp"></span>
        <span class="ib">${icon("search")}</span><span class="ib">${icon("panel-right")}</span></div>
      <main class="main">${homePage()}${settingsPage()}</main>
    </div>
  </div>`;
}

function renderBar() {
  const lists = {
    style: STYLES.map(s => [s[0], s[1]]),
    intensity: INTENSITY,
    theme: THEMES,
    mode: MODES,
    page: PAGES,
    view: VIEWS,
  };
  document.querySelectorAll(".bar .grp").forEach(g => {
    const k = g.dataset.k;
    g.innerHTML = lists[k]
      .map(
        ([v, l, c]) =>
          `<button class="${state[k] === v ? "on" : ""}" data-set="${k}" data-v="${v}">${c ? `<span class="sw" style="background:${c}"></span>` : ""}${l}</button>`
      )
      .join("");
  });
  document.body.dataset.theme = state.theme;
  document.body.dataset.mode = state.mode;
}

function fit() {
  const stage = document.getElementById("stage");
  const win = stage.querySelector(".win");
  if (win) {
    const s = Math.min((stage.clientWidth - 48) / 1240, (stage.clientHeight - 40) / 780, 1.15);
    win.style.transform = `scale(${s})`;
  }
  document.querySelectorAll(".cell .box").forEach(box => {
    box.querySelector(".win").style.transform = `scale(${box.clientWidth / 1240})`;
  });
}

function renderNote() {
  const s = STYLES.find(x => x[0] === state.style);
  document.getElementById("note").innerHTML =
    `<h4>${s[1]}</h4><p>${s[2]}</p><ul>${s[3].map(t => `<li>${t}</li>`).join("")}</ul>`;
}

function render() {
  renderBar();
  const stage = document.getElementById("stage");
  const grid = document.getElementById("grid");
  const single = state.view === "single";
  stage.style.display = single ? "grid" : "none";
  grid.classList.toggle("on", !single);
  stage.innerHTML = single ? windowHtml() : "";
  grid.innerHTML = single
    ? ""
    : THEMES.map(
        ([k, n]) =>
          `<div class="cell"><div class="box" data-theme-pick="${k}" data-view-single>${windowHtml(k)}</div>${n}</div>`
      ).join("");
  renderNote();
  lucide.createIcons();
  fit();
  save();
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-set],[data-toggle],[data-theme-pick],[data-page]");
  if (!t) return;
  if (t.dataset.set) state[t.dataset.set] = t.dataset.v;
  else if (t.dataset.toggle) state[t.dataset.toggle] = !state[t.dataset.toggle];
  else if (t.dataset.themePick) {
    state.theme = t.dataset.themePick;
    if (t.hasAttribute("data-view-single")) state.view = "single";
  } else if (t.dataset.page) state.page = t.dataset.page;
  render();
});
document.addEventListener("keydown", e => {
  if (e.key === "b" || e.key === "B") {
    state.on = !state.on;
    render();
  }
  if (e.key === "n" || e.key === "N") document.getElementById("note").classList.toggle("on");
});
window.addEventListener("resize", fit);
render();
