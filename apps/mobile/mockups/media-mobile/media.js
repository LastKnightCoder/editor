// 媒体交互 mockup 渲染脚本：图标、状态栏、系统键盘、波形、场景切换、主题与缩放
(function () {
  const svgNS = "http://www.w3.org/2000/svg";

  function icon(name, size) {
    const nodes = window.ICONS && window.ICONS[name];
    if (!nodes) console.warn("缺少图标", name);
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    (nodes || []).forEach(([tag, attrs]) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  const ic = (name, size = 16) => `<span data-i="${name}" data-s="${size}"></span>`;

  function keyboard() {
    const row = keys =>
      `<div class="kb-row">${keys.map(k => `<span class="kb-key">${k}</span>`).join("")}</div>`;
    return (
      row("qwertyuiop".split("")) +
      row("asdfghjkl".split("")) +
      `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">⇧</span>${"zxcvbnm"
        .split("")
        .map(k => `<span class="kb-key">${k}</span>`)
        .join("")}<span class="kb-key f" style="flex-basis:42px">⌫</span></div>` +
      `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">123</span><span class="kb-key f" style="flex-basis:36px">🌐</span><span class="kb-key space">空格</span><span class="kb-key f" style="flex-basis:78px">换行</span></div>` +
      `<div class="kb-home"></div>`
    );
  }

  // 波形：data-wave="条数,已播放比例"，高度用固定种子伪随机，保证每次渲染一致
  function wave(el) {
    const [count, played] = el.dataset.wave.split(",").map(Number);
    let seed = 7;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    el.innerHTML = Array.from({ length: count }, (_, i) => {
      const h = 22 + Math.round(rand() * 78);
      return `<i class="${i / count < played ? "p" : ""}" style="height:${h}%"></i>`;
    }).join("");
  }

  function render() {
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r">${ic("signal", 15)}${ic("wifi", 15)}${ic("battery-full", 20)}</span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => (el.innerHTML = keyboard()));
    document.querySelectorAll("[data-wave]").forEach(wave);
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
      mode.classList.toggle("on", dark);
      localStorage.setItem("mock-theme", JSON.stringify({ theme, dark }));
    };
    apply(saved.theme || "paper", Boolean(saved.dark));
    family.addEventListener("change", () => apply(family.value, root.dataset.mode === "dark"));
    mode.addEventListener("click", () => apply(root.dataset.theme, root.dataset.mode !== "dark"));
  }

  function fitScale() {
    const s = Math.max(0.55, Math.min(1, (window.innerHeight - 190) / 760));
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
    show(document.querySelector(`[data-scene="${initial}"]`) ? initial : "now");
  }

  render();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
