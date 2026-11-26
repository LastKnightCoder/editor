const GROUPS = [
  { id: "page", name: "独立数据库", states: PAGE_STATES, render: s => page(s.o) },
  { id: "create", name: "新建", states: CREATE_STATES, render: s => s.html() },
  { id: "block", name: "正文查询块", states: BLOCK_STATES, render: s => s.html() },
];
const S = { g: "page", s: "browse", theme: "paper" };
const fromHash = () => {
  const [g, s] = location.hash.slice(1).split("/");
  if (GROUPS.some(x => x.id === g)) {
    S.g = g;
    S.s = s;
  }
};

function render() {
  const g = GROUPS.find(x => x.id === S.g);
  if (!g.states[S.s]) S.s = Object.keys(g.states)[0];
  const st = g.states[S.s];
  document.documentElement.dataset.theme = S.theme;
  document.getElementById("ctrl").innerHTML = `<h1>查询数据库 · 重设计</h1>
    ${GROUPS.map(x => `<button class="step ${x.id === S.g ? "on" : ""}" data-g="${x.id}">${x.name}</button>`).join("")}
    <span class="sp"></span>
    <button class="step ${S.theme === "paper" ? "on" : ""}" data-t="paper">纸</button><button class="step ${S.theme === "cocoa" ? "on" : ""}" data-t="cocoa">可可</button>
    <div style="flex-basis:100%;height:6px"></div>
    <span class="grp-l">${g.name}</span>
    ${Object.entries(g.states)
      .map(
        ([k, v]) =>
          `<button class="step ${k === S.s ? "on" : ""}" data-s="${k}">${v.label}</button>`
      )
      .join("")}`;
  document.getElementById("caption").innerHTML = st.cap;
  document.getElementById("screen").innerHTML =
    g.render(st) + (S.g === "page" && S.s === "browse" ? NOTES : "");
  history.replaceState(null, "", `#${S.g}/${S.s}`);
}
document.addEventListener("click", e => {
  const b = e.target.closest(".ctrl button");
  if (!b) return;
  if (b.dataset.g) {
    S.g = b.dataset.g;
    S.s = "";
  }
  if (b.dataset.s) S.s = b.dataset.s;
  if (b.dataset.t) S.theme = b.dataset.t;
  render();
});
document.addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const keys = Object.keys(GROUPS.find(x => x.id === S.g).states);
  const i = keys.indexOf(S.s) + (e.key === "ArrowRight" ? 1 : -1);
  if (keys[i]) {
    S.s = keys[i];
    render();
  }
});

const NOTES = `<div class="notes">
  <div class="nbox"><h3>现状的问题</h3><ul>
    <li>源码面板默认展开、铺 hover 深底，打开数据库第一眼是代码而不是数据。</li>
    <li>「查询代码 / N 条结果 / 显示列 / 刷新」一排文字按钮，和下面数据库自带的视图栏重复（显示列两处都有）。</li>
    <li>参数是一个裸 JSON 文本框，写错只能看红字。</li>
    <li>错误、保存失败、AI 错误、参数错误拼成一行红字，看不出该点哪个按钮。</li>
    <li>新建弹窗把整套编辑器塞进 1080×760，创建前后是两个不同的编辑环境。</li>
    <li>正文块是 360px 卡片底 + 投影，和正文其它块不在一张纸上。</li></ul></div>
  <div class="nbox"><h3>新方案的骨架</h3><ul>
    <li>结果优先：源码收起在「查询」按钮后；状态胶囊一枚说清实时 / 条数 / 时间，点它刷新。</li>
    <li>一套视图工具：显示列、筛选、排序只走数据库视图栏。</li>
    <li>源码面板三行结构：语言 + 参数胶囊 / 代码 / AI 输入；自动保存，无运行按钮。</li>
    <li>每种问题一个位置：语法错误在源码底部、运行失败与保存失败在标题下提示条、AI 结果在 AI 行。</li>
    <li>新建只选起点，编辑都在真实页面里完成；正文块与表格块同一张纸，工具只在选中时出现。</li></ul></div>
</div>`;
fromHash();
render();
