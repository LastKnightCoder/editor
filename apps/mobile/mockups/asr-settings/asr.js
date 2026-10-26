// ASR mockup 渲染脚本：图标、状态栏、键盘、电平、主题与场景。
(function () {
  const svgNS = "http://www.w3.org/2000/svg";

  function icon(name, size) {
    const nodes = window.ICONS && window.ICONS[name];
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
      const element = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      svg.appendChild(element);
    });
    return svg;
  }

  function render() {
    document.querySelectorAll("[data-status]").forEach(element => {
      element.innerHTML = `<span>9:41</span><span class="r"><span data-i="signal" data-s="15"></span><span data-i="wifi" data-s="15"></span><span data-i="battery-full" data-s="20"></span></span>`;
    });
    const row = keys =>
      `<div class="kb-row">${[...keys].map(k => `<span class="kb-key">${k}</span>`).join("")}</div>`;
    document.querySelectorAll("[data-kb]").forEach(element => {
      element.innerHTML =
        row("qwertyuiop") +
        row("asdfghjkl") +
        `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">⇧</span>${[..."zxcvbnm"].map(k => `<span class="kb-key">${k}</span>`).join("")}<span class="kb-key f" style="flex-basis:42px">⌫</span></div>` +
        `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">123</span><span class="kb-key space">空格</span><span class="kb-key f" style="flex-basis:78px">完成</span></div><div class="kb-home"></div>`;
    });
    document.querySelectorAll("[data-lvl]").forEach(element => {
      for (let index = 0; index < 28; index++) {
        const bar = document.createElement("i");
        bar.style.height = `${4 + ((index * 13 + index * index * 7) % 20)}px`;
        element.appendChild(bar);
      }
    });
    document.querySelectorAll("[data-i]").forEach(element => {
      element.prepend(icon(element.dataset.i, Number(element.dataset.s || 16)));
    });
    document.querySelectorAll("[data-wave]").forEach(element => {
      for (let index = 0; index < 42; index++) {
        const bar = document.createElement("i");
        const height = 5 + ((index * 17 + index * index * 3) % 22);
        bar.style.height = `${height}px`;
        element.appendChild(bar);
      }
    });
  }

  function setupTheme() {
    const root = document.documentElement;
    const family = document.getElementById("theme-family");
    const mode = document.getElementById("theme-mode");
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("mock-theme") || "{}");
    } catch {
      saved = {};
    }
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
    const scale = Math.max(0.55, Math.min(1, (window.innerHeight - 190) / 760));
    document.documentElement.style.setProperty("--s", scale.toFixed(3));
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tabs .tab");
    const show = key => {
      tabs.forEach(tab => tab.classList.toggle("on", tab.dataset.tab === key));
      document.querySelectorAll(".scene").forEach(scene => {
        scene.classList.toggle("on", scene.dataset.scene === key);
      });
      history.replaceState(null, "", `#${key}`);
      window.scrollTo(0, 0);
    };
    tabs.forEach(tab => tab.addEventListener("click", () => show(tab.dataset.tab)));
    const initial = location.hash.slice(1);
    show(document.querySelector(`[data-scene="${initial}"]`) ? initial : "mobile");
  }

  render();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
