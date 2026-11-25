// 平板 mockup：侧栏导航与缩放，须在 ai-mobile/ai.js（图标、状态栏、主题、标签切换）之前执行。
(function () {
  const RAIL = [
    ["home", "house", "今天"],
    ["cards", "layers", "卡片"],
    ["diary", "notebook-pen", "日记"],
    ["me", "user", "我的"],
  ];
  // 自选入口 = 「我的」功能宫格的顺序：内置在前，插件接在后面（插件用自己的图标，示意为字块）
  const PINS = [
    ["todo", "list-checks", "任务"],
    ["article", "file-text", "文章"],
    ["project", "folder-open", "项目"],
    ["flashcard", "book-open", "闪卡"],
    ["pomodoro", "timer", "番茄"],
    ["weight", "pl:减", "减重"],
    ["expense", "pl:账", "记账"],
    ["weread", "pl:读", "微信读书"],
    ["podcast", "pl:播", "播客"],
  ];
  const glyph = name =>
    name.startsWith("pl:")
      ? `<i><b class="pl">${name.slice(3)}</b></i>`
      : `<i data-i="${name}" data-s="21"></i>`;
  const item = (name, label, on, extra = "") =>
    `<span class="ri${on ? " on" : ""}${extra}">${glyph(name)}${label}</span>`;

  document.querySelectorAll("[data-rail]").forEach(element => {
    const active = element.dataset.rail;
    const pins = element.hasAttribute("data-pins");
    const pinOn = element.dataset.pinOn;
    element.classList.add("rail");
    element.innerHTML =
      `<span class="rail-fab" data-i="plus" data-s="24"></span>` +
      RAIL.map(([key, name, label]) => item(name, label, key === active)).join("") +
      (pins
        ? `<i class="rail-div"></i><div class="rail-pins">` +
          PINS.map(([key, name, label]) => item(name, label, key === pinOn)).join("") +
          item("ellipsis", "更多", element.dataset.moreOn === "", " more") +
          `</div>`
        : `<span class="sp"></span>`) +
      item("search", "搜索", false);
  });

  // 能放几个按导航条剩余高度算：全放得下就全放；放不下时最后一格换成「更多」；连「更多」都放不下就整段收起
  function fitPins() {
    const hidden = [...document.querySelectorAll(".scene:not(.on)")];
    hidden.forEach(scene => scene.classList.add("on"));
    document.querySelectorAll(".rail-pins").forEach(slot => {
      const items = [...slot.querySelectorAll(".ri:not(.more)")];
      const more = slot.querySelector(".ri.more");
      items.forEach(el => (el.hidden = false));
      more.hidden = true;
      const pitch = 48 + 10;
      const capacity = Math.floor((slot.clientHeight + 10) / pitch);
      const shown = capacity >= items.length ? items.length : Math.max(0, capacity - 1);
      items.forEach((el, index) => (el.hidden = index >= shown));
      more.hidden = capacity >= items.length || capacity < 1;
      slot.previousElementSibling.hidden = capacity < 1;
      const rest = slot.closest(".tablet")?.querySelector("[data-more-list]");
      if (rest) {
        rest.innerHTML = PINS.slice(shown)
          .map(([, name, label]) =>
            name.startsWith("pl:")
              ? `<div><b class="pl">${name.slice(3)}</b>${label}</div>`
              : `<div data-i="${name}" data-s="18">${label}</div>`
          )
          .join("");
        // 菜单底边与「更多」按钮底边对齐、向上展开（两者都以 .t-body 为定位基准）
        const menu = rest.parentElement;
        const body = slot.closest(".t-body");
        const moreBottom = more.getBoundingClientRect().bottom - body.getBoundingClientRect().top;
        const scale = body.getBoundingClientRect().height / body.offsetHeight;
        menu.style.top = `${Math.max(8, moreBottom / scale - menu.offsetHeight)}px`;
      }
      const count = slot.closest(".t-frame")?.querySelector("[data-pin-count]");
      if (count) count.textContent = `${shown} 个${more.hidden ? "（全部）" : " + 更多"}`;
    });
    hidden.forEach(scene => scene.classList.remove("on"));
  }
  fitPins();

  document.querySelectorAll(".tablet:not(.pane)").forEach(element => {
    if (!element.querySelector(".home-ind")) {
      const bar = document.createElement("i");
      bar.className = "home-ind";
      element.appendChild(bar);
    }
  });

  function fit() {
    const width = Math.min(window.innerWidth - 90, 1180 * 0.7);
    document.documentElement.style.setProperty("--ts", Math.max(0.42, width / 1180).toFixed(3));
  }
  fit();
  window.addEventListener("resize", fit);
})();
