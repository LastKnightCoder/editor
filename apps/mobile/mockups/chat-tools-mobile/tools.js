// 工具行片段拼装：须在 ai-mobile/ai.js（渲染 data-i 图标）之前执行。
(function () {
  // data-tr="状态|类别图标|标题 HTML|右侧附注"；状态：ok run fail retry wait deny dim press
  const STATE_ICON = {
    run: "loader-circle",
    fail: "triangle-alert",
    retry: "rotate-cw",
    wait: "shield-alert",
  };
  document.querySelectorAll("[data-tr]").forEach(element => {
    const [state, kind, title, meta = ""] = element.dataset.tr.split("|");
    element.classList.add("tr", ...state.split(" "));
    const icon = STATE_ICON[state.split(" ")[0]] || kind;
    const chevron =
      state === "run" ? "" : `<span class="cv" data-i="chevron-right" data-s="15"></span>`;
    element.innerHTML =
      `<span class="ib2" data-i="${icon}" data-s="14"></span>` +
      `<span class="t">${title}</span>` +
      (meta ? `<span class="m">${meta}</span>` : "") +
      chevron;
  });

  // data-hit="色|图标|标题|摘要"：检索结果行
  document.querySelectorAll("[data-hit]").forEach(element => {
    const [tone, icon, title, excerpt] = element.dataset.hit.split("|");
    element.classList.add("hit");
    element.innerHTML =
      `<span class="k ${tone}" data-i="${icon}" data-s="16"></span>` +
      `<span class="tt"><b>${title}</b><small>${excerpt}</small></span>` +
      `<span class="cv" data-i="chevron-right" data-s="16"></span>`;
  });
})();
