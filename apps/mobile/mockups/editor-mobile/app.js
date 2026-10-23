// mockup 渲染脚本：图标、状态栏、系统键盘、示例文档、场景切换与缩放
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
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  const ic = (name, size = 16) => `<span data-i="${name}" data-s="${size}"></span>`;
  const caret = mode =>
    mode === "none" ? "" : `<span class="caret${mode === "static" ? "" : " blink"}"></span>`;

  const DOCS = {
    basic: c => `
      <div class="meta">卡片 · 3 天前编辑</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p>
      <h2>核心机制</h2>
      <ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>
      <p>下一步：把这张卡片拆成 3 个问答，加入今天的复习队列。${caret(c)}</p>`,
    select: () => `
      <div class="meta">卡片 · 3 天前编辑</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p>
      <h2>核心机制</h2>
      <ul><li><span class="sel"><b>主动回忆</b>比重复阅读<i class="h1"></i><i class="h2"></i></span>更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>
      <p>下一步：把这张卡片拆成 3 个问答，加入今天的复习队列。</p>`,
    table: () => `
      <h1>复习间隔对照</h1>
      <p>按 SM-2 默认参数估算：</p>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>轮次</th><th>间隔</th><th>累计天数</th><th>备注</th></tr>
        <tr><td>1</td><td>1 天</td><td>1</td><td>首次回忆</td></tr>
        <tr><td>2</td><td class="focus">6 天${caret("blink")}</td><td>7</td><td>固定值</td></tr>
        <tr><td>3</td><td>15 天</td><td>22</td><td>× 难度系数</td></tr>
      </table></div>
      <p>超过第 3 轮后间隔增长明显放缓。</p>`,
    code: () => `
      <h1>复习调度</h1>
      <p>核心是一个按难度系数放大的间隔：</p>
      <div class="code"><span class="lang">TypeScript</span><span class="k">function</span> nextInterval(
  prev: <span class="k">number</span>,
  ease: <span class="k">number</span>
) {
  <span class="c">// 首轮固定 1 天</span>
  <span class="k">if</span> (prev === 0) <span class="k">return</span> 1;
  <span class="k">return</span> Math.round(prev * ease${caret("blink")}
}</div>`,
    grip: () => `
      <div class="meta">卡片 · 3 天前编辑</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p>
      <h2>核心机制</h2>
      <ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>
      <div class="blk"><span class="grip on">${ic("grip-vertical", 16)}</span><p>下一步：把这张卡片拆成 3 个问答，加入今天的复习队列。${caret("blink")}</p></div>`,
    picked: () => `
      <div class="blk"><span class="chk"></span><h1>间隔重复为什么有效</h1></div>
      <div class="blk"><span class="chk"></span><p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p></div>
      <div class="blk picked"><span class="chk on">${ic("check", 13)}</span><h2>核心机制</h2></div>
      <div class="blk picked" style="margin-top:12px"><span class="chk on">${ic("check", 13)}</span><ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul></div>
      <div class="blk" style="margin-top:8px"><span class="chk"></span><p>下一步：把这张卡片拆成 3 个问答，加入今天的复习队列。</p></div>
      <div class="blk"><span class="chk"></span><h2>实践方法</h2></div>
      <div class="blk"><span class="chk"></span><p>每天固定时段清空复习队列，新卡上限 20 张。</p></div>`,
    picked1: () => `
      <div class="blk"><h1>间隔重复为什么有效</h1></div>
      <div class="blk picked"><p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p></div>
      <h2>核心机制</h2>
      <ul><li>主动回忆比重复阅读更能巩固记忆</li></ul>`,
    drag: () => `
      <div class="meta">卡片 · 3 天前编辑</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯遗忘曲线说明，记忆在学习后的最初几天衰减最快。</p>
      <div class="drop-line"></div>
      <h2>核心机制</h2>
      <ul><li>主动回忆比重复阅读更能巩固记忆</li><li>间隔逐步拉长，复习成本递减</li></ul>
      <div style="border:1.5px dashed var(--line-1);border-radius:10px;height:62px;margin:6px 0"></div>
      <h2>实践方法</h2>
      <p>每天固定时段清空复习队列，新卡上限 20 张。</p>
      <div class="lifted" style="left:20px;right:12px;top:196px"><p style="margin:0">下一步：把这张卡片拆成 3 个问答，加入今天的复习队列。</p></div>
      <div class="finger" style="left:-6px;top:204px"></div>`,
    read: () => `
      <div class="meta">卡片 · 3 天前编辑 · 阅读约 2 分钟</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯<a class="lk" data-a="link">遗忘曲线</a>说明，记忆在学习后的最初几天衰减最快，<span class="hl">及时回忆</span>能把曲线拉平。</p>
      <h2>今天要做</h2>
      <div class="todo done"><span class="box on">${ic("check", 12)}</span><span class="t">读完《认知天性》第 3 章</span></div>
      <div class="todo" data-a="todo"><span class="box"></span><span class="t">把这张卡片拆成 3 个问答</span></div>
      <div class="todo"><span class="box"></span><span class="t">加入今天的复习队列</span></div>
      <div class="img">遗忘曲线.png · 点按查看大图</div>
      <h2>核心机制</h2>
      <p>主动回忆比重复阅读更能巩固记忆；间隔逐步拉长，复习成本递减。</p>`,
    readEdit: () => `
      <div class="meta">卡片 · 3 天前编辑 · 阅读约 2 分钟</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯<a class="lk">遗忘曲线</a>说明，记忆在学习后的最初几天衰减最快，<span data-a="caret">${caret("blink")}</span><span class="hl">及时回忆</span>能把曲线拉平。</p>
      <h2>今天要做</h2>
      <div class="todo done"><span class="box on">${ic("check", 12)}</span><span class="t">读完《认知天性》第 3 章</span></div>
      <div class="todo"><span class="box"></span><span class="t">把这张卡片拆成 3 个问答</span></div>`,
    readSel: () => `
      <div class="meta">卡片 · 3 天前编辑 · 阅读约 2 分钟</div>
      <h1>间隔重复为什么有效</h1>
      <p>艾宾浩斯<a class="lk">遗忘曲线</a>说明，记忆在学习后的最初几天衰减最快。<span class="sel" data-a="sel">主动回忆比重复阅读更能巩固记忆<i class="h1"></i><i class="h2"></i></span>，间隔逐步拉长，复习成本递减。</p>
      <h2>今天要做</h2>
      <div class="todo done"><span class="box on">${ic("check", 12)}</span><span class="t">读完《认知天性》第 3 章</span></div>
      <div class="todo"><span class="box"></span><span class="t">把这张卡片拆成 3 个问答</span></div>
      <div class="todo"><span class="box"></span><span class="t">加入今天的复习队列</span></div>
      <div class="img">遗忘曲线.png · 点按查看大图</div>`,
    mindmap: () => `
      <h1>记忆方法总览</h1>
      <p>用思维导图梳理几种方法的关系：</p>
      <div style="background:var(--bg-surface);border-radius:14px;box-shadow:var(--shadow-card);height:200px;margin:10px 0;position:relative;font-size:13px">
        <svg width="100%" height="100%" style="position:absolute;inset:0;stroke:var(--line-1)" fill="none" stroke-width="1.5">
          <path d="M96 100 C 130 100, 130 42, 168 42" /><path d="M96 100 L 168 100" /><path d="M96 100 C 130 100, 130 158, 168 158" />
        </svg>
        <span style="position:absolute;left:14px;top:86px;background:var(--ink-1);color:var(--ink-inv);padding:5px 12px;border-radius:9px;font-weight:600">记忆法</span>
        <span style="position:absolute;left:168px;top:28px;background:var(--sage-soft);color:var(--sage);padding:5px 10px;border-radius:8px">间隔重复</span>
        <span style="position:absolute;left:168px;top:86px;background:var(--brand-soft);color:var(--brand);padding:5px 10px;border-radius:8px;outline:2px solid var(--brand)">主动回忆${caret("blink")}</span>
        <span style="position:absolute;left:168px;top:144px;background:var(--sky-soft);color:var(--sky);padding:5px 10px;border-radius:8px">费曼技巧</span>
      </div>`,
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

  function render() {
    document.querySelectorAll("[data-status]").forEach(el => {
      el.innerHTML = `<span>9:41</span><span class="r">${ic("signal", 15)}${ic("wifi", 15)}${ic("battery-full", 20)}</span>`;
    });
    document.querySelectorAll("[data-kb]").forEach(el => (el.innerHTML = keyboard()));
    document.querySelectorAll("[data-doc]").forEach(el => {
      el.innerHTML = DOCS[el.dataset.doc](el.dataset.caret || "blink");
    });
    document.querySelectorAll("[data-i]").forEach(el => {
      el.prepend(icon(el.dataset.i, Number(el.dataset.s || 16)));
    });
  }

  // 标注按文档内锚点元素定位（data-anchor 对应同一手机帧内的 data-a）
  const ANCHOR_PLACE = {
    link: r => ({ left: r.left, top: r.top - 24 }),
    todo: r => ({ left: r.left + 28, top: r.bottom + 2 }),
    caret: r => ({ left: r.left - 21, top: r.top + r.height / 2 - 22 }),
    sel: r => ({ left: Math.max(12, r.left - 6), top: r.top - 42 }),
  };

  function placeAnchors() {
    document.querySelectorAll(".scene.on .phone").forEach(phone => {
      const base = phone.getBoundingClientRect();
      const scale = base.width / 360;
      phone.querySelectorAll("[data-anchor]").forEach(el => {
        const target = phone.querySelector(`[data-a="${el.dataset.anchor}"]`);
        if (!target) return;
        const t = target.getBoundingClientRect();
        const rect = {
          left: (t.left - base.left) / scale,
          top: (t.top - base.top) / scale,
          height: t.height / scale,
          bottom: (t.bottom - base.top) / scale,
        };
        const pos = ANCHOR_PLACE[el.dataset.anchor](rect);
        el.style.left = `${pos.left}px`;
        el.style.top = `${pos.top}px`;
      });
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
    placeAnchors();
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    const show = key => {
      tabs.forEach(t => t.classList.toggle("on", t.dataset.tab === key));
      document
        .querySelectorAll(".scene")
        .forEach(s => s.classList.toggle("on", s.dataset.scene === key));
      history.replaceState(null, "", `#${key}`);
      window.scrollTo(0, 0);
      requestAnimationFrame(placeAnchors);
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
