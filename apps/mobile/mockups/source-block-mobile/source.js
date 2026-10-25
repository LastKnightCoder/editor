// 源码块 mockup 渲染脚本：图标、状态栏、系统键盘、渲染结果示意图、场景切换、主题与缩放
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

  function keyboard(kind) {
    const row = keys =>
      `<div class="kb-row">${keys.map(k => `<span class="kb-key">${k}</span>`).join("")}</div>`;
    const top = kind === "sym" ? "1234567890".split("") : "qwertyuiop".split("");
    const mid = kind === "sym" ? "-/:;()$&@".split("") : "asdfghjkl".split("");
    const low = kind === "sym" ? [".", ",", "?", "!", "'"] : "zxcvbnm".split("");
    return (
      row(top) +
      row(mid) +
      `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">${kind === "sym" ? "#+=" : "⇧"}</span>${low
        .map(k => `<span class="kb-key">${k}</span>`)
        .join("")}<span class="kb-key f" style="flex-basis:42px">⌫</span></div>` +
      `<div class="kb-row"><span class="kb-key f" style="flex-basis:42px">${kind === "sym" ? "ABC" : "123"}</span><span class="kb-key f" style="flex-basis:36px">🌐</span><span class="kb-key space">空格</span><span class="kb-key f" style="flex-basis:78px">换行</span></div>` +
      `<div class="kb-home"></div>`
    );
  }

  // 渲染结果示意：data-fig="名称[,宽度]"，宽度缺省按图自身尺寸
  const FIGS = {
    // TikZ：三角形与外接圆
    tikz: w => `<svg viewBox="0 0 240 140" width="${w || 220}" fill="none" stroke="currentColor" stroke-width="1.3" style="display:block">
      <circle cx="120" cy="70" r="55"/>
      <path d="M101.2 18.3 L68.3 88.8 L167.6 97.5 Z" stroke-width="1.6"/>
      <path d="M120 70 L167.6 97.5" stroke-dasharray="3 3"/>
      <circle cx="120" cy="70" r="2.2" fill="currentColor"/>
      <path d="M80.5 70.6 A 20 20 0 0 1 84.3 90.2" />
      <g fill="currentColor" stroke="none" font-family="Times New Roman, serif" font-style="italic" font-size="15">
        <text x="96" y="12">A</text><text x="52" y="96">B</text><text x="172" y="108">C</text>
        <text x="110" y="66">O</text><text x="146" y="80" font-size="13">r</text>
      </g></svg>`,
    // TikZ：横向流程图，宽度 520，手机上放不下
    flow: w => `<svg viewBox="0 0 520 70" width="${w || 520}" fill="none" stroke="currentColor" stroke-width="1.3" style="display:block">
      ${["采集", "清洗", "特征", "训练", "评估"]
        .map(
          (t, i) => `<rect x="${6 + i * 104}" y="16" width="76" height="38" rx="6"/>
          <text x="${44 + i * 104}" y="40" text-anchor="middle" fill="currentColor" stroke="none" font-size="14" font-family="Songti SC, serif">${t}</text>
          ${i < 4 ? `<path d="M${84 + i * 104} 35 h24 m-6 -5 l6 5 l-6 5"/>` : ""}`
        )
        .join("")}</svg>`,
    // ABC：一小节五线谱
    abc: w => `<svg viewBox="0 0 280 74" width="${w || 260}" fill="none" stroke="currentColor" style="display:block">
      ${[0, 1, 2, 3, 4].map(i => `<line x1="4" x2="276" y1="${18 + i * 9}" y2="${18 + i * 9}" stroke-width=".9"/>`).join("")}
      <line x1="140" x2="140" y1="18" y2="54" stroke-width="1.1"/><line x1="276" x2="276" y1="18" y2="54" stroke-width="2"/>
      <text x="6" y="56" font-size="44" fill="currentColor" stroke="none" font-family="serif">𝄞</text>
      ${[
        [50, 49.5],
        [72, 45],
        [94, 40.5],
        [116, 36],
        [160, 31.5],
        [184, 36],
        [208, 40.5],
        [244, 45],
      ]
        .map(
          ([x, y]) =>
            `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.4" transform="rotate(-20 ${x} ${y})" fill="currentColor" stroke="none"/><line x1="${x + 4.2}" x2="${x + 4.2}" y1="${y}" y2="${y - 26}" stroke-width="1.1"/>`
        )
        .join("")}</svg>`,
  };

  function render() {
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r">${ic("signal", 15)}${ic("wifi", 15)}${ic("battery-full", 20)}</span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => (el.innerHTML = keyboard(el.dataset.kb)));
    document.querySelectorAll("[data-fig]").forEach(el => {
      const [name, width] = el.dataset.fig.split(",");
      el.insertAdjacentHTML("afterbegin", FIGS[name](width && Number(width)));
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
