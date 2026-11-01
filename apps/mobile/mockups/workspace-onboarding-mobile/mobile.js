// mockup 渲染脚本：状态栏、键盘、图标、主题切换、场景切换与手机帧缩放
(function () {
  const svgNS = "http://www.w3.org/2000/svg";

  function icon(name, size) {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (window.ICONS[name] || []).forEach(([tag, attrs]) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  function render() {
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r"><span data-i="signal" data-s="15"></span><span data-i="wifi" data-s="15"></span><span data-i="battery-full" data-s="20"></span></span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => {
      const row = n => `<div class="rowk">${"<i></i>".repeat(n)}</div>`;
      el.innerHTML = `<div class="cand">${el.dataset.kb || ""}</div>${row(10)}${row(9)}<div class="rowk"><i class="m"></i>${"<i></i>".repeat(7)}<i class="m"></i></div><div class="rowk"><i class="m"></i><i class="m"></i><i class="w"></i><i class="m" style="width:88px"></i></div>`;
    });
    document.querySelectorAll(".phone").forEach(el => {
      if (!el.querySelector(".home-ind"))
        el.insertAdjacentHTML("beforeend", '<span class="home-ind"></span>');
    });
    document.querySelectorAll("[data-i]").forEach(el => {
      el.prepend(icon(el.dataset.i, Number(el.dataset.s || 16)));
    });
  }

  function setupTheme() {
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
  }

  function fitScale() {
    const s = Math.max(0.55, Math.min(1, (window.innerHeight - 200) / 760));
    document.documentElement.style.setProperty("--s", s.toFixed(3));
  }

  function setupTabs() {
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
  }

  render();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
