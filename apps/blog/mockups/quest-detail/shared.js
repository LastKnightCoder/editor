// 三套方案共用的示例数据与交互：引用浮层、跳转高亮、明暗切换
window.REFS = {
  1: {
    k: "clip",
    label: "剪藏",
    title: "Write-Ahead Logging",
    origin: "sqlite.org",
    href: "https://sqlite.org/wal.html",
    external: true,
    excerpt:
      "WAL provides more concurrency as readers do not block writers and a writer does not block readers. Reading and writing can proceed concurrently.",
  },
  2: {
    k: "mark",
    label: "划线",
    title: "《数据密集型应用系统设计》第 7 章 · 快照隔离",
    origin: "微信读书",
    href: "#",
    external: true,
    excerpt:
      "快照隔离的一个关键原则是：读不阻塞写，写不阻塞读。数据库因此可以在处理一致性快照上长时间运行的读查询的同时，正常地处理写入。",
  },
  3: {
    k: "pdf",
    label: "PDF 标注",
    title: "A Critique of ANSI SQL Isolation Levels · p.6",
    origin: "Berenson et al., 1995",
    href: "#",
    external: true,
    excerpt:
      "Each transaction reads data from a snapshot of the (committed) data as of the time the transaction started.",
  },
  4: {
    k: "card",
    label: "卡片",
    title: "WAL 文件里的 frame 与 checkpoint",
    origin: "已公开",
    href: "#",
    published: true,
    excerpt:
      "每次提交把被修改的整页追加为一个 frame，commit frame 带有数据库大小字段；checkpoint 把 frame 回写主文件后，WAL 才能从头复用。",
  },
  5: {
    k: "article",
    label: "文章",
    title: "SQLite 锁状态机笔记",
    origin: "已公开 · 3.2k 字",
    href: "#",
    published: true,
    excerpt:
      "WAL 模式下仍然只有一个写者：写事务需要拿到 WAL 写锁，读事务只占用 read-mark 槽位，二者不再互斥。",
  },
  6: {
    k: "card",
    label: "卡片",
    title: "读事务的 end mark",
    origin: "未公开，摘录如下",
    href: null,
    published: false,
    excerpt:
      "读事务开始时在 wal-index 中记录 mxFrame，此后只读取 ≤ mxFrame 的 frame；后续追加的 frame 对它不可见。",
  },
  7: {
    k: "chat",
    label: "对话",
    title: "和 AI 讨论：长读事务为何让 WAL 一直变大",
    origin: "摘选 2 条",
    href: null,
    excerpt:
      "checkpoint 只能回写到最老读者的 end mark 为止；只要有读事务还停在旧位置，WAL 就无法从头复用，文件只会继续增长。",
  },
};

const THEME_KEY = "quest-mock-theme";
document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";

function header() {
  const el = document.querySelector("[data-header]");
  if (!el) return;
  el.outerHTML = `
  <header class="site-header">
    <a class="brand" href="index.html">Tau 的笔记</a>
    <nav><a href="#">首页</a><a href="#">文章</a><a href="#">卡片</a><a class="active" href="#">求索录</a></nav>
    <span class="spacer"></span>
    <button class="icon-btn" title="搜索">⌕</button>
    <button class="icon-btn" title="切换明暗" data-theme-toggle>◐</button>
  </header>`;
  document.querySelector("[data-theme-toggle]").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  };
}

function flash(el) {
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function jumpTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  flash(target);
}

function citations({ popover = true } = {}) {
  // 给每个引用标记编号锚点，供参考资料处「↩ 回到正文」使用
  const seen = {};
  document.querySelectorAll(".cite[data-ref]").forEach(c => {
    const n = c.dataset.ref;
    seen[n] = (seen[n] || 0) + 1;
    c.id = `cite-${n}-${seen[n]}`;
    if (!c.textContent.trim()) c.textContent = `[${n}]`;
  });

  const pop = document.createElement("div");
  pop.className = "cite-pop";
  document.body.appendChild(pop);
  let hideTimer;

  const show = c => {
    const r = REFS[c.dataset.ref];
    if (!r) return;
    clearTimeout(hideTimer);
    const action = r.published
      ? `<a class="src-link" href="${r.href}">打开${r.label} →</a>`
      : r.external
        ? `<a class="src-link" href="${r.href}" target="_blank" rel="noopener nofollow">查看原处 ↗</a>`
        : `<span class="private">未公开</span>`;
    pop.innerHTML = `
      <span class="kind" data-k="${r.k}"><i></i>${r.label} · ${r.origin}</span>
      <div class="t">${r.title}</div>
      <p class="excerpt">${r.excerpt}</p>
      <div class="foot"><a class="src-link" href="#ref-${c.dataset.ref}" data-jump="ref-${c.dataset.ref}">在资料列表中查看</a>${action}</div>`;
    const b = c.getBoundingClientRect();
    const left = Math.min(Math.max(12, b.left - 20), innerWidth - 352);
    const below = b.bottom + 220 < innerHeight;
    pop.style.left = left + "px";
    pop.style.top = below ? b.bottom + 8 + "px" : "";
    pop.style.bottom = below ? "" : innerHeight - b.top + 8 + "px";
    pop.classList.add("show");
  };
  const hide = () => (hideTimer = setTimeout(() => pop.classList.remove("show"), 160));

  if (popover) {
    document.addEventListener("mouseover", e => {
      const c = e.target.closest(".cite[data-ref]");
      if (c) show(c);
      else if (e.target.closest(".cite-pop")) clearTimeout(hideTimer);
    });
    document.addEventListener("mouseout", e => {
      if (e.target.closest(".cite[data-ref], .cite-pop")) hide();
    });
  }

  document.addEventListener("click", e => {
    const c = e.target.closest(".cite[data-ref]");
    if (c) {
      e.preventDefault();
      pop.classList.remove("show");
      jumpTo(`ref-${c.dataset.ref}`);
      return;
    }
    const j = e.target.closest("[data-jump]");
    if (j) {
      e.preventDefault();
      pop.classList.remove("show");
      jumpTo(j.dataset.jump);
    }
  });
}

window.QuestMock = { header, citations, jumpTo, flash };
