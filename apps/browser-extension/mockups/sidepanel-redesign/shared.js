// mockup 顶栏：页面导航 + 「桌面端主题」模拟切换（主题名同步）+ 插件自己的深浅
(function () {
  const THEMES = [
    ["paper", "暖纸"],
    ["ocean", "海盐"],
    ["mint", "薄荷"],
    ["wisteria", "紫藤"],
    ["sakura", "樱花"],
    ["ink", "水墨"],
  ];
  const PAGES = [
    ["index.html", "总览"],
    ["a-tabs.html", "A 顶部页签"],
    ["b-stream.html", "B 阅读伴侣"],
    ["c-chat.html", "C 对话为主"],
    ["theme-sync.html", "主题同步"],
    ["dark-tone.html", "深色调亮"],
  ];
  const root = document.documentElement;
  const theme = localStorage.getItem("mk-ext-theme") || "paper";
  const mode = localStorage.getItem("mk-ext-mode") || "light";
  root.dataset.theme = theme;
  root.dataset.mode = mode;

  const here = location.pathname.split("/").pop() || "index.html";
  const bar = document.createElement("div");
  bar.className = "mk-top";
  bar.innerHTML = `
    <div class="grp">${PAGES.map(
      ([href, label]) => `<a href="${href}" class="${href === here ? "on" : ""}">${label}</a>`
    ).join('<span class="lbl">·</span>')}</div>
    <span class="sp"></span>
    <div class="grp"><span class="lbl">桌面端主题（同步过来）</span>${THEMES.map(
      ([key, name]) =>
        `<button class="mk-sw ${key === theme ? "on" : ""}" data-k="${key}"><i data-theme="${key}" data-mode="${mode}"></i>${name}</button>`
    ).join("")}</div>
    <div class="grp"><span class="lbl">插件深浅（各自）</span>
      <button class="mk-mode ${mode === "light" ? "on" : ""}" data-m="light">浅</button>
      <button class="mk-mode ${mode === "dark" ? "on" : ""}" data-m="dark">深</button>
    </div>`;
  document.body.prepend(bar);
  bar.addEventListener("click", event => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.k) localStorage.setItem("mk-ext-theme", target.dataset.k);
    if (target.dataset.m) localStorage.setItem("mk-ext-mode", target.dataset.m);
    location.reload();
  });

  // 页面内标注「当前主题名」的位置
  const name = THEMES.find(([key]) => key === theme)?.[1] ?? "暖纸";
  document.querySelectorAll("[data-theme-name]").forEach(el => (el.textContent = name));
  // 主题色板：每个色点带自己的 data-theme，取各主题的 accent
  document.querySelectorAll("[data-swatches]").forEach(el => {
    el.innerHTML = THEMES.map(
      ([key, label]) =>
        `<span class="swatch ${key === theme ? "on" : ""}" title="${label}"><i data-theme="${key}" data-mode="${mode}"></i><em>${label}</em></span>`
    ).join("");
  });

  if (window.lucide) window.lucide.createIcons();
})();
