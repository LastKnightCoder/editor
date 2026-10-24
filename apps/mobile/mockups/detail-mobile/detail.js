// 内容详情页 mockup：所有手机帧由 phone() 按配置拼装，方案之间只差配置，便于逐项对比
(() => {
  const ICON = {
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    pencil:
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    way: '<circle cx="12" cy="4.5" r="2.5"/><path d="m10.2 6.3-3.9 3.9"/><circle cx="4.5" cy="12" r="2.5"/><path d="M7 12h10"/><circle cx="19.5" cy="12" r="2.5"/><path d="m13.8 17.7 3.9-3.9"/><circle cx="12" cy="19.5" r="2.5"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    repeat:
      '<path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    todo: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    outdent:
      '<path d="M21 12H11"/><path d="M21 18H11"/><path d="M21 6H11"/><path d="m7 8-4 4 4 4"/>',
    indent:
      '<path d="M21 12H11"/><path d="M21 18H11"/><path d="M21 6H11"/><path d="m3 8 4 4-4 4"/>',
    tree: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
    pointer:
      '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    card: '<rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 10h10"/><path d="M7 14h6"/>',
  };
  const ic = name => `<svg class="i" viewBox="0 0 24 24">${ICON[name]}</svg>`;

  const BLOCKS = [
    "当程序跑飞或者端口被占用时，我们常常用 <code>kill</code> 把对应的进程结束掉。那输入 <code>kill</code> 之后，进程身上究竟发生了什么？",
    '实际上当输入 <code>kill</code> 的时候，会给这个进程发送一个 <code>SIGTERM(15)</code> 的信号，<span class="uline">这个信号是可以被捕获或者丢弃的</span>，也就是说，进程不会被立即杀掉，进程可以捕获这个信号，收到信号后可以有序的清理资源，然后自行退出，这给了进程优雅退出的机会。',
    "所以 <code>kill</code> 并不能完全保证杀死进程，进程在捕获信号后，可以忽略，或者在退出时出现了意外卡死，<code>kill</code> 还提供了一个选项 <code>-9</code> 来杀死进程，它也会发出一个信号 <code>SIGKILL(9)</code>，这个信号是不可以被捕获的，内核会直接终止进程，进程没有任何机会做清理，因此可能会留下临时文件、损坏的文件状态，子进程可能变为孤儿进程。",
    "还有一种常见的信号也和退出进程有关，那就是 <code>SIGINT(2)</code>，每次按下 <code>Ctrl + C</code> 的时候会触发这个信号，它同样是可以捕获的，因此程序可以监听该信号然后优雅退出。",
  ];
  const TAGS = ["操作系统/进程管理/信号", "命令/kill"];

  // ── 顶栏 ──
  const back = `<button class="hbtn">${ic("chevL")}</button>`;
  const moreBtn = `<button class="hbtn">${ic("more")}</button>`;
  const center = text => `<span class="center">${text}</span>`;
  const HEADERS = {
    now: () =>
      `${back}${center("卡片")}<div class="right"><span class="pill-edit">${ic("pencil")}编辑</span>${moreBtn}</div>`,
    nowEdit: () =>
      `${back}${center("卡片")}<div class="right"><span class="txt-btn">完成</span>${moreBtn}</div>`,
    A: () =>
      `<span class="back-label">${ic("chevL")}卡片库</span><div class="right"><button class="hbtn sm">${ic("pencil")}</button>${moreBtn}</div>`,
    Aedit: () =>
      `<span class="back-label">${ic("chevL")}卡片库</span><div class="right"><span class="txt-btn">完成</span>${moreBtn}</div>`,
    B: () => `${back}${center("卡片")}<div class="right">${moreBtn}</div>`,
    C: () => `${back}${center("卡片")}`,
    select: count =>
      `<span class="txt-btn muted">取消</span>${center(
        `<span class="sel-count">${count > 0 ? `已选 ${count} 个块` : "选择块"}</span>`
      )}<div class="right"><span class="txt-btn">全选</span></div>`,
  };

  // ── 底部浮层 ──
  const actionButtons = () =>
    [
      ["up", "上移"],
      ["down", "下移"],
      ["repeat", "转换"],
      ["copy", "复制"],
      ["trash", "删除", "danger"],
      ["more", "更多"],
    ]
      .map(([icon, label, cls = ""]) => `<button class="${cls}">${ic(icon)}${label}</button>`)
      .join("");
  const OVERLAYS = {
    fab: () => `<div class="fab">${ic("pencil")}编辑</div>`,
    readbar: () =>
      `<div class="readbar"><button class="primary">${ic("pencil")}编辑</button><button>${ic(
        "list"
      )}目录</button><button>${ic("way")}脉络 3</button><button>${ic("more")}更多</button></div>`,
    edit: done =>
      `<div class="accessory"><span class="k">${ic("plus")}</span><span class="k aa">Aa</span><span class="k">${ic(
        "todo"
      )}</span><span class="k">${ic("list")}</span><span class="k">${ic("outdent")}</span><span class="k">${ic(
        "indent"
      )}</span>${
        done
          ? `<span class="done">${ic("check")}完成</span>`
          : `<span class="kd">${ic("chevD")}</span>`
      }</div><div class="kb">系统键盘</div>`,
    abarNow: empty => `<nav class="abar-now ${empty ? "empty" : ""}">${actionButtons()}</nav>`,
    abarFloat: () => `<nav class="abar-float">${actionButtons()}</nav>`,
    abarHint: () => `<div class="abar-float hint">${ic("pointer")}点按段落来选择，可以多选</div>`,
    sheet: () => `<div class="mask"></div><div class="sheet"><div class="grab"></div>
      <div class="sheet-title">${ic("way")}脉络 · 3</div>
      <div class="sheet-sub">当程序跑飞或者端口被占用时…</div>
      <div class="sheet-sec">连接 · 1</div>
      <div class="sheet-row tap">${ic("card")}<span class="k">卡片</span><span class="t">SIGKILL 与孤儿进程</span>${ic("chevR")}</div>
      <div class="sheet-sec">被引用 · 2</div>
      <div class="sheet-row">${ic("file")}<span class="k">文章</span><span class="t">Linux 信号机制笔记</span>${ic("chevR")}</div>
      <div class="sheet-row">${ic("card")}<span class="k">卡片</span><span class="t">优雅退出的三种写法</span>${ic("chevR")}</div>
      <div class="tap-note">① 点按 → ② 浮层先收起 → ③ 再推入新页<br/>浮层不再带着滚动锁留在下层页</div>
    </div>`,
  };

  // ── 正文 ──
  function renderMeta(opts) {
    const chip = opts.metaCtx
      ? `<span class="ctx-chip">${ic("way")}脉络 3${ic("chevR")}</span>`
      : "";
    return `<div class="meta"><span>10月24日 13:10</span><span class="dot">·</span><span>345 字</span>${chip}</div>`;
  }

  function renderFooter(kind) {
    if (kind === "now") {
      return `<div class="tags-now">${TAGS.map(tag => `<span><b>#</b>${tag}</span>`).join("")}</div>
        <div class="ctx-now"><div>${ic("way")}脉络 · 3<span class="chev">${ic("chevR")}</span></div></div>`;
    }
    if (kind === "list") {
      return `<div class="info">
        <div class="info-row"><span class="lab">${ic("hash")}标签</span><span class="val">${TAGS.map(
          tag => `<span class="t">#${tag}</span>`
        ).join("")}<span class="add">+ 添加</span></span></div>
        <div class="info-row"><span class="lab">${ic("link")}关联</span><span class="val">SIGKILL 与孤儿进程 等</span><span class="count">2</span><span class="chev">${ic(
          "chevR"
        )}</span></div>
        <div class="info-row"><span class="lab">${ic("way")}脉络</span><span class="val">被 2 处引用 · 1 个连接</span><span class="count">3</span><span class="chev">${ic(
          "chevR"
        )}</span></div>
      </div>`;
    }
    if (kind === "lite") {
      return `<div class="tags-lite">${TAGS.map(tag => `<span>#${tag}</span>`).join(
        ""
      )}<span class="add">+ 标签</span></div>`;
    }
    return "";
  }

  function renderBlocks(opts) {
    const selected = opts.select?.selected ?? [];
    const drag = opts.drag;
    let html = "";
    BLOCKS.forEach((text, index) => {
      if (drag && drag.to === index) html += '<div class="drop-line"></div>';
      const on = selected.includes(index) ? "on" : "";
      const placeholder = drag && drag.from === index ? "placeholder" : "";
      const check = opts.select ? `<span class="chk ${on}">${on ? ic("check") : ""}</span>` : "";
      const handle =
        opts.editing?.handle === index ? `<span class="handle">${ic("grip")}</span>` : "";
      const caret = opts.editing?.caret === index ? '<span class="caret"></span>' : "";
      html += `<div class="blk ${on} ${placeholder}">${check}${handle}<p>${text}${caret}</p></div>`;
    });
    return html;
  }

  function renderBody(opts) {
    const docClass = [
      "doc",
      `code-${opts.code ?? "now"}`,
      opts.code === "new" ? "tight" : "",
      opts.select ? `sel-${opts.select.mode}` : "",
    ].join(" ");
    return `${renderMeta(opts)}<div class="${docClass}">${renderBlocks(opts)}</div>${renderFooter(
      opts.footer
    )}`;
  }

  function renderStuck() {
    return `<div class="stuck">
      <div class="under">
        <div class="lib-title">卡片库</div>
        <div class="lib-card">当程序跑飞或者端口被占用时，我们常常用 kill 把对应的进程结束掉…</div>
        <div class="lib-card">使用 Claude 作为主模型，作为大脑，子模型执行调研和执行…</div>
      </div>
      <div class="over">
        <div class="status"><span>12:28</span><span></span></div>
        <div class="topbar">${back}</div>
        <div class="scroll"><div class="doc code-now">${renderBlocks({})}</div></div>
      </div>
    </div>`;
  }

  function phone(opts) {
    if (opts.stuck)
      return `<div class="phone-wrap"><div class="phone">${renderStuck()}</div></div>`;
    const header =
      opts.header === "select"
        ? HEADERS.select(opts.select?.selected.length ?? 0)
        : HEADERS[opts.header ?? "now"]();
    const overlay = (opts.overlays ?? []).map(([name, arg]) => OVERLAYS[name](arg)).join("");
    const scrollClass = ["scroll", opts.select?.mode === "shift" ? "shifted" : ""].join(" ");
    const ghost = opts.drag
      ? `<div class="drag-ghost" style="top:${opts.drag.ghostTop}px">${BLOCKS[opts.drag.from]}</div>`
      : "";
    const edge = opts.edgeZone
      ? '<div class="edge-zone"></div><div class="edge-label">边缘返回起手区 28px</div>'
      : "";
    return `<div class="phone-wrap"><div class="phone ${opts.paper ? "paper" : ""}">
      <div class="status"><span>13:11</span><span>●●● ▮</span></div>
      <div class="topbar">${header}</div>
      <div class="${scrollClass}" data-scroll="${opts.scroll ?? "top"}">${renderBody(opts)}</div>
      ${edge}${ghost}${overlay}
    </div></div>`;
  }

  function frame(def) {
    const badge = def.rec
      ? '<span class="rec">推荐</span>'
      : def.bad
        ? '<span class="bad">现状</span>'
        : "";
    return `<div class="frame">
      <div class="frame-cap"><span class="no">${def.no}</span>${def.title}${badge}</div>
      ${phone(def.phone)}
      ${def.note ? `<div class="frame-note">${def.note}</div>` : ""}
    </div>`;
  }

  // ── 各页签的帧 ──
  const SCENES = {
    "header-frames": [
      {
        no: "现状",
        title: "左 1 个图标 / 右胶囊 + ⋯",
        bad: true,
        phone: { header: "now" },
        note: "「编辑」是顶栏里唯一带底色的元素，再加上 ⋯，右侧明显更重。",
      },
      {
        no: "A1",
        title: "iOS 式分区 · 阅读态",
        phone: { header: "A" },
        note: '去掉居中的「卡片」，返回键带上一页名称，右侧两个同款线框图标。不对称是有意为之，左边负责去哪，右边负责做什么。<br/><span class="pro">优</span> 改动最小，接近系统原生。<span class="con">缺</span> 编辑仍在屏幕顶端，单手够不着；上一页名称过长时要截断。',
      },
      {
        no: "A2",
        title: "iOS 式分区 · 编辑态",
        phone: { header: "Aedit", editing: { caret: 1, handle: 1 }, overlays: [["edit", false]] },
        note: "编辑时铅笔图标换成「完成」文字，其余不变。",
      },
      {
        no: "B1",
        title: "编辑下沉 · 阅读态",
        rec: true,
        phone: { header: "B", overlays: [["fab"]] },
        note: '顶栏只剩 返回 / 卡片 / ⋯，左右各一个按钮，完全对称。「编辑」改成右下角悬浮按钮，单手拇指正好点到；向下滚动时缩成圆形图标，向上滚动时展开。<br/><span class="pro">优</span> 对称；编辑操作就在拇指区，和备忘录、Bear 一致。<span class="con">缺</span> 悬浮按钮会盖住右下角的一点正文（滚到底时页尾会留出空白）。',
      },
      {
        no: "B2",
        title: "编辑下沉 · 编辑态",
        rec: true,
        phone: { header: "B", editing: { caret: 1, handle: 1 }, overlays: [["edit", true]] },
        note: "悬浮按钮消失，配件栏接管；配件栏右端的「收起键盘」换成「✓ 完成」，点了回到阅读态。顶栏前后不变，切换编辑时不跳动。",
      },
      {
        no: "C",
        title: "底部阅读条",
        phone: { header: "C", overlays: [["readbar"]] },
        note: '顶栏只留返回和标题；编辑、目录、脉络、更多都放进底部阅读条。<br/><span class="pro">优</span> 所有操作都在拇指区，脉络有固定入口。<span class="con">缺</span> 常驻占用约 56px；阅读态选中文字时的「标注条」也在底部，两者要互相替换；和其他页面的顶栏风格不一致。',
      },
    ],
    "type-frames": [
      {
        no: "现状",
        title: "描边代码胶囊 / 带色页面底",
        bad: true,
        phone: { header: "now" },
        note: "行内代码：描边 + 底色，字号 0.95em，几乎有一行高；段间距约 20px。",
      },
      {
        no: "T1",
        title: "轻修",
        phone: { header: "B", code: "new", overlays: [["fab"]] },
        note: "行内代码<b>去掉描边</b>，改用 7% 墨色淡底，字号 0.84em，内边距收窄，读起来是「文字的一部分」而不是按钮；段间距 20 → 13px。页面底色不变。",
      },
      {
        no: "T2",
        title: "纸面（轻修 + 白底）",
        rec: true,
        phone: { header: "B", code: "new", paper: true, overlays: [["fab"]] },
        note: "在 T1 基础上，详情页的底色从页面色换成卡片的表面色（顶栏同色）。卡片库里看到的是白卡片，点进去还是同一张白纸，前后连贯；正文与底色的对比也更柔和。深色模式下同样适用（右上角可切换）。",
      },
    ],
    "footer-frames": [
      {
        no: "现状",
        title: "大胶囊标签 + 半截卡片",
        bad: true,
        phone: { header: "now", footer: "now", scroll: "bottom" },
        note: "标签带阴影，显得很重；「脉络」卡片只有表头，看起来像没加载完。",
      },
      {
        no: "F1",
        title: "统一信息区",
        rec: true,
        phone: { header: "B", code: "new", paper: true, footer: "list", scroll: "bottom" },
        note: '一条分隔线下，标签、关联、脉络各占一行，样式完全一致：左边是图标和类别，中间是内容，右边是数量和箭头。标签行可以直接「+ 添加」；没有关联或脉络时，那一行不显示。<br/><span class="pro">优</span> 规整，以后新增信息类型直接加一行。<span class="con">缺</span> 要滚到底才能看到脉络。',
      },
      {
        no: "F2a",
        title: "脉络上移 · 顶部",
        phone: { header: "B", code: "new", paper: true, metaCtx: true, footer: "lite" },
        note: "脉络变成元信息行右端的小胶囊，一打开卡片就能看到有几条关联。",
      },
      {
        no: "F2b",
        title: "脉络上移 · 页尾",
        phone: {
          header: "B",
          code: "new",
          paper: true,
          metaCtx: true,
          footer: "lite",
          scroll: "bottom",
        },
        note: '页尾只剩轻量标签（淡底小方块，无阴影）。关联卡片并进脉络浮层里查看。<br/><span class="pro">优</span> 页尾最轻，脉络一眼可见。<span class="con">缺</span> 关联卡片少了独立入口；元信息行会变挤。',
      },
    ],
    "select-frames": [
      {
        no: "现状",
        title: "勾选圈贴屏 / 灰色底栏",
        bad: true,
        phone: {
          header: "select",
          select: { mode: "now", selected: [] },
          overlays: [["abarNow", true]],
        },
        note: "勾选圈距屏幕边 2px；没选中时 6 个按钮全灰。",
      },
      {
        no: "S1a",
        title: "正文右移 · 已选 2 个",
        rec: true,
        phone: {
          header: "select",
          paper: true,
          code: "new",
          select: { mode: "shift", selected: [0, 1] },
          overlays: [["abarFloat"]],
        },
        note: '进入选择模式时，正文以动画方式整体右移 28px，左侧空出一列放勾选圈（离屏幕边 16px）；选中块整块铺淡底，连勾选圈一起包住。底栏改为离屏幕边 12px 的悬浮条。<br/><span class="pro">优</span> iOS 邮件、备忘录都是这种编辑模式，最好认。<span class="con">缺</span> 右移后正文会重新排版，长段落可能多出一行。',
      },
      {
        no: "S1b",
        title: "正文右移 · 未选中",
        rec: true,
        phone: {
          header: "select",
          paper: true,
          code: "new",
          select: { mode: "shift", selected: [] },
          overlays: [["abarHint"]],
        },
        note: "选中 0 个时，悬浮条只显示一句提示；选中第一个块后再展开为操作按钮。",
      },
      {
        no: "S2",
        title: "整块卡片",
        phone: {
          header: "select",
          paper: true,
          code: "new",
          select: { mode: "card", selected: [0, 1] },
          overlays: [["abarFloat"]],
        },
        note: '每个块变成一张虚线小卡片（向两侧外扩到边距里，正文位置不变），选中时变为实线描边加淡底，右上角出现勾号。<br/><span class="pro">优</span> 正文不重排；块的边界一目了然。<span class="con">缺</span> 满屏虚线框比较花；块之间要多留间距。',
      },
      {
        no: "S3",
        title: "左侧细条",
        phone: {
          header: "select",
          paper: true,
          code: "new",
          select: { mode: "bar", selected: [0, 1] },
          overlays: [["abarFloat"]],
        },
        note: '左边距里放一根 3.5px 竖条：未选中是浅灰，选中是主题色并铺淡底。没有勾选圈。<br/><span class="pro">优</span> 最安静，正文不动。<span class="con">缺</span> 「可以多选」的暗示弱于勾选圈；细条的点按热区需要扩到整个块。',
      },
    ],
    "drag-frames": [
      {
        no: "B1",
        title: "把手落在边缘返回区",
        bad: true,
        phone: { header: "nowEdit", editing: { caret: 1, handle: 1 }, edgeZone: true },
        note: "斜线区是返回手势的起手区。把手就在区内，长按后往右下拖，整页会被拉着往右走。",
      },
      {
        no: "B2",
        title: "松手后两页卡在半途",
        bad: true,
        phone: { stuck: true },
        note: "对应你的截图 2：返回手势没收到正常的结束事件，没有弹回原位。",
      },
      {
        no: "修复后",
        title: "拖拽中",
        phone: {
          header: "B",
          paper: true,
          code: "new",
          drag: { from: 0, to: 2, ghostTop: 470 },
        },
        note: "从把手开始的触点不再参与返回手势，整页保持不动；被拖的块浮起，原位置显示虚线占位，主题色插入线标出松手后的落点。另外，返回手势在任何异常结束时都会弹回原位。",
      },
      {
        no: "B3",
        title: "脉络跳转：先关浮层",
        phone: { header: "B", paper: true, code: "new", overlays: [["sheet"]] },
        note: "现在点条目不会关闭浮层，浮层连同它的滚动锁一起留在下层页，新页面因此滚不动。修复后先收起浮层，再推入新页。",
      },
    ],
  };

  function render() {
    Object.entries(SCENES).forEach(([id, defs]) => {
      document.getElementById(id).innerHTML = defs.map(frame).join("");
    });
    document.querySelectorAll('.scroll[data-scroll="bottom"]').forEach(el => {
      el.scrollTop = el.scrollHeight;
    });
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab[data-tab]");
    const show = key => {
      tabs.forEach(tab => tab.classList.toggle("on", tab.dataset.tab === key));
      document.querySelectorAll(".scene").forEach(scene => {
        scene.classList.toggle("on", scene.dataset.scene === key);
      });
      localStorage.setItem("detail-mock-tab", key);
      // 隐藏页签里的滚动容器没有尺寸，切换后再定位到底部
      document
        .querySelectorAll(`.scene[data-scene="${key}"] .scroll[data-scroll="bottom"]`)
        .forEach(el => (el.scrollTop = el.scrollHeight));
    };
    tabs.forEach(tab => tab.addEventListener("click", () => show(tab.dataset.tab)));
    show(localStorage.getItem("detail-mock-tab") || "issues");
  }

  function setupTheme() {
    const root = document.documentElement;
    const family = document.getElementById("theme-family");
    const mode = document.getElementById("theme-mode");
    const saved = JSON.parse(localStorage.getItem("detail-mock-theme") || "{}");
    const apply = (theme, dark) => {
      root.dataset.theme = theme;
      root.dataset.mode = dark ? "dark" : "light";
      family.value = theme;
      mode.textContent = dark ? "深色" : "浅色";
      mode.classList.toggle("on", dark);
      localStorage.setItem("detail-mock-theme", JSON.stringify({ theme, dark }));
    };
    apply(saved.theme || "sakura", Boolean(saved.dark));
    family.addEventListener("change", () => apply(family.value, root.dataset.mode === "dark"));
    mode.addEventListener("click", () => apply(root.dataset.theme, root.dataset.mode !== "dark"));
  }

  function fitScale() {
    const s = Math.max(0.55, Math.min(1, (window.innerHeight - 190) / 760));
    document.documentElement.style.setProperty("--s", s.toFixed(3));
  }

  fitScale();
  window.addEventListener("resize", fitScale);
  setupTheme();
  render();
  setupTabs();
})();
