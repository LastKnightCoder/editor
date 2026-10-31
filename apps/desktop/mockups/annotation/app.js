const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const icon = (id, cls = "") => `<svg class="i ${cls}"><use href="#i-${id}"/></svg>`;
const esc = s =>
  s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 主题切换
for (const [id, attr] of [
  ["sw-theme", "data-theme"],
  ["sw-mode", "data-mode"],
]) {
  $(`#${id}`).addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$(`#${id} button`).forEach(b => b.classList.toggle("on", b === btn));
    document.documentElement.setAttribute(attr, btn.dataset.v);
  });
}

// 旧样式浮层复刻
const oldPop = $("#old-pop");
$(".old-mark").addEventListener("click", e => {
  const stage = $("#old-stage").getBoundingClientRect();
  const r = e.currentTarget.getBoundingClientRect();
  oldPop.style.left = `${r.left - stage.left - 110}px`;
  oldPop.style.top = `${r.top - stage.top - 52}px`;
  oldPop.hidden = !oldPop.hidden;
});

// 卡片模板
const cardHtml = ({ n, text, mode }) => {
  const head = `<div class="pop-head"><span class="lbl"><span class="n">${n}</span>注解</span><span class="sp"></span>
    ${mode === "edit" ? `<button class="ib" data-act="copy" title="复制内容">${icon("copy")}</button><button class="ib danger" data-act="del" title="删除注解">${icon("trash")}</button>` : `<button class="ib" data-act="copy" title="复制内容">${icon("copy")}</button>`}</div>`;
  if (mode === "read") return `${head}<div class="pop-body">${esc(text)}</div>`;
  return `${head}<div class="pop-body" style="padding-bottom:8px"><textarea class="pop-edit" rows="3" placeholder="写下注解…">${esc(text)}</textarea></div>
    <div class="pop-foot"><span><span class="kbd">Esc</span> 关闭</span><span class="sp"></span><span>自动保存</span></div>`;
};

// 交互区
const live = $("#live");
const peek = $("#peek");
const card = $("#card");
const marks = () => $$(".ann", live);
let active = null;
let hoverTimer = 0;

const place = (pop, mark) => {
  const stage = live.getBoundingClientRect();
  const r = mark.getBoundingClientRect();
  const w = pop.offsetWidth || 300;
  let left = r.left - stage.left + r.width / 2 - w / 2;
  left = Math.max(0, Math.min(left, stage.width - w));
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom - stage.top + 8}px`;
};

const renderEndnotes = () => {
  const list = $("#endnotes");
  $$("li:not(.h)", list).forEach(li => li.remove());
  marks().forEach((m, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="n">${i + 1}</span><span>${m.dataset.text ? esc(m.dataset.text) : '<span style="color:var(--tau-ink-3)">（空）</span>'}</span>`;
    list.append(li);
  });
  marks().forEach(m => m.classList.toggle("empty", !m.dataset.text));
};

const closeCard = () => {
  if (!active) return;
  if (!active.dataset.text) active.remove();
  active?.classList.remove("on");
  active = null;
  card.classList.remove("show");
  renderEndnotes();
};

const openCard = mark => {
  clearTimeout(hoverTimer);
  peek.classList.remove("show");
  if (active && active !== mark) closeCard();
  active = mark;
  mark.classList.add("on");
  const n = marks().indexOf(mark) + 1;
  card.innerHTML = cardHtml({ n, text: mark.dataset.text, mode: "edit" });
  place(card, mark);
  card.classList.add("show");
  const ta = $("textarea", card);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.addEventListener("input", () => {
    mark.dataset.text = ta.value.trim();
    renderEndnotes();
    mark.classList.add("on");
  });
};

live.addEventListener("mouseover", e => {
  const mark = e.target.closest(".ann");
  if (!mark || mark === active) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (active) return;
    $(".pop-body", peek).innerHTML = mark.dataset.text
      ? `${esc(mark.dataset.text)}<span class="hint">点击编辑</span>`
      : `<span style="color:var(--tau-ink-3)">空注解</span><span class="hint">点击编辑</span>`;
    place(peek, mark);
    peek.classList.add("show");
  }, 300);
});
live.addEventListener("mouseout", e => {
  if (e.target.closest(".ann")) {
    clearTimeout(hoverTimer);
    peek.classList.remove("show");
  }
});
live.addEventListener("click", e => {
  const mark = e.target.closest(".ann");
  if (mark) return openCard(mark);
  const act = e.target.closest("[data-act]");
  if (act?.dataset.act === "del" && active) {
    active.dataset.text = "";
    closeCard();
  } else if (act?.dataset.act === "copy" && active) {
    navigator.clipboard?.writeText(active.dataset.text);
    act.innerHTML = icon("pen");
    setTimeout(() => (act.innerHTML = icon("copy")), 900);
  }
});
document.addEventListener("mousedown", e => {
  if (active && !card.contains(e.target) && !e.target.closest(".ann")) closeCard();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeCard();
});
renderEndnotes();

