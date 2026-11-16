/* 侧栏原型交互：浏览器外壳 + 网页 + 侧栏三部分渲染 */

/* ———————— 浏览器外壳 ———————— */
function renderTabs() {
  $("#tabs").innerHTML =
    `<div class="c-lights"><i></i><i></i><i></i></div>` +
    S.tabs
      .map(id => {
        const p = page(id);
        return `<div class="c-tab ${id === S.active ? "on" : ""}" data-tab="${id}">
      <span class="fav" style="background:${p.favBg}">${p.fav}</span><span class="t">${esc(p.title)}</span>
      ${p.anns.length ? `<span class="badge">${p.anns.length}</span>` : ""}</div>`;
      })
      .join("");
  const p = cur();
  $("#url").innerHTML =
    `${icon("lock")}<span><span class="h">https://</span>${p.host}<span class="h">${p.path}</span></span>`;
  $("#extBtn").classList.toggle("on", S.open);
}
$("#tabs").addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (t && t.dataset.tab !== S.active) activate(t.dataset.tab);
});
function activate(id) {
  if (!S.tabs.includes(id)) S.tabs.push(id);
  S.active = id;
  S.cur = null;
  S.editing = null;
  S.filter = null;
  if (S.view === "lib" && S.libDetail === id) S.view = "page";
  renderAll(true);
}

