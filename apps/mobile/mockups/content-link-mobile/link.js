// 内容引用 mockup：所有手机帧由 phone() 按配置拼装，方案之间只差配置，便于逐项对比
(() => {
  const ICON = {
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    pencil:
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    layers:
      '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    fileText:
      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    kanban:
      '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
    link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
    unlink:
      '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    open: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    todo: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    image:
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    indent:
      '<path d="M21 12H11"/><path d="M21 18H11"/><path d="M21 6H11"/><path d="m3 8 4 4-4 4"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    kbDown:
      '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
    searchX:
      '<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    quote: '<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>',
  };
  const ic = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24">${ICON[name]}</svg>`;

  const KIND = {
    card: { label: "卡片", icon: "layers", tone: "tone-card" },
    article: { label: "文章", icon: "fileText", tone: "tone-article" },
    project: { label: "项目文档", icon: "kanban", tone: "tone-project" },
  };
  const tile = (kind, cls = "") =>
    `<span class="kind-tile ${cls || KIND[kind].tone}">${ic(KIND[kind]?.icon || kind)}</span>`;

  // ── 正文 ──
  const LINKS = {
    a: { text: "遗忘曲线", kind: "card" },
    b: { text: "检索练习比重复阅读更有效", kind: "article" },
  };

  /** 行内引用：style = now | l1 | l2 | l3；flags.press / flags.broken / flags.caret 指定作用的引用 */
  function cl(style, key, flags) {
    const { text, kind } = LINKS[key];
    if (flags.broken === key) return `<span class="cl-broken">${text}</span>`;
    const press = flags.press === key ? " press" : "";
    let inner = text;
    if (flags.caret === key)
      inner = `${text.slice(0, 2)}<span class="caret"></span>${text.slice(2)}`;
    if (flags.select === key) inner = `<span class="sel">${text}</span>`;
    switch (style) {
      case "now":
        return `<span class="cl-now${press}">${inner}</span>`;
      case "l2":
        return `<span class="cl-l2${press}">${ic(KIND[kind].icon, "ti")}${inner}</span>`;
      case "l3":
        return `<span class="cl-l3${press}">${inner}${ic(KIND[kind].icon, "ti")}</span>`;
      default:
        return `<span class="cl-l1${press}">${inner}</span>`;
    }
  }

  function doc(style = "l1", flags = {}) {
    const A = cl(style, "a", flags);
    const B = cl(style, "b", flags);
    const plainA = flags.plainA ? `<span class="sel">遗忘曲线</span>` : A;
    return `
      <div class="meta"><span>10月21日 14:03</span><span class="dot">·</span><span>312 字</span></div>
      <div class="doc">
        <p>学过的东西会沿着${plainA}迅速衰减：第一天忘得最快，之后逐渐放缓。</p>
        <p>所以复习的间隔应该随记忆强度拉长，而不是每天机械地重读。${B}，每次回忆都是一次加固。</p>
        <p>具体的间隔算法可以参考 <span class="wl">SuperMemo 的算法说明</span>，<span class="uu">不必追求精确的参数</span>，坚持比精确更重要。</p>
        <p>我现在的做法是：新卡片当天复习一次，之后按 1、3、7、15 天拉开，答错就回到第一档。</p>
      </div>`;
  }

  // ── 手机帧 ──
  const back = `<button class="hbtn">${ic("chevL")}</button>`;
  const TOPBAR = {
    read: `${back}<span class="center">卡片</span><div class="right"><button class="hbtn">${ic("more")}</button></div>`,
    edit: `${back}<span class="center">卡片</span><div class="right"><span class="txt-btn">完成</span></div>`,
    picker: `${back}<span class="center">卡片</span><div class="right"><span class="txt-btn">完成</span></div>`,
  };
  const FAB = `<div class="fab">${ic("pencil")}编辑</div>`;

  function phone({ body, overlay = "", topbar = "read", fab = false, cls = "" }) {
    return `<div class="phone-wrap"><div class="phone ${cls}">
      <div class="status"><span>9:41</span><span>100%</span></div>
      <div class="topbar">${TOPBAR[topbar]}</div>
      <div class="scroll">${body}</div>
      ${fab ? FAB : ""}
      ${overlay}
    </div></div>`;
  }

  const frame = ({ no, title, tag = "", note, html }) => `
    <div class="frame">
      <div class="frame-cap"><span class="no">${no}</span>${title}${tag}</div>
      ${html}
      <div class="frame-note">${note}</div>
    </div>`;
  const REC = '<span class="rec">推荐</span>';
  const NOW = '<span class="bad">现状</span>';

  const tap = (x, y) => `<div class="tap" style="left:${x}px;top:${y}px"></div>`;
  const note = (x, y, text) => `<div class="note" style="left:${x}px;top:${y}px">${text}</div>`;

  const keyboard = () => {
    const keys = n => "<i></i>".repeat(n);
    return `<div class="kb">
      <div class="row">${keys(10)}</div>
      <div class="row">${keys(9)}</div>
      <div class="row"><i class="w"></i>${keys(7)}<i class="w"></i></div>
      <div class="row"><i class="w"></i><i class="w"></i><i class="sp"></i><i class="w"></i></div>
    </div>`;
  };

  /** 通用模式配件栏（现状编辑态） */
  const accDefault = () => `<div class="acc">
      <span class="ab">${ic("plus")}</span><span class="ab">Aa</span><span class="ab">${ic("todo")}</span>
      <span class="ab">${ic("indent")}</span><span class="ab">${ic("image")}</span><span class="ab">${ic("undo")}</span>
      <span class="ab push">${ic("kbDown")}</span>
    </div>`;

  // ── 预览 Sheet ──
  const PREVIEW_BODY = `
    <p>1885 年，艾宾浩斯用无意义音节做记忆实验，记录了不同间隔后的保持率：</p>
    <ul><li>20 分钟后约剩 58%</li><li>1 小时后约剩 44%</li><li>1 天后约剩 34%，6 天后约剩 25%</li></ul>
    <blockquote>遗忘在学习后立刻开始，而且最初的速度最快。</blockquote>
    <p>这条曲线说明了两件事：复习要趁早，间隔要逐步拉开。</p>`;

  function previewSheet({ top = 300, foot, head, body = PREVIEW_BODY, tags = true, pull = true }) {
    return `<div class="dim"></div>
      <div class="sheet" style="top:${top}px">
        <div class="handle"><i></i></div>
        ${pull ? '<span class="pull-hint">上拉阅读全文</span>' : ""}
        ${head}
        ${tags ? '<div class="sh-tags"><span>记忆</span><span>学习方法</span></div>' : ""}
        <div class="sh-body">${body}</div>
        ${foot}
      </div>`;
  }
  const sheetHead = ({ kind = "card", tone, icon, title, meta }) => `
    <div class="sh-head">
      <span class="kind-tile ${tone || KIND[kind].tone}">${ic(icon || KIND[kind].icon)}</span>
      <div style="min-width:0;flex:1">
        <div class="sh-title">${title}</div>
        <div class="sh-meta">${meta}</div>
      </div>
    </div>`;
  const CARD_HEAD = sheetHead({
    title: "艾宾浩斯遗忘曲线",
    meta: '<span>卡片</span><span class="dot">·</span><span>3 天前编辑</span><span class="dot">·</span><span>约 860 字</span>',
  });
  const FOOT_READ = `<div class="sh-foot"><span class="btn primary">${ic("open")}打开卡片</span></div>`;
  const FOOT_EDIT = `<div class="sh-foot">
      <span class="btn ghost icon-only danger">${ic("unlink")}</span>
      <span class="btn ghost">${ic("swap")}更换</span>
      <span class="btn primary">${ic("open")}打开</span>
    </div>`;

  // ── 1 行内样式 ──
  function sceneStyle() {
    return [
      frame({
        no: "现状",
        title: "tag-1 色 + 双线下边框",
        tag: NOW,
        html: phone({ body: doc("now"), fab: true }),
        note: "引用固定用 <b>tag-1</b>，6 个主题里它都是苔绿色，和 accent 无关；切到樱花、紫藤时最明显。3px 双线下边框比用户自选的下划线还重。第二个引用因为 <code>inline-flex</code> 不能折行，<b>整块挤到下一行</b>，上一行留下一截空白。",
      }),
      frame({
        no: "L1",
        title: "与网页链接同族，点线区分",
        tag: REC,
        html: phone({ body: doc("l1"), fab: true }),
        note: '字色用 <b>accent-text</b>，下划线是 45% accent 的<b>点线</b>；网页链接是实线，用户下划线保持自选颜色。与桌面端现在的写法一致，两端看到的是同一个元素。<span class="pro">优</span> 安静、跟随主题、可以正常折行。<span class="con">缺</span> 点线和实线在小字号下差别不大，主要靠点开后的内容区分。',
      }),
      frame({
        no: "L2",
        title: "提及胶囊（淡底 + 类型图标）",
        html: phone({ body: doc("l2"), fab: true }),
        note: '<b>accent-soft</b> 淡底加类型图标（卡片、文章、项目文档），一眼能看出这是站内内容，触控面积也更大。<span class="pro">优</span> 辨识度最高，像 @提及。<span class="con">缺</span> 一段里引用多了会变成一串色块，阅读节奏被打断；和桌面的样式不一致。',
      }),
      frame({
        no: "L3",
        title: "L1 + 尾部类型小图标",
        html: phone({ body: doc("l3"), fab: true }),
        note: '在 L1 的基础上，文字右上角加一个约 11px 的类型图标，像脚注标记。<span class="pro">优</span> 不加底色也能区分站内引用和网页链接。<span class="con">缺</span> 图标要放进 Slate 的行内节点里，光标在边界附近的处理更复杂；和桌面的样式不一致。',
      }),
    ].join("");
  }

  // ── 2 阅读态点击 ──
  function sceneRead() {
    const nowPop = `<div class="pop now" style="top:182px">
        <div class="pmeta">2026/10/21 14:03:22 · 862 字</div>
        <div class="pbody">${PREVIEW_BODY}</div>
      </div>${tap(194, 160)}${note(206, 140, "再点一次才进入详情")}`;

    const peek = `<div class="pop peek" style="top:184px;--arrow:172px">
        <div class="peek-row">${tile("card")}<div style="min-width:0">
          <div class="peek-title">艾宾浩斯遗忘曲线</div>
          <div class="peek-meta">卡片 · 3 天前编辑</div></div></div>
        <div class="peek-ex">1885 年，艾宾浩斯用无意义音节做记忆实验，记录了不同间隔后的保持率：20 分钟后约剩 58%，1 小时后约剩 44%……</div>
        <div class="peek-open"><span>打开${ic("open")}</span></div>
      </div>`;

    const longPress = `<div class="dim"></div>
      <div class="asheet">
        <div class="grp">
          <div class="hd">艾宾浩斯遗忘曲线 · 卡片</div>
          <div class="it">${ic("eye")}预览</div>
          <div class="it">${ic("open")}打开</div>
          <div class="it">${ic("copy")}复制引用文字</div>
        </div>
        <div class="grp"><div class="cancel">取消</div></div>
      </div>`;

    return [
      frame({
        no: "现状",
        title: "锚点浮层 + 两段点击",
        tag: NOW,
        html: phone({ body: doc("now", { press: "a" }), overlay: nowPop }),
        note: "浮层宽 92vw、最高 420px，<b>没有标题，也没有「打开」按钮</b>，得再点一次链接才能进入详情。浮层里嵌了一个 17px 正文的完整编辑器，滚动页面时浮层跟着重新定位。浮层是自己挂的 portal，<b>返回手势会直接退出页面</b>，而不是先关浮层。",
      }),
      frame({
        no: "T1",
        title: "单击 → 底部预览面板",
        tag: REC,
        html: phone({
          body: doc("l1", { press: "a" }),
          overlay: previewSheet({ head: CARD_HEAD, foot: FOOT_READ }),
        }),
        note: '点引用从底部升起 <b>SnapSheet</b>：头部是类型、标题、相对时间和字数，中间是正文预览（16px），底部是拇指够得着的<b>「打开卡片」</b>主按钮。上拉到全屏可以直接读完，下拉、点遮罩或返回手势都会关闭（SnapSheet 内置返回拦截）。与脉络浮层是同一套面板语言。<span class="pro">优</span> 原文保持可见，操作明确。<span class="con">缺</span> 想直接跳转时要多点一次「打开」。',
      }),
      frame({
        no: "T2",
        title: "单击直接打开，长按出菜单",
        html: phone({ body: doc("l1", { press: "a" }), overlay: longPress }),
        note: '和网页链接一样，单击直接 push 到详情页，长按弹出 ActionSheet（预览 / 打开 / 复制）。<span class="pro">优</span> 一步到达，最省事。<span class="con">缺</span> 失去「不离开当前页看一眼」的能力；长按在阅读态已经用于选字标注，两者会冲突；预览入口藏在长按里，很难被发现。',
      }),
      frame({
        no: "T3",
        title: "单击 → 锚点摘要卡（瘦身版现状）",
        html: phone({ body: doc("l1", { press: "a" }), overlay: peek }),
        note: '保留锚点浮层的形态，但只放标题、两行摘要和「打开」按钮，不再嵌编辑器；同时补上返回拦截。<span class="pro">优</span> 改动最小，轻量。<span class="con">缺</span> 锚点定位在小屏上很脆弱：引用在屏幕下半部分时卡片会翻到上方被手指挡住，滚动时还要跟随；也读不了全文。',
      }),
    ].join("");
  }

  // ── 3 编辑态 ──
  function sceneEdit() {
    const nowEdit =
      accDefault() +
      keyboard() +
      `<div class="pop now" style="top:182px;max-height:262px;overflow:hidden">
        <div class="pmeta">2026/10/21 14:03:22 · 862 字</div>
        <div class="pbody">${PREVIEW_BODY}</div>
      </div>${tap(194, 160)}${note(206, 140, "点到引用就弹预览")}`;

    const accLink = `<div class="acc">
        <span class="chip">${ic("layers")}<span>遗忘曲线</span></span>
        <span class="ab">${ic("eye")}预览</span>
        <span class="ab">${ic("swap")}更换</span>
        <span class="ab danger">${ic("unlink")}移除</span>
        <span class="ab push">${ic("kbDown")}</span>
      </div>`;

    const editSheet = `<div class="dim"></div>
      <div class="asheet">
        <div class="grp">
          <div class="hd">遗忘曲线 → 艾宾浩斯遗忘曲线</div>
          <div class="it">${ic("eye")}预览</div>
          <div class="it">${ic("open")}打开</div>
          <div class="it">${ic("swap")}更换引用</div>
          <div class="it">${ic("pencil")}修改显示文字</div>
          <div class="it danger">${ic("unlink")}移除引用（保留文字）</div>
        </div>
        <div class="grp"><div class="cancel">取消</div></div>
      </div>`;

    return [
      frame({
        no: "现状",
        title: "点一下就弹预览，光标进不去",
        tag: NOW,
        html: phone({ body: doc("now", { press: "a" }), topbar: "edit", overlay: nowEdit }),
        note: "引用节点是 <code>contentEditable=false</code>，<b>光标进不去</b>，显示文字改不了；点一下就弹出预览，打断输入。移除要先选中引用，再点配件栏里同一个「关联」按钮（隐藏的开关），也<b>没有「更换引用」</b>。",
      }),
      frame({
        no: "E1",
        title: "光标进入 → 配件栏切到「引用」模式",
        tag: REC,
        html: phone({
          body: doc("l1", { press: "a", caret: "a" }),
          topbar: "edit",
          overlay: accLink + keyboard(),
        }),
        note: '编辑态下引用文字可以直接编辑（和桌面一样），光标落进引用时，<b>配件栏切到引用上下文</b>：左端是带标题的上下文标签，后面是 预览 / 更换 / 移除。代码块、表格、媒体都是这套模式（<code>editingContext</code> + <code>ContextChip</code>），用户已经熟悉。<span class="pro">优</span> 不打断输入，键盘不收起。<span class="con">缺</span> 要新增一种 <code>link</code> 编辑上下文，改动最大。',
      }),
      frame({
        no: "E2",
        title: "点击 → ActionSheet",
        html: phone({ body: doc("l1", { press: "a" }), topbar: "edit", overlay: editSheet }),
        note: '编辑态点引用弹出操作菜单：预览 / 打开 / 更换 / 改文字 / 移除。<span class="pro">优</span> 所有操作一目了然，实现简单。<span class="con">缺</span> 键盘会收起，回到输入要重新聚焦；改文字需要再弹一个输入框。',
      }),
      frame({
        no: "E3",
        title: "与阅读态同一个预览面板 + 编辑操作",
        html: phone({
          body: doc("l1", { press: "a" }),
          topbar: "edit",
          overlay: previewSheet({ head: CARD_HEAD, foot: FOOT_EDIT }),
        }),
        note: '编辑态也打开 T1 的预览面板，底栏多出 <b>移除</b> 和 <b>更换</b> 两个按钮。<span class="pro">优</span> 一套心智、一份代码，只有阅读态 T1 时最省事。<span class="con">缺</span> 键盘收起；显示文字仍然改不了；想在引用旁边继续打字时会被面板打断。',
      }),
    ].join("");
  }

  // ── 4 状态 ──
  function sceneState() {
    const loading = previewSheet({
      head: sheetHead({
        title: "艾宾浩斯遗忘曲线",
        meta: "<span>卡片</span><span class='dot'>·</span><span>正在载入…</span>",
      }),
      body: '<div class="skel" style="width:92%"></div><div class="skel" style="width:80%"></div><div class="skel" style="width:86%"></div><div class="skel" style="width:60%"></div>',
      foot: FOOT_READ,
      tags: false,
      pull: false,
    });
    const broken = previewSheet({
      top: 520,
      head: sheetHead({
        tone: "tone-mute",
        icon: "unlink",
        title: "引用已失效",
        meta: "<span>引用的内容不存在或已被删除</span>",
      }),
      body: "",
      foot: `<div class="sh-foot"><span class="btn ghost" style="flex:1">${ic("swap")}重新选择</span><span class="btn ghost danger" style="flex:1">${ic("unlink")}移除引用</span></div>`,
      tags: false,
      pull: false,
    });
    const unshared = previewSheet({
      top: 560,
      head: sheetHead({
        tone: "tone-warn",
        icon: "lock",
        title: "艾宾浩斯遗忘曲线",
        meta: "<span>内容未共享，只保存在创建者本机</span>",
      }),
      body: "",
      foot: "",
      tags: false,
      pull: false,
    });
    return [
      frame({
        no: "S1",
        title: "载入中",
        html: phone({ body: doc("l1", { press: "a" }), overlay: loading }),
        note: "标题来自引用节点里存的 <code>contentTitle</code>，<b>面板一打开就有标题</b>，只有正文显示骨架。现在载入时连标题都没有。",
      }),
      frame({
        no: "S2",
        title: "已失效（内容被删）",
        html: phone({ body: doc("l1", { broken: "a" }), topbar: "edit", overlay: broken }),
        note: "行内显示为<b>灰色删除线</b>，打开后是一个矮面板，说明原因；编辑态提供「重新选择」和「移除引用」，阅读态只显示说明。现在只有一句「内容预览加载失败」。",
      }),
      frame({
        no: "S3",
        title: "协作者视角（未共享）",
        html: phone({ body: doc("l1", { press: "a" }), overlay: unshared }),
        note: "协作文档里，被引用的内容只在创建者本机。桌面已经直接给出提示，<b>不去查本机库</b>（同一个 ID 可能命中一条无关内容）；移动端照同样的规则处理。",
      }),
    ].join("");
  }

  // ── 5 选择器 ──
  function pickerSheet({ ctx = "", query = "", list }) {
    return `<div class="dim"></div>
      <div class="sheet" style="top:96px;bottom:0">
        <div class="handle"><i></i></div>
        <div class="pk-head">
          <div class="search">${ic("search")}${query ? `<span class="q">${query}</span><span class="caret" style="height:18px"></span>` : "搜索要引用的内容"}</div>
          <span class="cancel">取消</span>
        </div>
        ${ctx}
        <div style="flex:1;overflow:hidden">${list}</div>
      </div>${keyboard()}`;
  }
  const row = (kind, title, meta, on = false) => `
    <div class="pk-row${on ? " on" : ""}">${tile(kind)}
      <div style="min-width:0;flex:1"><div class="tt">${title}</div><div class="mm">${meta}</div></div>
    </div>`;
  const CTX = `<div class="pk-ctx">${ic("quote")}把 <b>「遗忘曲线」</b>链接到…</div>`;

  function scenePicker() {
    const nowList = `
      <div style="padding-top:8px">
        <div class="pk-old"><div class="tt">艾宾浩斯遗忘曲线</div><div class="mm">Card #128</div></div>
        <div class="pk-old"><div class="tt">遗忘曲线与间隔重复的关系</div><div class="mm">Card #311</div></div>
      </div>`;
    const recent = `
      <div class="pk-sec"><span>最近编辑</span></div>
      ${row("card", "艾宾浩斯遗忘曲线", "卡片 · 3 天前")}
      ${row("article", "主动回忆：检索练习的实验证据", "文章 · 上周")}
      ${row("project", "复习系统 · 间隔算法设计", "项目文档 · 10月12日")}
      ${row("card", "费曼技巧的四个步骤", "卡片 · 10月9日")}`;
    const mixed = `
      ${row("card", "艾宾浩斯<mark>遗忘曲线</mark>", "卡片 · 3 天前", true)}
      ${row("card", "<mark>遗忘曲线</mark>与间隔重复的关系", "卡片 · 上周")}
      ${row("article", "为什么我们记不住：<mark>遗忘曲线</mark>入门", "文章 · 9月30日")}
      ${row("project", "复习系统 · <mark>遗忘曲线</mark>参数", "项目文档 · 9月12日")}`;
    const grouped = `
      <div class="pk-sec"><span>卡片 · 6</span><a>全部</a></div>
      ${row("card", "艾宾浩斯<mark>遗忘曲线</mark>", "3 天前")}
      ${row("card", "<mark>遗忘曲线</mark>与间隔重复的关系", "上周")}
      <div class="pk-sec"><span>文章 · 1</span></div>
      ${row("article", "为什么我们记不住：<mark>遗忘曲线</mark>入门", "9月30日")}
      <div class="pk-sec"><span>项目文档 · 1</span></div>`;

    return [
      frame({
        no: "现状",
        title: "只能搜卡片，结果只显示编号",
        tag: NOW,
        html: phone({
          body: doc("l1", { plainA: true }),
          topbar: "picker",
          overlay: pickerSheet({ query: "遗忘曲线", list: nowList }),
        }),
        note: "空关键词时一片空白；只查卡片（<code>getCardsOverview</code>）；结果行副标题是 <b>「Card #128」</b>，没有类型和时间，看不出该选哪条。选中文字后打开时，也不提示这段文字会变成引用。",
      }),
      frame({
        no: "P1",
        title: "空关键词显示最近，结果混排带类型",
        tag: REC,
        html: phone({
          body: doc("l1", { plainA: true }),
          topbar: "picker",
          overlay: pickerSheet({ ctx: CTX, list: recent }),
        }),
        note: "打开时先列<b>最近编辑</b>（和卡片关联弹层一样），输入后改用 <code>searchAllContent</code>，同时搜卡片、文章和项目文档，每行带类型图标、类型名和相对时间。从选中文字进入时，顶部提示<b>「把『遗忘曲线』链接到…」</b>。",
      }),
      frame({
        no: "P1′",
        title: "P1 输入关键词后",
        html: phone({
          body: doc("l1", { plainA: true }),
          topbar: "picker",
          overlay: pickerSheet({ ctx: CTX, query: "遗忘曲线", list: mixed }),
        }),
        note: "命中的关键词用 accent 字色加粗标出，不加底色。结果按相关度排序，不按类型拆开，单手滑动一屏能看到 4–5 条。",
      }),
      frame({
        no: "P2",
        title: "结果按类型分组",
        html: phone({
          body: doc("l1", { plainA: true }),
          topbar: "picker",
          overlay: pickerSheet({ ctx: CTX, query: "遗忘曲线", list: grouped }),
        }),
        note: '按 卡片 / 文章 / 项目文档 分节，每节最多 3 条，「全部」展开。<span class="pro">优</span> 类型多时结构清楚。<span class="con">缺</span> 小节标题占地方，一屏能看到的结果更少；大多数人只引用卡片，分组的收益不大。',
      }),
    ].join("");
  }

  function render() {
    document.getElementById("style-frames").innerHTML = sceneStyle();
    document.getElementById("read-frames").innerHTML = sceneRead();
    document.getElementById("edit-frames").innerHTML = sceneEdit();
    document.getElementById("state-frames").innerHTML = sceneState();
    document.getElementById("picker-frames").innerHTML = scenePicker();
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab[data-tab]");
    const show = key => {
      tabs.forEach(tab => tab.classList.toggle("on", tab.dataset.tab === key));
      document.querySelectorAll(".scene").forEach(scene => {
        scene.classList.toggle("on", scene.dataset.scene === key);
      });
      localStorage.setItem("content-link-mock-tab", key);
    };
    tabs.forEach(tab => tab.addEventListener("click", () => show(tab.dataset.tab)));
    show(localStorage.getItem("content-link-mock-tab") || "issues");
  }

  function setupTheme() {
    const root = document.documentElement;
    const family = document.getElementById("theme-family");
    const mode = document.getElementById("theme-mode");
    const saved = JSON.parse(localStorage.getItem("content-link-mock-theme") || "{}");
    const apply = (theme, dark) => {
      root.dataset.theme = theme;
      root.dataset.mode = dark ? "dark" : "light";
      family.value = theme;
      mode.textContent = dark ? "深色" : "浅色";
      mode.classList.toggle("on", dark);
      localStorage.setItem("content-link-mock-theme", JSON.stringify({ theme, dark }));
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
