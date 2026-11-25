// lucide 图标路径（仅 mockup 用）
const P = {
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  todo: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  outdent:
    '<polyline points="7 8 3 12 7 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  indent:
    '<polyline points="3 8 7 12 3 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
  ref: '<path d="m10 18 3-3-3-3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4 11V4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  italic:
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
  strike:
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>',
  hl: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
const svg = (k, sw = 2.2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg>`;
const ib = (k, cls = "") => `<span class="ib ${cls}">${svg(k)}</span>`;
const aa = `<span class="ib aa">Aa</span>`;

const GENERAL = () =>
  aa + ["todo", "list", "outdent", "indent", "ref", "image", "undo"].map(k => ib(k)).join("");
const FORMAT = () =>
  [["bold", "on"], ["italic"], ["underline"], ["strike"], ["hl"], ["link"]]
    .map(([k, c]) => ib(k, c))
    .join("");

const toolbars = {
  now: fmt =>
    `<div class="tb-now">${
      fmt
        ? `<span class="chip">${svg("type")}格式</span>`
        : `<span class="mic">${svg("mic")}</span><span class="plus">${svg("plus", 2.4)}</span>`
    }<div class="mid fade">${fmt ? FORMAT() : GENERAL()}</div>${fmt ? aa : ""}<span class="done">${svg("check", 2.6)}完成</span></div>`,
  a: fmt =>
    `<div class="tb-a">${
      fmt
        ? `<span class="chip">${svg("type")}格式</span>`
        : `<span class="plus">${svg("plus", 2.4)}</span>${ib("mic")}`
    }<div class="mid fade">${fmt ? FORMAT() : GENERAL()}</div>${fmt ? aa : ""}<span class="done">${svg("check", 2.6)}</span></div>`,
  b: fmt =>
    `<div class="tb-b">${
      fmt
        ? `<span class="chip">${svg("type")}格式</span>`
        : `<span class="ib plus">${svg("plus", 2.4)}</span>${ib("mic")}`
    }<div class="mid fade">${fmt ? FORMAT() : GENERAL()}</div>${fmt ? aa : ""}<span class="done">完成</span></div>`,
  c: fmt =>
    `<div class="tb-c">${
      fmt ? "" : `<span class="orb plus">${svg("plus", 2.4)}</span>`
    }<div class="pillbar">${fmt ? `<span class="chip">${svg("type")}格式</span>` : ib("mic", "mic")}<div class="mid fade">${
      fmt ? FORMAT() : GENERAL()
    }</div>${fmt ? aa : ""}</div><span class="orb done">${svg("check", 2.6)}</span></div>`,
};

const keyboard = () => {
  const row = s =>
    `<div class="r">${[...s].map(c => `<span class="k">${c}</span>`).join("")}</div>`;
  return `<div class="kb">${row("qwertyuiop")}${row("asdfghjkl")}<div class="r"><span class="k w">⇧</span>${[
    ..."zxcvbnm",
  ]
    .map(c => `<span class="k">${c}</span>`)
    .join(
      ""
    )}<span class="k w">⌫</span></div><div class="r"><span class="k w">123</span><span class="k w">🌐</span><span class="k sp">空格</span><span class="k w">换行</span></div></div>`;
};

const phone = (variant, fmt) => `
  <div>
    <div class="phone">
      <div class="status"><span>9:41</span><span>●●● ▮</span></div>
      <div class="topbar"><span class="ghost">${svg("back", 2.4)}</span><span class="t">卡片</span></div>
      <div class="body">
        <div class="meta">11月25日 · 128 字</div>
        <p>周会结论：移动端编辑器的工具条要${fmt ? '<span class="sel">和键盘长成一体</span>' : "和键盘长成一体"}，少用颜色，靠层次区分主次。</p>
        <p>下周先出 mockup，再定实现范围。<span class="caret"></span></p>
      </div>
      <div class="tb-wrap">${toolbars[variant](fmt)}</div>
      ${keyboard()}
    </div>
    <div class="cap">${fmt ? "选中文字 · 格式模式" : "通用模式"}</div>
  </div>`;

document.querySelectorAll(".phones").forEach(el => {
  const v = el.dataset.variant;
  el.innerHTML = phone(v, false) + phone(v, true);
});

const root = document.documentElement;
document.getElementById("theme-family").onchange = e => (root.dataset.theme = e.target.value);
document.getElementById("theme-mode").onclick = e => {
  const dark = root.dataset.mode !== "dark";
  root.dataset.mode = dark ? "dark" : "light";
  e.target.textContent = dark ? "深色" : "浅色";
};
