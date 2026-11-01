// mockup 渲染脚本：图标、主题切换、场景切换与窗口缩放
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

  function renderIcons() {
    document.querySelectorAll("[data-i]").forEach(el => {
      el.prepend(icon(el.dataset.i, Number(el.dataset.s || 16)));
    });
    document.querySelectorAll("[data-lights]").forEach(el => {
      el.innerHTML = "<i></i><i></i><i></i>";
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

  // 两扇主窗口并排放得下即可，最大不超过 0.72
  function fitScale() {
    const avail = Math.min(window.innerWidth - 56, 1400);
    const s = Math.max(0.42, Math.min(0.72, (avail - 26) / 2 / 1080));
    document.documentElement.style.setProperty("--ws", s.toFixed(3));
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

  renderIcons();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
