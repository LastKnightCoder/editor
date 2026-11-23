// mockup 渲染脚本：侧栏场景生成、图标、主题切换、场景切换与窗口缩放
(function () {
  const svgNS = "http://www.w3.org/2000/svg";

  const NAV = [
    {
      label: "日常",
      items: [
        ["home", "今日", "flame"],
        ["schedule", "日程", "calendar"],
        ["todos", "待办", "list-todo"],
        ["diary", "日记", "pen-line"],
        ["pomodoro", "番茄专注", "timer"],
      ],
    },
    {
      label: "知识",
      items: [
        ["cards", "卡片库", "layers"],
        ["articles", "文章", "file-text"],
        ["projects", "项目", "folder-kanban"],
        ["whiteboard", "白板", "presentation"],
        ["databases", "数据库", "table"],
      ],
    },
    {
      label: "学习",
      items: [
        ["notebook", "Notebook", "flask-conical"],
        ["pdfs", "PDF", "book-marked"],
        ["walk", "漫步", "footprints"],
        ["review", "闪卡复习", "repeat"],
      ],
    },
    {
      label: "AI",
      items: [
        ["chat", "AI 对话", "message-circle"],
        ["skills", "Skill", "sparkles"],
        ["mcp", "MCP 服务器", "plug"],
      ],
    },
    {
      label: "分享",
      items: [
        ["collab", "协作", "users"],
        ["publish", "发布", "send"],
      ],
    },
  ];
  const ALL = NAV.flatMap(g => g.items.map(i => i[0]));
  const WRITING = ["home", "diary", "cards", "articles", "projects", "whiteboard", "databases"];

  function sidebar(enabled, opt = {}) {
    let html = `<div class="side"><div class="side-head"><span class="lights" data-lights></span><span class="tog" data-i="panel-left" data-s="16"></span></div>`;
    html += `<div class="side-scroll">`;
    for (const g of NAV) {
      const items = g.items.filter(i => enabled.includes(i[0]));
      if (!items.length) continue;
      html += `<div class="grp"><span data-i="chevron-down" data-s="11"></span>${g.label}</div>`;
      for (const [key, label, ic] of items) {
        const cls = [
          key === (opt.active || "home") ? "on" : "",
          key === opt.hover ? "hov" : "",
        ].join(" ");
        const badge = key === "review" ? `<span class="bd">12</span>` : "";
        html += `<div class="it ${cls}" data-key="${key}"><span data-i="${ic}" data-s="16"></span>${label}${badge}</div>`;
      }
    }
    html += `</div><div class="side-foot">`;
    for (const [label, ic] of [
      ["插件", "blocks"],
      ["反馈", "message-square-heart"],
      ["设置", "sliders-horizontal"],
    ]) {
      html += `<div class="it"><span data-i="${ic}" data-s="16"></span>${label}</div>`;
    }
    return html + `</div></div>`;
  }

  function homePaper(enabled) {
    const panels = [
      ["review", "复习"],
      ["todos", "待办"],
      ["schedule", "日程"],
    ].filter(p => enabled.includes(p[0]));
    const wide = [
      ["", "洞见"],
      ["", "最近编辑"],
      ["walk", "今日漫步"],
      ["", "回顾"],
    ].filter(p => !p[0] || enabled.includes(p[0]));
    let html = `<div class="paper"><h3>今日</h3><div class="muted">11 月 23 日 · 星期一</div>`;
    html += `<div class="ghost-grid" style="grid-template-columns:repeat(${Math.max(panels.length, 1)},1fr)">`;
    html += panels
      .map(
        p =>
          `<div class="ghost-card" style="padding:12px 14px;font-size:13px;font-weight:600">${p[1]}<div class="ghost-line" style="width:70%"></div><div class="ghost-line" style="width:45%"></div></div>`
      )
      .join("");
    html += `</div>`;
    html += wide
      .slice(0, 3)
      .map(
        p =>
          `<div class="ghost-card" style="margin-top:12px;padding:12px 14px;font-size:13px;font-weight:600">${p[1]}<div class="ghost-line" style="width:60%"></div></div>`
      )
      .join("");
    return html + `</div>`;
  }

  function win(side, main, extra = "", h = 680) {
    return `<div class="win-box" style="--w:1080;--h:${h}"><div class="win" style="height:${h}px">${side}<div class="main"><div></div>${main}</div>${extra}</div></div>`;
  }
  function frame(no, cap, note, body) {
    return `<div>${body}<div class="frame-cap"><span class="no">${no}</span>${cap}</div><div class="frame-note">${note}</div></div>`;
  }

  // 场景 2：右键菜单 + 撤销提示
  const ctxMenu = `<div class="menu" style="left:150px;top:396px">
      <div class="mi"><span data-i="arrow-right" data-s="15"></span>打开</div>
      <div class="sep"></div>
      <div class="mi hov"><span data-i="eye-off" data-s="15"></span>从侧栏隐藏「白板」</div>
      <div class="mi"><span data-i="layout-grid" data-s="15"></span>管理侧栏功能…</div>
    </div>`;
  const hidden = ALL.filter(k => k !== "whiteboard");
  const toast = `<div class="toast">已隐藏「白板」，白板内容都还在<span class="lnk">在设置里管理</span><span class="btn-t">撤销</span></div>`;
  document.getElementById("inplace-frames").innerHTML =
    frame(
      1,
      "右键侧栏条目",
      "菜单只有三项：打开、隐藏当前这一项、去设置管理全部。依附项也能右键隐藏；主功能（如 AI 对话）的隐藏项文字写明「连同 Skill、MCP 服务器」。",
      win(sidebar(ALL, { hover: "whiteboard" }), homePaper(ALL), ctxMenu)
    ) +
    frame(
      2,
      "隐藏后：条目收起，底部提示可撤销",
      "提示 5 秒后自动消失。撤销把条目放回原位；「在设置里管理」打开设置 › 功能。",
      win(sidebar(hidden), homePaper(hidden), toast)
    );

  // 场景 3：前后对比
  document.getElementById("result-frames").innerHTML =
    frame(
      "前",
      "现在：19 个入口全部显示",
      "分组只能折叠；一屏放不下时要滚动才能看到分享组。",
      win(sidebar(ALL), homePaper(ALL))
    ) +
    frame(
      "后",
      "只选「写作与笔记」：7 个入口",
      "学习、AI、分享三组整组消失；今日页只剩洞见、最近编辑、回顾。",
      win(sidebar(WRITING), homePaper(WRITING))
    );

  function icon(name, size) {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.75");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (window.ICONS[name] || []).forEach(([tag, attrs]) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }
  document
    .querySelectorAll("[data-i]")
    .forEach(el => el.prepend(icon(el.dataset.i, Number(el.dataset.s || 16))));
  document
    .querySelectorAll("[data-lights]")
    .forEach(el => (el.innerHTML = "<i></i><i></i><i></i>"));

  const root = document.documentElement;
  const family = document.getElementById("theme-family");
  const mode = document.getElementById("theme-mode");
  const saved = JSON.parse(localStorage.getItem("mock-theme") || "{}");
  const apply = (theme, dark) => {
    root.dataset.theme = theme;
    root.dataset.mode = dark ? "dark" : "light";
    family.value = theme;
    mode.textContent = dark ? "深色" : "浅色";
    localStorage.setItem("mock-theme", JSON.stringify({ theme, dark }));
  };
  apply(saved.theme || "paper", Boolean(saved.dark));
  family.addEventListener("change", () => apply(family.value, root.dataset.mode === "dark"));
  mode.addEventListener("click", () => apply(root.dataset.theme, root.dataset.mode !== "dark"));

  function fitScale() {
    const avail = Math.min(window.innerWidth - 56, 1400);
    const pair = (avail - 26) / 2 / 1080;
    root.style.setProperty(
      "--ws",
      (pair >= 0.42 ? Math.min(0.62, pair) : Math.min(0.62, avail / 1080)).toFixed(3)
    );
    root.style.setProperty("--wsb", Math.min(0.9, avail / 1080).toFixed(3));
  }
  fitScale();
  window.addEventListener("resize", fitScale);

  const tabs = document.querySelectorAll(".tabs .tab");
  const show = key => {
    tabs.forEach(t => t.classList.toggle("on", t.dataset.tab === key));
    document
      .querySelectorAll(".scene")
      .forEach(s => s.classList.toggle("on", s.dataset.scene === key));
    history.replaceState(null, "", `#${key}`);
    window.scrollTo(0, 0);
  };
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));
  const initial = location.hash.slice(1);
  show(document.querySelector(`[data-scene="${initial}"]`) ? initial : tabs[0].dataset.tab);
})();
