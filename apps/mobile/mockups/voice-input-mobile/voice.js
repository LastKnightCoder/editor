// 语音输入 mockup：复用 editor-mobile 的图标与手机帧，渲染示例文档、键盘、波形与主题切换
(function () {
  const svgNS = "http://www.w3.org/2000/svg";
  Object.assign(window.ICONS, {
    square: [["rect", { x: "4", y: "4", width: "16", height: "16", rx: "3" }]],
    "mic-off": [
      ["line", { x1: "2", x2: "22", y1: "2", y2: "22" }],
      ["path", { d: "M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" }],
      ["path", { d: "M5 10v2a7 7 0 0 0 12 5" }],
      ["path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }],
      ["path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" }],
      ["line", { x1: "12", x2: "12", y1: "19", y2: "22" }],
    ],
    lock: [
      ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
      ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
    ],
    "chevron-up": [["path", { d: "m18 15-6-6-6 6" }]],
    "rotate-ccw": [
      ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
      ["path", { d: "M3 3v5h5" }],
    ],
  });

  function icon(name, size) {
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
    (window.ICONS[name] || []).forEach(([tag, attrs]) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  const caret = '<span class="caret blink"></span>';
  const head = `<div class="meta">卡片 · 3 天前编辑</div><h1>间隔重复为什么有效</h1>
    <p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p>
    <h2>核心机制</h2>
    <ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>`;
  const DOCS = {
    base: () => `${head}<p>下一步：${caret}</p>`,
    mark: () => `${head}<p>下一步：<span class="ins-mark"><i></i><em>语音插入点</em></span></p>`,
    ghost: () =>
      `${head}<p>下一步：<span class="ghost">把这张卡片拆成三个问答，</span><span class="ghost live">加入今天的复</span><span class="caret blink"></span></p>`,
    inserted: () =>
      `${head}<p>下一步：<span class="just-in">把这张卡片拆成三个问答，加入今天的复习队列。</span>${caret}</p>`,
    read: () => `<div class="meta">日记 · 10 月 29 日 周四</div><h1>今天</h1>
      <p>上午把同步模块的冲突处理重写了一遍，下午整理了语音输入的入口方案。</p>
      <h2>想法</h2>
      <p>阅读态里也应该能随口补一句，不用先进编辑再找按钮。</p>
      <p>晚上去跑步，配速比上周快了十几秒。</p>`,
    readMark: () => `<div class="meta">日记 · 10 月 29 日 周四</div><h1>今天</h1>
      <p>上午把同步模块的冲突处理重写了一遍，下午整理了语音输入的入口方案。</p>
      <h2>想法</h2>
      <p>阅读态里也应该能随口补一句，不用先进编辑再找按钮。</p>
      <p>晚上去跑步，配速比上周快了十几秒。</p>
      <p class="end-mark"><span class="ins-mark"><i></i><em>追加到文末</em></span></p>`,
    readDone: () => `<div class="meta">日记 · 10 月 29 日 周四</div>
      <p>阅读态里也应该能随口补一句，不用先进编辑再找按钮。</p>
      <p>晚上去跑步，配速比上周快了十几秒。</p>
      <p class="just-in">睡前想到：语音追加的段落应该短暂高亮，让人知道它落在哪里。</p>`,
    readGhost: () => `<div class="meta">日记 · 10 月 29 日 周四</div>
      <p>阅读态里也应该能随口补一句，不用先进编辑再找按钮。</p>
      <p>晚上去跑步，配速比上周快了十几秒。</p>
      <p><span class="ghost">睡前想到：语音追加的段落应该</span><span class="ghost live">短暂提示一下</span><span class="caret blink"></span></p>`,
    cancelled: () =>
      `${head}<p>下一步：<span class="ghost" style="opacity:.35;text-decoration:line-through">把这张卡片拆成三个问答，加入今天的复习</span></p>`,
    polishing: () =>
      `${head}<p>下一步：<span class="polishing">嗯就是把这张卡片拆成三个问答吧，然后那个，加入今天的复习队列</span></p>`,
    polished: () =>
      `${head}<p>下一步：<span class="just-in">把这张卡片拆成 3 个问答，加入今天的复习队列。</span>${caret}</p>`,
    rawBack: () =>
      `${head}<p>下一步：<span class="just-in">嗯就是把这张卡片拆成三个问答吧，然后那个，加入今天的复习队列</span>${caret}</p>`,
    readPolishing: () => `<div class="meta">日记 · 10 月 29 日 周四</div>
      <p>阅读态里也应该能随口补一句，不用先进编辑再找按钮。</p>
      <p>晚上去跑步，配速比上周快了十几秒。</p>
      <p><span class="polishing">嗯睡前想到，就是语音追加的段落吧应该短暂提示一下，让人知道它落在哪里</span></p>`,
    short: () => `<p>周五前把移动端语音输入的方案定下来。${caret}</p>`,
    empty: () => `<p class="ph">${caret}记录你的想法...</p>`,
    capture: () =>
      `<p><span class="ghost">周五前把移动端语音输入的方案定下来，</span><span class="ghost live">顺便问一下</span><span class="caret blink"></span></p>`,
  };

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

  // 波形条：data-wave="数量"，data-still 表示静止（收尾 / 暂停态）
  function wave(el) {
    const count = Number(el.dataset.wave || 28);
    el.innerHTML = Array.from({ length: count }, (_, i) => {
      const h = 22 + Math.round(70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
      return `<i style="--h:${h}%;animation-delay:${(i % 7) * -0.13}s"></i>`;
    }).join("");
  }

  // 配件栏：data-acc="idle" 默认；"on" 表示 🎤 高亮
  function accessory(el) {
    const state = el.dataset.acc;
    const ab = (name, extra = "") =>
      `<span class="ab ${extra}" data-i="${name}" data-s="19"></span>`;
    el.classList.add("acc");
    el.innerHTML =
      `<span class="ab plus" data-i="plus" data-s="20"></span><div class="scroll"><span class="ab txt">Aa</span>` +
      ["square-check", "list", "indent-decrease", "indent-increase", "file-text", "image"]
        .map(n => ab(n))
        .join("") +
      `</div>${ab("mic", state === "on" ? "on" : "")}<span class="vsep"></span>${ab("keyboard-off")}`;
  }

  function render() {
    document.querySelectorAll("[data-acc]").forEach(accessory);
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r"><span data-i="signal" data-s="15"></span><span data-i="wifi" data-s="15"></span><span data-i="battery-full" data-s="20"></span></span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => (el.innerHTML = keyboard()));
    document.querySelectorAll("[data-doc]").forEach(el => (el.innerHTML = DOCS[el.dataset.doc]()));
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
    show(document.querySelector(`[data-scene="${initial}"]`) ? initial : "research");
  }

  render();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
