// lucide 图标路径（仅 mockup 用）
const P = {
  card: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  article:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  diary:
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  notebook:
    '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.38 5.63a1 1 0 0 0-3-3l-5 5a2 2 0 0 0-.5.86l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .86-.5z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const ico = (k, sw = 2) =>
  `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg></span>`;

const ITEMS = {
  card: { label: "新卡片", tone: "--tau-tag-2" },
  article: { label: "新文章", tone: "--tau-accent" },
  mic: { label: "说一段", tone: "--tau-tag-5" },
  calendar: { label: "新日程", tone: "--tau-tag-3" },
  diary: { label: "写日记", tone: "--tau-tag-1" },
};

const today = `
  <div class="page">
    <h3>今天</h3>
    <div class="sub">11月25日 周三</div>
    <div class="card"><b>移动端 Dock 重设计</b>弧形菜单太挤，标签压住导航，换成竖排菜单。<div class="m">卡片 · 10:24</div></div>
    <div class="card"><b>读《设计心理学》第 3 章</b>可供性与意符：按钮看起来要能按。<div class="m">文章 · 昨天</div></div>
    <div class="card"><b>14:00 周会</b>同步移动端 0.5.2 范围。<div class="m">日程</div></div>
  </div>`;

const dock = (open, fabIcon = "plus") => `
  <div class="dock"><div class="bar">
    <div class="tab on">${ico("home")}今天</div>
    <div class="tab">${ico("card")}卡片</div>
    <div class="fab-slot"><div class="fab ${open ? "open" : ""}">${ico(fabIcon, 2.6)}</div></div>
    <div class="tab">${ico("notebook")}日记</div>
    <div class="tab">${ico("user")}我的</div>
  </div></div>`;

const ARC = { card: -162, article: -126, mic: -90, calendar: -54, diary: -18 };
const arc = () =>
  `<div class="arc">${Object.entries(ARC)
    .map(([k, a]) => {
      const r = (a * Math.PI) / 180;
      const x = Math.cos(r) * 96;
      const y = Math.sin(r) * 96 - 32;
      const t = ITEMS[k].tone;
      return `<div class="it" style="left:${x}px;top:${y}px;background:linear-gradient(var(${t}-soft),var(${t}-soft)),linear-gradient(var(${t}-soft),var(${t}-soft)),var(--tau-bg-surface);color:var(${t})"><span class="lb">${ITEMS[k].label}</span>${ico(k, 1.8)}</div>`;
    })
    .join("")}</div>`;

// A：最常用的放最下，离 ＋ 最近
const menuA = press => `
  <div class="menu">
    <div class="row-it">${ico("diary")}写日记</div>
    <div class="row-it">${ico("calendar")}新日程</div>
    <div class="row-it">${ico("article")}新文章</div>
    <div class="row-it ${press ? "press" : ""}">${ico("card")}新卡片</div>
    <hr />
    <div class="row-it voice">${ico("mic")}说一段<span class="hint">长按 ＋</span></div>
  </div>`;

const sheetB = `
  <div class="sheet">
    <div class="grab"></div>
    <h4>新建</h4>
    <div class="voice-btn">${ico("mic", 2.2)}按住说一段</div>
    <div class="grid">
      ${["card", "article", "calendar", "diary"].map(k => `<div class="tile">${ico(k)}${ITEMS[k].label}</div>`).join("")}
    </div>
  </div>`;

const quickC = drop => `
  <div class="qc-top">
    <span class="x">${ico("x")}</span>
    <span class="switch">卡片${ico("down", 2.4)}</span>
    <span class="save">保存</span>
  </div>
  <div class="qc-body">写点什么…</div>
  ${
    drop
      ? `<div class="scrim" style="background:transparent"></div><div class="drop">${[
          ["card", "卡片", true],
          ["article", "文章"],
          ["calendar", "日程"],
          ["diary", "日记"],
        ]
          .map(
            ([k, l, on]) =>
              `<div class="row-it ${on ? "on" : ""}">${ico(k)}${l}${on ? `<span class="ck">${ico("check", 2.6)}</span>` : ""}</div>`
          )
          .join("")}</div>`
      : ""
  }
  <div class="kb"></div>`;

const frame = (inner, cap) => `
  <div>
    <div class="phone"><div class="status"><span>9:41</span><span>●●● ▮</span></div>${inner}</div>
    <div class="cap">${cap}</div>
  </div>`;

const VARIANTS = {
  now: () => frame(today + `<div class="scrim"></div>` + dock(true) + arc(), "轻点 ＋ · 弧形展开"),
  a: () =>
    frame(today + dock(false), "收起") +
    frame(today + `<div class="scrim"></div>` + menuA(true) + dock(true), "轻点 ＋ · 竖排菜单"),
  b: () => frame(today + `<div class="scrim"></div>` + dock(false) + sheetB, "轻点 ＋ · 底部面板"),
  c: () => frame(quickC(false), "轻点 ＋ · 直接进速记") + frame(quickC(true), "点「卡片 ▾」换类型"),
};

document.querySelectorAll(".phones").forEach(el => {
  el.innerHTML = VARIANTS[el.dataset.variant]();
});

const root = document.documentElement;
document.getElementById("theme-family").onchange = e => (root.dataset.theme = e.target.value);
document.getElementById("theme-mode").onclick = e => {
  const dark = root.dataset.mode !== "dark";
  root.dataset.mode = dark ? "dark" : "light";
  e.target.textContent = dark ? "深色" : "浅色";
};