function setOpen(open) {
  S.open = open;
  $("#side").style.width = open ? S.width + "px" : "0px";
  $("#split").style.display = open ? "" : "none";
  renderTabs();
  renderOrb();
}
$("#extBtn").onclick = () => setOpen(!S.open);
$("#sideClose").onclick = () => setOpen(false);
addEventListener("keydown", e => {
  if (e.altKey && e.code === "KeyJ") {
    e.preventDefault();
    setOpen(!S.open);
  }
});
$("#split").addEventListener("pointerdown", e => {
  const x0 = e.clientX,
    w0 = S.width;
  $("#side").style.transition = "none";
  const move = ev => {
    S.width = Math.max(320, Math.min(560, w0 - (ev.clientX - x0)));
    $("#side").style.width = S.width + "px";
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    $("#side").style.transition = "";
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
});

/* ———————— 网页正文（高亮渲染） ———————— */
function markBlock(text, pid, anns) {
  let html = esc(text);
  for (const a of anns.filter(a => a.pid === pid)) {
    const q = esc(a.text);
    html = html.replace(
      q,
      `<span class="hl ${a.note ? "has-note" : ""} ${S.cur === a.id ? "focus" : ""}" data-c="${a.color}" data-ann="${a.id}">${q}</span>`
    );
  }
  return html;
}
function renderPage() {
  const p = cur();
  $("#page").innerHTML =
    `<div class="site-head"><span class="fav" style="background:${p.favBg};width:22px;height:22px;line-height:22px;font-size:11px;border-radius:6px">${p.fav}</span>${p.site}
      <span class="nav"><span>文章</span><span>归档</span><span>关于</span></span></div>
    <article class="article" id="article"><h1>${esc(p.title)}</h1><div class="by">${p.host} · ${p.at}</div>
    ${p.blocks.map((b, i) => (b.startsWith("## ") ? `<h2 data-pid="${i}">${esc(b.slice(3))}</h2>` : `<p data-pid="${i}">${markBlock(b, i, p.anns)}</p>`)).join("")}
    </article><div class="orb" id="orb">τ</div><div id="selHost"></div>`;
  renderOrb();
}
function renderOrb() {
  const orb = $("#orb");
  if (!orb) return;
  orb.classList.toggle("gone", S.open || !S.orb);
  orb.innerHTML = `τ${cur().anns.length ? `<span class="n">${cur().anns.length}</span>` : ""}`;
  orb.title = "打开伴读侧栏 ⌥J";
  orb.onclick = () => setOpen(true);
}
function flashAnn(id) {
  const el = $(`#page [data-ann="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const block = el.closest("p");
  block.classList.remove("flash");
  void block.offsetWidth;
  block.classList.add("flash");
}

/* 选区工具条：高亮 / 批注 / 问 AI / 摘录 */
$("#page").addEventListener("mouseup", e => {
  if (e.target.closest(".seltool")) return;
  setTimeout(() => {
    const sel = getSelection();
    const text = sel.toString().trim();
    const host = $("#selHost");
    if (!text || !sel.rangeCount || !$("#article").contains(sel.anchorNode)) {
      const hit = e.target.closest("[data-ann]");
      host.innerHTML = "";
      if (hit) pickAnn(+hit.dataset.ann, true);
      return;
    }
    const block = sel.anchorNode.parentElement.closest("[data-pid]");
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const box = $("#page").getBoundingClientRect();
    host.innerHTML = `<div class="seltool" style="top:${r.top - box.top + $("#page").scrollTop - 46}px;left:${Math.max(8, r.left - box.left + r.width / 2 - 170)}px">
      ${COLORS.map(c => `<button class="sw-btn" data-color="${c}" title="${COLOR_NAMES[c]}色高亮"><span class="swatch" data-c="${c}"></span></button>`).join("")}
      <span class="vsep"></span>
      <button class="t-btn" data-act="note">${icon("note")}批注</button>
      <button class="t-btn" data-act="ai">${icon("spark")}问 AI</button>
      <button class="t-btn" data-act="excerpt">${icon("quote")}摘录</button></div>`;
    host.onclick = ev => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const pid = block ? +block.dataset.pid : 0;
      if (btn.dataset.color || btn.dataset.act === "note") {
        const a = ann(pid, text, btn.dataset.color || "yellow", "", "刚刚");
        cur().anns.push(a);
        S.cur = a.id;
        if (btn.dataset.act === "note") {
          S.editing = a.id;
          S.view = "page";
          S.tab = "anns";
          if (!S.open) setOpen(true);
        }
      }
      if (btn.dataset.act === "excerpt") excerpt(text);
      if (btn.dataset.act === "ai") {
        S.view = "page";
        S.tab = "chat";
        S.chatQuote = text;
        if (!S.open) setOpen(true);
      }
      host.innerHTML = "";
      sel.removeAllRanges();
      renderAll();
    };
  }, 10);
});

function excerpt(text) {
  const owner = page(noteOwner());
  const src = cur();
  owner.noteHtml += `<blockquote class="fresh">${esc(text)}<span class="src">— 来源：${esc(src.title)}</span></blockquote>`;
  if (S.open && S.view === "page" && S.tab === "note") return;
  toast(
    S.notePin && S.notePin !== S.active ? `已摘录到「${owner.title}」的笔记` : "已摘录到本页笔记"
  );
}

/* ———————— 侧栏 ———————— */
function renderPanel(swap) {
  const root = $("#panelRoot");
  root.innerHTML = `<div class="sp">${S.view === "lib" ? libView() : pageView(swap)}</div>`;
  bindPanel(root);
}

function connRow() {
  return S.conn
    ? `<span class="dot ok"></span>Tau 已连接`
    : `<span class="dot off"></span>Tau 未连接`;
}
function banner() {
  return S.conn
    ? ""
    : `<div class="banner">${icon("plug")}<span>Tau 没在运行：标注先存本机，连上后补同步</span><button class="btn ghost">打开 Tau</button></div>`;
}

function pageView(swap) {
  const p = cur();
  const note = page(noteOwner());
  const tabs = [
    ["anns", "标注", p.anns.length || ""],
    ["note", "笔记", S.notePin && S.notePin !== S.active ? "已钉住" : ""],
    ["chat", "对话", ""],
  ];
  return `
    <div class="sp-page ${swap ? "sp-switch" : ""}">
      <span class="fav" style="background:${p.favBg}">${p.fav}</span>
      <div class="t"><b>${esc(p.title)}</b><small>${p.host}<span>·</span>${connRow()}</small></div>
      <div style="position:relative"><button class="icon-btn" data-a="menu" title="更多">${icon("more")}</button>${S.menu ? menu() : ""}</div>
    </div>
    ${banner()}
    <div class="sp-tabs">
      ${tabs.map(([k, l, c]) => `<button class="sp-tab ${S.tab === k ? "on" : ""}" data-tabk="${k}">${l}${c !== "" ? `<span class="c">${c}</span>` : ""}</button>`).join("")}
      <button class="sp-tab lib" data-a="lib" title="所有页面的标注与笔记">${icon("layers")}全部</button>
    </div>
    <div class="sp-body">${S.tab === "anns" ? annsTab(p) : S.tab === "note" ? noteTab(note) : chatTab(p)}</div>
    ${S.tab === "note" ? noteFoot(note) : ""}`;
}
function menu() {
  return `<div class="menu" style="right:0;top:32px;min-width:200px">
    <button class="menu-item" data-a="fullLib">${icon("out")}在新标签页打开伴读库</button>
    <button class="menu-item" data-a="toggleOrb">${icon("eyeoff")}${S.orb ? "侧栏关闭时不显示悬浮球" : "侧栏关闭时显示悬浮球"}</button></div>`;
}

/* 标注页签 */
function annCard(a, opts = {}) {
  const editing = S.editing === a.id;
  return `<div class="ann ${S.cur === a.id ? "cur" : ""}" style="--c:var(--hl-${a.color})" data-ann="${a.id}" ${opts.page ? `data-page="${opts.page}"` : ""}>
    <div class="q">${esc(a.text)}</div>
    ${a.note && !editing ? `<div class="n">${icon("note")}<span>${esc(a.note)}</span></div>` : ""}
    ${
      editing
        ? `<div class="edit"><textarea class="field" rows="3" placeholder="写下批注… ⌘↵ 保存">${esc(a.note)}</textarea>
      <div class="row-end"><button class="btn ghost" data-a="cancelEdit">取消</button><button class="btn primary" data-a="saveEdit">保存</button></div></div>`
        : ""
    }
    ${opts.src ? `<div class="feed-src"><span class="fav" style="background:${opts.src.favBg}">${opts.src.fav}</span>${esc(opts.src.title)}</div>` : ""}
    ${
      editing
        ? ""
        : `<div class="m"><span>${a.at}</span><span class="tools">
      <button class="icon-btn" data-a="editAnn" title="批注">${icon("pen")}</button>
      <button class="icon-btn" data-a="exAnn" title="摘录进笔记">${icon("quote")}</button>
      <button class="icon-btn" data-a="delAnn" title="删除">${icon("trash")}</button></span></div>`
    }
  </div>`;
}
function annsTab(p) {
  if (!p.anns.length)
    return `<div class="empty">${icon("hl")}这页还没有标注<br/>选中正文文字，用工具条高亮或批注</div>`;
  const list = p.anns.filter(a => !S.filter || a.color === S.filter).sort((x, y) => x.pid - y.pid);
  const used = COLORS.filter(c => p.anns.some(a => a.color === c));
  return `<div class="filters"><button class="chip ${!S.filter ? "on" : ""}" data-filter="">全部 ${p.anns.length}</button>
      ${used.map(c => `<button class="chip sw ${S.filter === c ? "on" : ""}" data-filter="${c}"><span class="swatch" data-c="${c}"></span></button>`).join("")}</div>
    <div class="group-t">按页面顺序 · 点击跳到原文</div>
    ${list.map(a => annCard(a)).join("")}`;
}

/* 笔记页签：默认跟随当前标签页，可钉住 */
function noteTab(note) {
  const pinnedElsewhere = S.notePin && S.notePin !== S.active;
  return `<div class="note-target">
      <span>写给</span>
      <button class="pick" data-a="pickNote"><span class="fav" style="background:${note.favBg};width:14px;height:14px;line-height:14px;font-size:8px;border-radius:3px">${note.fav}</span>${esc(note.title.length > 16 ? note.title.slice(0, 16) + "…" : note.title)}${icon("down")}</button>
      <span class="sp-grow" style="flex:1"></span>
      <button class="icon-btn ${S.notePin ? "on" : ""}" data-a="pinNote" title="${S.notePin ? "取消钉住：笔记跟随当前标签页" : "钉住：切换标签页时继续写这一篇，摘录也进这里"}">${icon("pin")}</button>
      ${S.pickOpen ? notePicker() : ""}
    </div>
    ${pinnedElsewhere ? `<div class="group-t" style="padding-top:8px">${icon("pin")}已钉住 · 在别的标签页摘录也会接到这里 <button class="act chip" data-a="unpin">回到本页</button></div>` : ""}
    <div class="note-paper" contenteditable="true" id="notePaper">${note.noteHtml}</div>
    ${note.saved.length ? `<div class="group-t">已存为卡片</div><div class="saved">${note.saved.map(s => `<div class="it">${icon("card")}${esc(s.title)}<span class="meta">${s.at}</span></div>`).join("")}</div>` : ""}`;
}
function notePicker() {
  const ids = [S.active, ...S.tabs.filter(id => id !== S.active)];
  return `<div class="menu" style="left:42px;top:38px;min-width:250px">
    <div class="group-t" style="padding:4px 8px">打开着的标签页</div>
    ${ids.map(id => `<button class="menu-item" data-note="${id}"><span class="fav" style="background:${page(id).favBg};width:14px;height:14px;line-height:14px;font-size:8px;border-radius:3px">${page(id).fav}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(page(id).title)}</span>${id === S.active ? '<span class="meta">本页</span>' : ""}</button>`).join("")}</div>`;
}
function noteFoot(note) {
  return `<div class="sp-foot"><span>${icon("check")}</span><span class="sp-grow">草稿已存本机</span>
    <button class="btn primary" data-a="saveCard" ${S.conn && note.noteHtml ? "" : "disabled style='opacity:.5'"}>保存为卡片</button></div>`;
}

/* 对话页签（沿用现有面板能力，原型只示意） */
function chatTab(p) {
  const msgs = S.chat[S.active] || [];
  const quote = S.chatQuote
    ? `<div class="ann" style="--c:var(--accent);margin:10px 10px 0;cursor:default"><div class="q">${esc(S.chatQuote)}</div><div class="m"><span>选区</span></div></div>`
    : "";
  const body = msgs.length
    ? msgs
        .map(m =>
          m.me
            ? `<div style="margin:10px 12px 0 48px;padding:8px 11px;border-radius:12px;background:var(--accent-soft);color:var(--ink-1)">${esc(m.t)}</div>`
            : `<div style="margin:10px 14px;line-height:1.7">${m.t}</div>`
        )
        .join("")
    : `<div class="group-t">试试</div><div style="display:flex;flex-direction:column;gap:6px;padding:0 12px">
        ${["总结这页的要点", "这页和我的笔记有什么关联", "找出论证里站不住的地方"].map(q => `<button class="chip" data-ask="${q}" style="justify-content:flex-start;height:30px">${icon("spark")}${q}</button>`).join("")}</div>`;
  return `${quote}${body}<div style="position:sticky;bottom:0;padding:10px;background:var(--page)">
    <div style="display:flex;gap:6px;align-items:center;padding:6px 6px 6px 10px;border-radius:12px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-1)">
      <span class="chip on" style="height:22px">本页</span><input id="askInput" placeholder="问这页…" style="flex:1;border:0;outline:0;background:none;font:inherit;color:var(--ink-1)"/>
      <button class="icon-btn" data-a="send">${icon("up")}</button></div></div>`;
}

/* ———————— 资料库视图：所有页面 ———————— */
const ALL = () => Object.keys(PAGES).filter(id => PAGES[id].anns.length || PAGES[id].noteHtml);
function libView() {
  if (S.libDetail) return libDetail(page(S.libDetail), S.libDetail);
  const q = S.libQuery.trim();
  const head = `<div class="detail-head"><button class="icon-btn" data-a="back" title="回到本页">${icon("arrowL")}</button><span class="t">所有页面</span>
      <button class="icon-btn" data-a="fullLib" title="在新标签页打开伴读库">${icon("out")}</button></div>
    ${banner()}
    <div class="searchbox">${icon("search")}<input id="libQ" placeholder="搜索标题、标注原文、批注" value="${esc(S.libQuery)}"/></div>
    <div class="subtabs">${[
      ["pages", "页面"],
      ["feed", "全部标注"],
      ["notes", "笔记"],
    ]
      .map(([k, l]) => `<button class="${S.lib === k ? "on" : ""}" data-lib="${k}">${l}</button>`)
      .join("")}</div>`;
  let body = "";
  if (S.lib === "pages") {
    const ids = ALL().filter(
      id =>
        !q || PAGES[id].title.includes(q) || PAGES[id].anns.some(a => (a.text + a.note).includes(q))
    );
    body =
      ids
        .map(id => {
          const p = PAGES[id];
          const tag =
            id === S.active
              ? `<span class="here">本页</span>`
              : S.tabs.includes(id)
                ? `<span class="open">已打开</span>`
                : "";
          return `<div class="pg" data-detail="${id}"><span class="fav" style="background:${p.favBg}">${p.fav}</span>
        <div class="t"><b>${esc(p.title)}</b><small><span>${p.host}</span><span>${icon("hl")}${p.anns.length}</span>${p.noteHtml ? `<span>${icon("pen")}笔记</span>` : ""}<span>${p.at}</span></small></div>${tag}</div>`;
        })
        .join("") || `<div class="empty">没有匹配的页面</div>`;
    if (!S.conn) body = `<div class="group-t">未连接：只列出在这个浏览器里看过的页面</div>` + body;
  }
  if (S.lib === "feed") {
    const items = ALL()
      .flatMap(id => PAGES[id].anns.map(a => ({ a, id })))
      .filter(({ a }) => !q || (a.text + a.note).includes(q))
      .reverse();
    body =
      `<div class="group-t">按时间 · 点击跳到原页面</div>` +
      items.map(({ a, id }) => annCard(a, { page: id, src: PAGES[id] })).join("");
  }
  if (S.lib === "notes") {
    const ids = ALL().filter(id => PAGES[id].noteHtml);
    body = ids
      .map(id => {
        const p = PAGES[id];
        const text = p.noteHtml
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return `<div class="pg" data-note-open="${id}"><span class="fav" style="background:${p.favBg}">${p.fav}</span>
        <div class="t"><b>${esc(p.title)}</b><small style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(text)}</small></div>
        ${p.saved.length ? `<span class="open">已存卡片</span>` : ""}</div>`;
      })
      .join("");
  }
  return `${head}<div class="sp-body">${body}</div>`;
}
function libDetail(p, id) {
  const isOpen = S.tabs.includes(id);
  return `<div class="detail-head"><button class="icon-btn" data-a="libBack" title="返回列表">${icon("arrowL")}</button>
      <span class="t" title="点击改名">${esc(p.title)}</span></div>
    <div class="detail-meta"><span>${p.host}</span><span>${p.anns.length} 条标注</span><span>${p.at}</span></div>
    <div class="detail-acts">
      <button class="btn primary" data-goto="${id}">${icon(isOpen ? "arrowR" : "out")}${isOpen ? "切到这个标签页" : "打开页面"}</button>
      <button class="btn ghost" data-a="noteFor" data-id="${id}">${icon("pen")}写笔记</button></div>
    <div class="sp-body">
      ${p.anns.map(a => annCard(a, { page: id })).join("")}
      ${p.noteHtml ? `<div class="group-t">页面笔记</div><div class="note-paper" style="min-height:0">${p.noteHtml}</div>` : ""}
    </div>`;
}

/* ———————— 侧栏事件 ———————— */
function findAnn(id) {
  for (const pid of Object.keys(PAGES)) {
    const a = PAGES[pid].anns.find(x => x.id === id);
    if (a) return { a, pid };
  }
}
function pickAnn(id, fromPage) {
  S.cur = id;
  if (fromPage) {
    S.view = "page";
    S.tab = "anns";
    if (!S.open) setOpen(true);
  }
  renderAll();
  if (fromPage)
    $(`#panelRoot [data-ann="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  else flashAnn(id);
}
function bindPanel(root) {
  root.onclick = e => {
    const el = e.target.closest("button, [data-ann], [data-detail], [data-note-open]");
    if (!el) {
      if (S.menu || S.pickOpen) {
        S.menu = S.pickOpen = false;
        renderPanel();
      }
      return;
    }
    const a = el.dataset.a;
    const card = e.target.closest(".ann[data-ann]");
    const found = card && findAnn(+card.dataset.ann);
    if (el.dataset.tabk) {
      S.tab = el.dataset.tabk;
      S.menu = false;
      return renderPanel();
    }
    if (el.dataset.filter !== undefined) {
      S.filter = el.dataset.filter || null;
      return renderPanel();
    }
    if (el.dataset.lib) {
      S.lib = el.dataset.lib;
      return renderPanel();
    }
    if (el.dataset.detail) {
      S.libDetail = el.dataset.detail;
      return renderPanel();
    }
    if (el.dataset.noteOpen) {
      S.libDetail = el.dataset.noteOpen;
      return renderPanel();
    }
    if (el.dataset.goto) {
      activate(el.dataset.goto);
      S.view = "page";
      return renderAll(true);
    }
    if (el.dataset.note) {
      S.notePin = el.dataset.note === S.active ? null : el.dataset.note;
      S.pickOpen = false;
      return renderPanel();
    }
    if (el.dataset.ask) return ask(el.dataset.ask);
    switch (a) {
      case "menu":
        S.menu = !S.menu;
        return renderPanel();
      case "toggleOrb":
        S.orb = !S.orb;
        S.menu = false;
        syncDemo();
        renderOrb();
        return renderPanel();
      case "fullLib":
        S.menu = false;
        renderPanel();
        return toast("在新标签页打开伴读库（现有 library.html：批量整理、改名）");
      case "lib":
        S.view = "lib";
        S.libDetail = null;
        return renderPanel();
      case "back":
        S.view = "page";
        return renderPanel();
      case "libBack":
        S.libDetail = null;
        return renderPanel();
      case "noteFor":
        S.notePin = el.dataset.id === S.active ? null : el.dataset.id;
        S.view = "page";
        S.tab = "note";
        return renderPanel();
      case "pickNote":
        S.pickOpen = !S.pickOpen;
        return renderPanel();
      case "pinNote":
        S.notePin = S.notePin ? null : S.active;
        return renderPanel();
      case "unpin":
        S.notePin = null;
        return renderPanel();
      case "saveCard": {
        const n = page(noteOwner());
        n.saved.unshift({ title: n.title, at: "刚刚" });
        n.noteHtml = "";
        toast("已在 Tau 新建卡片，草稿已清空");
        return renderPanel();
      }
      case "send":
        return ask($("#askInput").value || "总结这页的要点");
      case "editAnn":
        S.editing = found.a.id;
        S.cur = found.a.id;
        return renderPanel();
      case "cancelEdit":
        S.editing = null;
        return renderPanel();
      case "saveEdit":
        found.a.note = card.querySelector("textarea").value.trim();
        S.editing = null;
        return renderAll();
      case "delAnn":
        PAGES[found.pid].anns = PAGES[found.pid].anns.filter(x => x !== found.a);
        return renderAll();
      case "exAnn": {
        const owner = page(noteOwner());
        owner.noteHtml += `<blockquote class="fresh">${esc(found.a.text)}<span class="src">— 来源：${esc(PAGES[found.pid].title)}</span></blockquote>`;
        return toast(`已摘录到「${owner.title.slice(0, 12)}…」的笔记`);
      }
    }
    if (card && !e.target.closest("button, textarea")) {
      if (found.pid !== S.active) {
        // 跨页标注：切到（或打开）那个页面并定位
        activate(found.pid);
        S.view = "page";
        S.tab = "anns";
        renderAll(true);
        return setTimeout(() => pickAnn(found.a.id), 60);
      }
      pickAnn(found.a.id);
    }
  };
  const paper = $("#notePaper", root);
  if (paper)
    paper.oninput = () => {
      page(noteOwner()).noteHtml = paper.innerHTML;
    };
  const libQ = $("#libQ", root);
  if (libQ)
    libQ.oninput = () => {
      S.libQuery = libQ.value;
      const pos = libQ.selectionStart;
      renderPanel();
      const n = $("#libQ");
      n.focus();
      n.setSelectionRange(pos, pos);
    };
  root.querySelector("textarea")?.focus();
}
function ask(q) {
  const list = (S.chat[S.active] ||= []);
  list.push({ me: true, t: q });
  list.push({
    t: `这页讲了三点：遗忘有规律可循 <button class="chip" style="height:18px;padding:0 6px">1</button>；在快忘时回想能减缓衰减 <button class="chip" style="height:18px;padding:0 6px">2</button>；把识别误当掌握是常见误区 <button class="chip" style="height:18px;padding:0 6px">6</button>。<div class="m" style="display:flex;gap:6px;margin-top:6px"><button class="chip">${icon("quote")}存进笔记</button><button class="chip">${icon("copy")}复制</button></div>`,
  });
  S.chatQuote = null;
  renderPanel();
}

/* ———————— 演示控制 ———————— */
function syncDemo() {
  document
    .querySelectorAll("#demo [data-orb]")
    .forEach(b => b.classList.toggle("on", (b.dataset.orb === "on") === S.orb));
}
$("#demo").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.theme) {
    app.dataset.mode = b.dataset.theme;
    document.querySelectorAll("#demo [data-theme]").forEach(x => x.classList.toggle("on", x === b));
  }
  if (b.dataset.conn) {
    S.conn = b.dataset.conn === "on";
    document.querySelectorAll("#demo [data-conn]").forEach(x => x.classList.toggle("on", x === b));
    renderPanel();
  }
  if (b.dataset.orb) {
    S.orb = b.dataset.orb === "on";
    syncDemo();
    renderOrb();
  }
};

function renderAll(swap) {
  renderTabs();
  renderPage();
  renderPanel(swap);
}
renderAll();
setOpen(true);
