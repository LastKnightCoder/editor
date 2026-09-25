/*
  白板详情三方案共用：画布纸面（按页元素几何画出）、画布自带浮动件的位置示意、元素树浮层、页操作（切换 / 新建 / 改名 / 删除 / 排序）。
  数据沿用 ../whiteboards/shared.js 的 mock（Transformer 结构拆解，4 页）。视觉参考，非导出源（D-001）。
*/
(function () {
  "use strict";
  const X = window.WB;
  const { icon, esc } = X;

  /* 补几枚画布工具图标 */
  const EXTRA = {
    pointer: '<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    square: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
    listtree: '<path d="M21 12h-8M21 6H8M21 18h-8M3 6v4c0 1.1.9 2 2 2h3M3 10v6c0 1.1.9 2 2 2h3"/>',
    minus: '<path d="M5 12h14"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    layout:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  };
  function injectExtra() {
    const s = document.getElementById("wb-sprite");
    s.innerHTML += Object.entries(EXTRA)
      .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
      .join("");
  }

  const board = X.findB(101);
  const D = { board, active: 0, outline: false };
  const subs = [];
  const on = fn => subs.push(fn);
  const emit = () => subs.forEach(fn => fn());

  /* ───────── 页操作（模拟 IPC：set-active / add / update-sub / delete-sub / reorder） ───────── */
  function go(i) {
    if (i < 0 || i >= board.pages.length || i === D.active) return;
    D.active = i;
    emit();
  }
  function addPage(name) {
    const n = board.pages.length + 1;
    board.pages.push({ id: board.id * 10 + 50 + n, name: name || `第 ${n} 页`, elements: [] });
    D.active = board.pages.length - 1;
    emit();
    X.toast(`已新建「${esc(board.pages[D.active].name)}」`);
  }
  function duplicate(i) {
    const p = board.pages[i];
    board.pages.splice(i + 1, 0, {
      id: p.id + 900,
      name: `${p.name} 副本`,
      elements: p.elements.slice(),
    });
    D.active = i + 1;
    emit();
  }
  function rename(i, name) {
    const v = name.trim();
    if (v && v !== board.pages[i].name) board.pages[i].name = v;
    emit();
  }
  function removePage(i) {
    const p = board.pages[i];
    if (board.pages.length === 1) return X.toast("至少保留一页");
    X.openDialog(
      close => `
      <h3>删除「${esc(p.name)}」？</h3>
      <p class="dsub">这一页的 ${p.elements.length} 个元素会一起删除，其他页不受影响。</p>
      <div class="dfoot"><button class="btn btn-ghost" data-x>取消</button><button class="btn btn-danger" data-ok>删除</button></div>`,
      {
        width: 400,
        bind(box, close) {
          box.querySelector("[data-x]").onclick = close;
          box.querySelector("[data-ok]").onclick = () => {
            board.pages.splice(i, 1);
            if (D.active >= board.pages.length) D.active = board.pages.length - 1;
            else if (D.active > i) D.active--;
            close();
            emit();
            X.toast(`已删除「${esc(p.name)}」`);
          };
        },
      }
    );
  }
  function move(from, to) {
    if (from === to) return;
    const cur = board.pages[D.active];
    const [p] = board.pages.splice(from, 1);
    board.pages.splice(to, 0, p);
    D.active = board.pages.indexOf(cur);
    emit();
  }
  function pageMenu(anchor, i, opts) {
    X.openMenu(
      anchor,
      [
        { label: "重命名", icon: "edit", run: () => opts.onRename(i) },
        { label: "复制这一页", icon: "copy", run: () => duplicate(i) },
        "-",
        {
          label: "删除这一页",
          icon: "trash",
          danger: true,
          disabled: board.pages.length === 1,
          run: () => removePage(i),
        },
      ],
      { placement: opts.placement || "top-start" }
    );
  }
  /** 行内改名：把 el 换成输入框，Enter / 失焦提交，Esc 放弃 */
  function inlineRename(el, i, width) {
    const input = document.createElement("input");
    input.className = "rename";
    input.value = board.pages[i].name;
    if (width) input.style.width = width + "px";
    el.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      ok ? rename(i, input.value) : emit();
    };
    input.onkeydown = e => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    };
    input.onblur = () => finish(true);
    input.onclick = e => e.stopPropagation();
  }
  /** 通用拖拽排序：容器里带 data-i 的元素可拖 */
  function sortable(container, axis = "x") {
    let from = -1;
    container.querySelectorAll("[data-i]").forEach(el => {
      el.draggable = true;
      el.addEventListener("dragstart", e => {
        from = +el.dataset.i;
        el.classList.add("drag-ghost");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("drag-ghost");
        container
          .querySelectorAll(".drop-before,.drop-above")
          .forEach(x => x.classList.remove("drop-before", "drop-above"));
      });
      el.addEventListener("dragover", e => {
        e.preventDefault();
        container
          .querySelectorAll(".drop-before,.drop-above")
          .forEach(x => x.classList.remove("drop-before", "drop-above"));
        el.classList.add(axis === "x" ? "drop-before" : "drop-above");
      });
      el.addEventListener("drop", e => {
        e.preventDefault();
        const to = +el.dataset.i;
        if (from >= 0) move(from, from < to ? to - 1 + 0 : to);
        from = -1;
      });
    });
  }

  /* ───────── 画布纸面 ───────── */
  function sheetHTML(extra = "") {
    return `
      <div class="sheet" id="sheet">
        <div class="canvas" id="canvas"></div>
        <div class="float tl"><button class="ibtn" id="ol-btn" title="元素树">${icon("listtree")}</button></div>
        <div class="float tools">
          <button class="ibtn on" title="选择 V">${icon("pointer")}</button><button class="ibtn" title="抓手 H">${icon("hand")}</button><span class="vsep"></span>
          <button class="ibtn" title="图形">${icon("square")}</button><button class="ibtn" title="文本">${icon("type")}</button><button class="ibtn" title="卡片">${icon("sticky-note")}</button>
          <button class="ibtn" title="手绘">${icon("spline")}</button><button class="ibtn" title="连线">${icon("move-right")}</button><button class="ibtn" title="思维导图">${icon("network")}</button>
          <button class="ibtn" title="图片">${icon("image")}</button><button class="ibtn" title="画框">${icon("frame")}</button>
        </div>
        <div class="float status">
          <button class="ibtn" title="网格">${icon("hash")}</button><span class="vsep"></span>
          <button class="ibtn" title="缩小">${icon("minus")}</button><span class="zoom">100%</span><button class="ibtn" title="放大">${icon("plus")}</button><span class="vsep"></span>
          <button class="btn btn-ghost" id="present">${icon("play")}演示</button>
        </div>
        <aside class="outline" id="outline"></aside>
        ${extra}
      </div>`;
  }
  function renderCanvas(swap) {
    const c = document.getElementById("canvas");
    const sheet = document.getElementById("sheet");
    const ratio = (sheet.clientWidth - 80) / Math.max(1, sheet.clientHeight - 130);
    c.innerHTML = X.pageSVG(board.pages[D.active], { ratio });
    c.classList.toggle("swap", !!swap);
    const p = board.pages[D.active];
    const ol = document.getElementById("outline");
    const mix = {};
    p.elements.forEach(e => (mix[e.type] = (mix[e.type] || 0) + 1));
    ol.innerHTML = `
      <div class="outline-head">元素树<small>${esc(p.name)} · ${p.elements.length}</small><span class="spacer"></span><button class="ibtn sm" id="ol-x" title="收起">${icon("x")}</button></div>
      <div class="outline-body">${
        p.elements.length
          ? p.elements
              .map(
                (e, i) =>
                  `<button class="ol-row">${icon(X.TYPE_META[e.type][1])}${X.TYPE_META[e.type][0]} ${i + 1}</button>`
              )
              .join("")
          : '<div class="muted" style="padding:10px 8px;font-size:12.5px">这一页还是空的</div>'
      }</div>`;
    ol.classList.toggle("open", D.outline);
    document.getElementById("ol-btn").classList.toggle("on", D.outline);
    document.getElementById("ol-x").onclick = () => toggleOutline(false);
  }
  function toggleOutline(v) {
    D.outline = v ?? !D.outline;
    document.getElementById("outline").classList.toggle("open", D.outline);
    document.getElementById("ol-btn").classList.toggle("on", D.outline);
  }
  function bindSheet() {
    document.getElementById("ol-btn").onclick = () => toggleOutline();
    document.getElementById("present").onclick = () =>
      X.toast(`从头演示「${esc(board.title)}」（mock）`);
    addEventListener("resize", () => renderCanvas(false));
    // 页切换快捷键：⌃PageUp / ⌃PageDown（同浏览器标签）；⌥↑↓ 备用
    addEventListener("keydown", e => {
      if (X.dialogOpen() || e.target.closest?.("input")) return;
      if ((e.ctrlKey && e.key === "PageDown") || (e.altKey && e.key === "ArrowDown"))
        (e.preventDefault(), go(D.active + 1));
      if ((e.ctrlKey && e.key === "PageUp") || (e.altKey && e.key === "ArrowUp"))
        (e.preventDefault(), go(D.active - 1));
    });
  }

  /** 标题栏面包屑：白板 / <白板名> / <当前页>；点白板名 = 编辑信息 */
  function setCrumb(withPage = true) {
    const el = document.querySelector(".titlebar-crumb");
    el.innerHTML = `白板<span class="crumb-sep">/</span><button class="crumb-board" id="crumb-board" title="编辑信息">${esc(board.title)}</button>${
      withPage
        ? `<span class="crumb-sep">/</span><span class="crumb-page">${esc(board.pages[D.active].name)}</span>`
        : ""
    }`;
    document.getElementById("crumb-board").onclick = () => X.editDialog(board);
  }

  window.WBD = {
    D,
    board,
    on,
    emit,
    go,
    addPage,
    duplicate,
    rename,
    removePage,
    move,
    pageMenu,
    inlineRename,
    sortable,
    sheetHTML,
    renderCanvas,
    bindSheet,
    toggleOutline,
    setCrumb,
    injectExtra,
  };
})();
