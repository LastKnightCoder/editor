// 语音优先 mockup：复用 editor-mobile 的图标与手机帧；手机部件由 data-* 声明，这里统一渲染
(function () {
  const svgNS = "http://www.w3.org/2000/svg";
  Object.assign(window.ICONS, {
    square: [["rect", { x: "6", y: "6", width: "12", height: "12", rx: "2.5" }]],
    "mic-off": [
      ["line", { x1: "2", x2: "22", y1: "2", y2: "22" }],
      ["path", { d: "M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" }],
      ["path", { d: "M5 10v2a7 7 0 0 0 12 5" }],
      ["path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }],
      ["path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" }],
      ["line", { x1: "12", x2: "12", y1: "19", y2: "22" }],
    ],
    "rotate-ccw": [
      ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
      ["path", { d: "M3 3v5h5" }],
    ],
    "undo-dot": [
      ["path", { d: "M9 14 4 9l5-5" }],
      ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H11" }],
    ],
    inbox: [
      ["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12" }],
      [
        "path",
        {
          d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        },
      ],
    ],
    house: [
      ["path", { d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" }],
      [
        "path",
        {
          d: "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        },
      ],
    ],
    "notebook-pen": [
      ["path", { d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" }],
      ["path", { d: "M2 6h4" }],
      ["path", { d: "M2 10h4" }],
      ["path", { d: "M2 14h4" }],
      ["path", { d: "M2 18h4" }],
      [
        "path",
        {
          d: "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
        },
      ],
    ],
    user: [
      ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
      ["circle", { cx: "12", cy: "7", r: "4" }],
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
  const diary = `<div class="meta">日记 · 10 月 30 日 周五</div><h1>今天</h1>
      <p>上午把同步模块的冲突处理重写了一遍，下午讨论了语音输入的新入口。</p>
      <h2>想法</h2>
      <p>阅读的时候也应该能随口补一句，不用先进编辑再找按钮。</p>`;
  const DOCS = {
    base: () => `${head}<p>下一步：${caret}</p>`,
    voiceCaret: () => `${head}<p>下一步：<span class="vcaret"></span></p>`,
    ghost: () =>
      `${head}<p>下一步：<span class="ghost">把这张卡片拆成三个问答，</span><span class="ghost live">加入今天的复</span><span class="vcaret"></span></p>`,
    ghostCancel: () =>
      `${head}<p>下一步：<span class="ghost cancel">把这张卡片拆成三个问答，加入今天的复习</span></p>`,
    committed: () =>
      `${head}<p>下一步：<span class="just-in">把这张卡片拆成三个问答，加入今天的复习队列。</span><span class="vcaret"></span></p>`,
    second: () =>
      `${head}<p>下一步：把这张卡片拆成三个问答，加入今天的复习队列。</p><p><span class="ghost">另外周五前</span><span class="ghost live">把例子补上</span><span class="vcaret"></span></p>`,
    tapMove: () =>
      `<div class="meta">卡片 · 3 天前编辑</div><h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯遗忘曲线说明，<span class="vcaret"></span>记忆在学习后的最初几天衰减最快。<span class="tap-dot"></span></p>
      <h2>核心机制</h2><ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>
      <p>下一步：把这张卡片拆成三个问答，加入今天的复习队列。</p>`,
    polishing: () =>
      `${head}<p>下一步：<span class="polishing">嗯就是把这张卡片拆成三个问答吧，然后那个，加入今天的复习队列</span><span class="vcaret"></span></p>`,
    polished: () =>
      `${head}<p>下一步：<span class="just-in">把这张卡片拆成 3 个问答，加入今天的复习队列。</span><span class="vcaret"></span></p>`,
    empty: () =>
      `<p class="ph">${caret}写点什么，或者点左下角 <span class="ph-mic"></span> 直接说</p>`,
    read: () => `${diary}<p>晚上去跑步，配速比上周快了十几秒。</p>`,
    readVoice: () =>
      `${diary}<p>晚上去跑步，配速比上周快了十几秒。</p><p><span class="ghost">睡前想到：语音段落</span><span class="ghost live">应该短暂高亮</span><span class="vcaret"></span></p>`,
    capture: () =>
      `<p><span class="ghost">周五前把移动端语音输入的方案定下来，</span><span class="ghost live">顺便问一下</span><span class="vcaret"></span></p>`,
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

  function wave(el) {
    const count = Number(el.dataset.wave || 28);
    el.innerHTML = Array.from({ length: count }, (_, i) => {
      const h = 22 + Math.round(70 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
      return `<i style="--h:${h}%;animation-delay:${(i % 7) * -0.13}s"></i>`;
    }).join("");
  }

  // 配件栏：data-acc="kb" 键盘模式（左端是 🎤 切换键）；"voice" 语音模式（左端变 ⌨）；
  // 追加 "coach" 显示首次引导气泡
  function accessory(el) {
    const [mode, extra] = el.dataset.acc.split(" ");
    const ab = (name, cls = "") => `<span class="ab ${cls}" data-i="${name}" data-s="19"></span>`;
    const toggle =
      mode === "voice"
        ? `<span class="mode-key kb-on" data-i="keyboard" data-s="20"></span>`
        : `<span class="mode-key" data-i="mic" data-s="20"></span>`;
    const coach =
      extra === "coach" ? `<span class="coach">现在可以点这里，用说的输入<i></i></span>` : "";
    el.classList.add("acc");
    el.innerHTML =
      `${toggle}${coach}<span class="ab plus" data-i="plus" data-s="20"></span><div class="scroll"><span class="ab txt">Aa</span>` +
      ["square-check", "list", "indent-decrease", "indent-increase", "file-text", "image"]
        .map(n => ab(n))
        .join("") +
      `</div><span class="vsep"></span>${ab("keyboard-off")}`;
  }

  // 语音面板：data-vp="ready | listening | hold | cancel | committed | polishing | polished | quiet | unconfigured | denied"
  function voicePanel(el) {
    const state = el.dataset.vp;
    el.classList.add("vp", `vp-${state}`);
    const side = (name, label, cls = "") =>
      `<span class="side ${cls}"><span class="side-b" data-i="${name}" data-s="20"></span><em>${label}</em></span>`;
    const undo = ["committed", "polished"].includes(state)
      ? side("undo-dot", "撤回这段")
      : side("undo-dot", "撤回", "off");
    const enter = side("corner-down-left", "换行");
    let top = "";
    let center = "";
    let hint = "";
    switch (state) {
      case "ready":
        top = `<span class="vp-state">轻点开始</span>`;
        center = `<span class="mic-big" data-i="mic" data-s="34"></span>`;
        hint = "点一下开始说，再点一下停止 · 也可以按住说";
        break;
      case "listening":
        top = `<span class="timer">0:07</span><div class="wave" data-wave="22"></div>`;
        center = `<span class="mic-big live" data-i="square" data-s="30"></span>`;
        hint = "说完点一下 · 停顿 10 秒自动停止";
        break;
      case "hold":
        top = `<span class="timer">0:04</span><div class="wave" data-wave="22"></div>`;
        center = `<span class="mic-big live held" data-i="mic" data-s="34"></span>`;
        hint = "松手写入 · 上滑到 ✕ 取消";
        break;
      case "cancel":
        top = `<span class="timer idle">0:05</span><div class="wave still" data-wave="22"></div>`;
        center = `<span class="mic-big dim" data-i="mic" data-s="34"></span>`;
        hint = '<b class="danger-t">松手取消，这段不写入</b>';
        break;
      case "committed":
        top = `<span class="vp-chip ok"><span data-i="check" data-s="13"></span>已写入 21 字</span>`;
        center = `<span class="mic-big" data-i="mic" data-s="34"></span>`;
        hint = "接着点一下继续说";
        break;
      case "polishing":
        top = `<span class="vp-chip"><span class="spark" data-i="sparkles" data-s="13"></span>AI 润色中…</span><span class="vp-link">跳过</span>`;
        center = `<span class="mic-big" data-i="mic" data-s="34"></span>`;
        hint = "润色时也可以继续说下一段";
        break;
      case "polished":
        top = `<span class="vp-chip ok"><span data-i="sparkles" data-s="13"></span>已润色</span><span class="vp-link">用原文</span>`;
        center = `<span class="mic-big" data-i="mic" data-s="34"></span>`;
        hint = "接着点一下继续说";
        break;
      case "quiet":
        top = `<span class="timer">0:12</span><div class="wave still" data-wave="22"></div>`;
        center = `<span class="mic-big live" data-i="square" data-s="30"></span>`;
        hint = "没听到声音，3 秒后自动停止";
        break;
      case "unconfigured":
        top = `<span class="vp-state">还没设置语音识别</span>`;
        center = `<span class="mic-big off" data-i="mic-off" data-s="32"></span>`;
        hint =
          '<span class="cta">去设置语音识别<span data-i="chevron-right" data-s="14"></span></span>';
        break;
      case "denied":
        top = `<span class="vp-state">没有麦克风权限</span>`;
        center = `<span class="mic-big off" data-i="mic-off" data-s="32"></span>`;
        hint =
          '<span class="cta">去系统设置开启<span data-i="chevron-right" data-s="14"></span></span>';
        break;
    }
    const x = ["hold", "cancel"].includes(state)
      ? `<span class="hold-x ${state === "cancel" ? "armed" : ""}" data-i="x" data-s="${state === "cancel" ? 26 : 22}"></span>`
      : "";
    el.innerHTML =
      `${x}<div class="vp-top">${top}</div>` +
      `<div class="vp-row">${undo}${center}${enter}</div>` +
      `<div class="vp-hint">${hint}</div><div class="kb-home"></div>`;
  }

  function dock(el) {
    const tab = (name, label, on) =>
      `<span class="dk ${on ? "on" : ""}"><span data-i="${name}" data-s="21"></span><em>${label}</em></span>`;
    const held = el.dataset.dock === "held";
    el.classList.add("dock");
    el.innerHTML =
      tab("house", "今天", true) +
      tab("layers", "卡片") +
      `<span class="dk-fab ${held ? "held" : ""}" data-i="${held ? "mic" : "plus"}" data-s="${held ? 26 : 24}"></span>` +
      tab("notebook-pen", "日记") +
      tab("user", "我的");
  }

  function render() {
    document.querySelectorAll("[data-acc]").forEach(accessory);
    document.querySelectorAll("[data-vp]").forEach(voicePanel);
    document.querySelectorAll("[data-dock]").forEach(dock);
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r"><span data-i="signal" data-s="15"></span><span data-i="wifi" data-s="15"></span><span data-i="battery-full" data-s="20"></span></span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => (el.innerHTML = keyboard()));
    document.querySelectorAll("[data-doc]").forEach(el => (el.innerHTML = DOCS[el.dataset.doc]()));
    document.querySelectorAll(".ph-mic").forEach(el => {
      el.dataset.i = "mic";
      el.dataset.s = "14";
    });
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
    show(document.querySelector(`[data-scene="${initial}"]`) ? initial : "why");
  }

  render();
  setupTheme();
  fitScale();
  window.addEventListener("resize", fitScale);
  setupTabs();
})();