// 静态状态一览
const sample = "即「合意困难」（desirable difficulty），Bjork 1994 提出。";
$("#states").innerHTML = [
  [
    "悬停预览",
    "只读、无按钮，300ms 延迟出现",
    `<div class="pop static peek"><div class="pop-body">${sample}<span class="hint">点击编辑</span></div></div>`,
  ],
  [
    "编辑卡片",
    "点击后打开，输入即保存",
    `<div class="pop static">${cardHtml({ n: 2, text: sample, mode: "edit" })}</div>`,
  ],
  [
    "只读文档",
    "点击只看，可复制",
    `<div class="pop static">${cardHtml({ n: 2, text: sample, mode: "read" })}</div>`,
  ],
]
  .map(([t, d, h]) => `<figure>${h}<figcaption><b>${t}</b>${d}</figcaption></figure>`)
  .join("");

$("#insert-demo").innerHTML = `
  <div class="prose" style="font-size:15px">主流算法都按这个思路安排复习<span class="ann on" style="counter-set:tau-annotation 2"></span></div>
  <div class="pop static">${cardHtml({ n: 3, text: "", mode: "edit" }).replace("</textarea>", "</textarea>")}</div>
  <figcaption><b>插入后</b>卡片直接聚焦，空内容只显示占位；不写就关闭会自动移除</figcaption>`;

// 移动端
const status = `<div class="status"><span>9:41</span><span>●●● ▮</span></div>`;
const bar = `<div class="bar">${icon("back")}<span class="t">间隔重复笔记</span>${icon("more")}</div>`;
const doc = on => `<div class="doc"><h3>为什么间隔重复有效</h3>
  <p>艾宾浩斯发现，记忆在学习后的头一天流失最快<span class="ann"></span>。之后再复习，遗忘曲线会变得更平缓。</p>
  <p>间隔重复的核心是在快要忘记时复习，这样每次提取都更费力<span class="ann ${on ? "on" : ""}"></span>，也记得更牢。</p></div>`;
const ctx = `<div class="ctx">…这样每次提取都<mark>更费力</mark>，也记得更牢。</div>`;
const kb = `<div class="kb">${[10, 9, 9].map((n, r) => `<div class="row">${r === 2 ? '<i class="w"></i>' : ""}${"<i></i>".repeat(n - (r === 2 ? 2 : 0))}${r === 2 ? '<i class="w"></i>' : ""}</div>`).join("")}<div class="row"><i class="w"></i><i class="w"></i><i class="sp"></i><i class="w" style="flex-basis:64px"></i></div></div>`;
const phones = [
  ["阅读", "标记与桌面一致，命中区放大", `${doc(false)}`],
  [
    "点按：查看抽屉",
    "附原文片段；编辑和删除放在底部，单手可达",
    `${doc(true)}<div class="mask"></div>
    <div class="bsheet"><div class="grab"></div><div class="hd"><span class="n">2</span><b>注解</b><span class="sp"></span><button class="ib">${icon("copy")}</button></div>
    ${ctx}<div class="body">${sample}</div>
    <div class="acts"><button class="del">${icon("trash")}</button><button class="pri">${icon("pen", "s")}编辑</button></div></div>`,
  ],
  [
    "编辑：抽屉贴键盘",
    "插入新注解时也直接进这个状态",
    `${doc(true)}<div class="mask"></div>
    <div class="bsheet on-kb"><div class="hd"><span class="n">2</span><b>编辑注解</b></div>
    <div class="field">${sample}<span class="caret"></span></div>
    <div class="tool"><span>自动保存</span><span class="sp"></span><button class="done">完成</button></div></div>${kb}`,
  ],
  [
    "删除后",
    "toast 提供撤销",
    `${doc(false).replace('<span class="ann "></span>', "")}<div class="toast">已删除注解<b>撤销</b></div>`,
  ],
];
$("#phones").innerHTML = phones
  .map(
    ([t, d, inner]) =>
      `<div class="phone-col"><div class="phone">${status}${bar}${inner}</div><p class="cap"><b>${t}</b> · ${d}</p></div>`
  )
  .join("");
