// 独立查询数据库页：各状态由同一组片段拼出
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function hlLine(line) {
  let s = esc(line);
  s = s.replace(/"([^"]*)"/g, '<span class="tk-str">"$1"</span>');
  s = s.replace(
    /\b(TABLE|FROM|WHERE|SORT|GROUP BY|LIMIT|AS|TYPE|AND|OR|DESC|ASC)\b/g,
    '<span class="tk-kw">$1</span>'
  );
  s = s.replace(
    /\b(hasTag|round|today|contains|toDate|count)\(/g,
    '<span class="tk-fn">$1</span>('
  );
  s = s.replace(/(?<![\w#])(\d+)(?![\w"])/g, '<span class="tk-num">$1</span>');
  s = s.replace(/params\.(\w+)/g, '<span class="tk-p">params.$1</span>');
  return s;
}

function codeBlock(lines, o = {}) {
  const ln = lines
    .map((_, i) => `<div${o.errLine === i ? ' class="bad"' : ""}>${i + 1}</div>`)
    .join("");
  const body = lines
    .map((l, i) => {
      let h = hlLine(l);
      if (o.errLine === i && o.squig)
        h = h.replace(o.squig, `<span class="squig">${o.squig}</span>`);
      if (o.caretLine === i) h += '<span class="caret"></span>';
      const cls = o.errLine === i ? "hl-err" : (o.newLines || []).includes(i) ? "hl-new" : "";
      return `<span class="row ${cls}">${h || " "}</span>`;
    })
    .join("");
  return `<div class="code ${o.ro ? "ro" : ""}"><div class="ln">${ln}</div><pre>${body}</pre>${o.extra || ""}</div>`;
}

function statusPill(kind) {
  const map = {
    live: ["", "实时 · 12 条 · 刚刚更新"],
    run: ["run", "正在查询…"],
    rerun: ["run", "源数据有变化，正在更新"],
    err: ["err", "查询出错 · 显示 3 分钟前的结果"],
    err0: ["err", "查询出错"],
    empty: ["", "实时 · 0 条"],
    unsaved: ["unsaved", "查询未保存"],
    ai: ["run", "AI 正在编写查询"],
  };
  const [c, t] = map[kind] || map.live;
  return `<button class="status ${c}" title="立即刷新（⌘R）"><span class="dot"></span>${t}<span class="rf">${ic("refresh")}</span></button>`;
}

function header(o) {
  return `<div class="hd">
    <span class="crumb">${ic("db", "s")}数据库 ${ic("chevr", "xs")}</span>
    <span class="title">${o.title || "读书卡片 · 近 30 天"}</span>
    <span class="sp"></span>
    ${statusPill(o.status)}
    <button class="qbtn ${o.srcOpen ? "on" : ""}">${ic("code", "s")}查询${o.badge ? '<span class="badge"></span>' : ""}</button>
    <button class="icon-btn">${ic("more")}</button>
  </div>`;
}

function paramChips(edit) {
  return `<span class="lbl">参数</span>
    <span class="param ${edit ? "edit" : ""}"><span class="k">tag</span><span class="v">${edit ? "心理" : "读书"}</span></span>
    <button class="addp">${ic("plus", "xs")}参数</button>`;
}

function aiRow(o) {
  if (o.ai === "busy")
    return `<div class="ai busy">${ic("spark")}<span class="val">加一列阅读分钟，只看最近 30 天</span><span class="prog"><i></i>正在编写</span><button class="btn sm">${ic("stop", "s")}停止</button></div>`;
  if (o.ai === "done")
    return `<div class="ai done">${ic("check")}<span class="val">已改写 2 行：新增「阅读分钟」列，条件改为最近 30 天</span><button class="btn sm">${ic("undo", "s")}撤销</button><button class="icon-btn">${ic("x", "s")}</button></div>`;
  if (o.ai === "conflict")
    return `<div class="ai conflict">${ic("warn")}<span class="val">生成期间你改过查询，AI 的版本没有覆盖它</span><button class="btn sm line">对比</button><button class="btn sm soft">用 AI 的版本</button><button class="btn sm">丢弃</button></div>`;
  if (o.ai === "typing")
    return `<div class="ai">${ic("spark")}<span class="val">加一列阅读分钟，只看最近 30 天<span class="caret"></span></span><span class="kbd">↵</span></div>`;
  if (o.ai === "fix")
    return `<div class="ai">${ic("spark")}<span class="ph">描述想看什么，或让 AI 修复上面的错误</span><button class="btn sm soft">${ic("spark", "s")}让 AI 修复</button></div>`;
  return `<div class="ai">${ic("spark")}<span class="ph">描述想看什么，AI 帮你写查询。比如「按标签分组统计字数」</span><span class="kbd">⌘ J</span></div>`;
}

function sourcePanel(o) {
  const lines = o.code || CODE_DSL;
  let extra = "";
  if (o.ac)
    extra = `<div class="ac" style="left:226px;top:30px">
      <div class="it hl">${ic("tag")}<code>tags</code><span>标签 · 多选</span></div>
      <div class="it">${ic("text")}<code>title</code><span>标题 · 文本</span></div>
      <div class="it">${ic("link")}<code>source</code><span>来源 · 链接</span></div>
      <div class="it">${ic("braces")}<code>toText()</code><span>函数</span></div>
      <div class="ft"><span>↑↓ 选择</span><span>↵ 插入</span><span>cards 的字段</span></div></div>`;
  return `<div class="src">
    <div class="src-h">
      <button class="lang">${o.js ? "JavaScript" : "查询语言"}${ic("chev", "xs")}</button>
      <span class="div"></span>
      ${paramChips(o.paramEdit)}
      <span class="sp"></span>
      <button class="btn sm">字段参考</button>
      <button class="icon-btn" title="收起">${ic("chev", "s")}</button>
    </div>
    ${codeBlock(lines, { ...o.codeOpt, extra })}
    ${o.problem ? `<div class="problem ${o.problem.warn ? "warn" : ""}">${ic(o.problem.warn ? "warn" : "alert", "s")}<span class="pos">${o.problem.pos}</span><span class="msg">${o.problem.msg}</span><span class="sp"></span>${o.problem.act || ""}</div>` : ""}
    ${o.readonly ? "" : aiRow(o)}
  </div>`;
}

function viewBar(o) {
  return `<div class="vbar">
    <div class="vtabs">
      <span class="vt on">${ic("table")}全部</span>
      <span class="vt">${ic("board")}按标签</span>
      <span class="vt">${ic("gallery")}卡片墙</span>
      <span class="vadd">${ic("plus", "s")}</span>
    </div>
    <div class="tools">
      <button class="tool">${ic("search")}</button>
      <button class="tool ${o.chips ? "on" : ""}">${ic("filter")}${o.chips ? '<span class="cnt">1</span>' : ""}</button>
      <button class="tool on">${ic("sort")}<span class="cnt">1</span></button>
      <button class="tool">${ic("group")}</button>
      <button class="tool">${ic("eye")}</button>
    </div>
  </div>
  ${o.chips ? `<div class="chips">${o.chips}</div>` : ""}`;
}

const COLS = [
  { n: "卡片", ic: "link", w: "" },
  { n: "标签", ic: "tag", w: "200px" },
  { n: "字数", ic: "num", w: "96px", num: 1 },
  { n: "更新时间", ic: "date", w: "128px" },
];
function table(o) {
  const cols = o.cols || COLS;
  const rows = o.rows ?? ROWS;
  const head = `<tr><th class="idx"></th>${cols.map(c => `<th class="${c.num ? "num" : ""} ${c.gone ? "gone" : ""}" style="${c.w ? `width:${c.w}` : ""}"><span class="h">${ic(c.gone ? "warn" : c.ic)}${c.n}</span></th>`).join("")}</tr>`;
  const body = rows
    .map((r, i) => {
      const sel = o.selCell && i === 1;
      const cells = [
        `<td${sel ? ' class="cell-sel"' : ""}><span class="ent">${ic("card")}<span>${r[0]}</span><span class="go">${ic("out", "xs")}</span></span></td>`,
        `<td>${r[1].map(t => `<span class="tg" style="--c:${TAG_C[t]}">${t}</span>`).join("")}</td>`,
        `<td class="num">${r[2].toLocaleString()}</td>`,
      ];
      if (o.extraCol) cells.push(`<td class="num new">${Math.round(r[2] / 400) || 1}</td>`);
      cells.push(`<td class="dt">${r[3]}</td>`);
      return `<tr><td class="idx">${i + 1}</td>${cells.join("")}</tr>`;
    })
    .join("");
  return `<table class="tbl ${o.stale ? "stale" : ""}"><colgroup></colgroup>${head}${body}</table>`;
}

function resultArea(o) {
  if (o.firstLoad)
    return `<div class="tbl-wrap">${table({ ...o, rows: [] })}<div class="loading-rows"><i></i>正在读取卡片…</div></div>`;
  if (o.empty)
    return `<div class="tbl-wrap">${table({ ...o, rows: [] })}
    <div class="empty"><b>没有符合条件的卡片</b>
    <span>条件：带「${o.emptyTag || "读书"}」标签、字数大于 200。卡片有变化时这里会自动出现。</span>
    <div class="acts"><button class="btn line sm">${ic("code", "s")}调整查询</button><button class="btn line sm">${ic("spark", "s")}让 AI 放宽条件</button></div></div></div>`;
  return `<div class="tbl-wrap">${o.progress ? '<div class="prog-line"></div>' : ""}${table(o)}
    <div class="foot"><span>${o.footText || "12 条"}</span><span class="sp"></span><span>${ic("lock", "xs")} 结果只读，点卡片名打开原文编辑</span></div>
    ${o.tip || ""}</div>`;
}

function sidebar() {
  return `<aside class="side"><div class="brand">Tau</div>
    <div class="nav">${ic("home")}首页</div><div class="nav">${ic("card")}卡片</div><div class="nav">${ic("article")}文章</div>
    <div class="nav">${ic("project")}项目</div><div class="nav on">${ic("db")}数据库</div>
    <div class="nav sub">读书卡片 · 近 30 天</div><div class="nav sub">本周待办</div><div class="nav sub">支出明细</div>
    <div class="nav">${ic("todo")}待办</div><div class="nav">${ic("event")}日程</div><div class="nav">${ic("diary")}日记</div></aside>`;
}

function page(o) {
  return `<div class="app">${sidebar()}<main class="paper">
    ${header(o)}
    ${o.srcOpen ? sourcePanel(o) : ""}
    ${o.notice || ""}
    ${viewBar(o)}
    ${resultArea(o)}
    ${o.overlay || ""}
  </main></div>`;
}

const notice = (kind, icon, main, sub, acts) =>
  `<div class="notice ${kind}">${ic(icon)}<span>${main}${sub ? ` <span class="sub">${sub}</span>` : ""}</span><span class="sp"></span>${acts || ""}</div>`;

const PAGE_STATES = {
  browse: {
    label: "浏览",
    cap: "<b>默认浏览</b>：打开数据库只看结果。顶栏右侧一枚状态胶囊合并「实时 / 条数 / 更新时间 / 刷新」，点它就刷新；查询源码收在「查询」按钮后面，不占首屏。视图栏、筛选排序沿用普通数据库的书签式工具栏，用户不用学第二套。",
    o: { status: "live" },
  },
  edit: {
    label: "编辑查询",
    cap: "<b>展开查询</b>：源码面板贴在标题下，与纸同色、细描边。顶行是语言切换与参数胶囊（替代原来的 JSON 文本框），底行是常驻的 AI 输入。改动停顿 600ms 自动保存并重跑，没有「运行」「保存」按钮；结果表就在下面实时变。",
    o: { status: "live", srcOpen: true },
  },
  param: {
    label: "改参数",
    cap: "<b>参数就地改</b>：<code>params.tag</code> 显示成「tag ｜ 读书」胶囊，点值即改，回车生效。查询里引用到的参数自动出现；「+ 参数」新增一个。用户不再需要写 JSON。",
    o: { status: "rerun", srcOpen: true, paramEdit: true, progress: true },
  },
  complete: {
    label: "补全",
    cap: "<b>输入补全</b>：在字段位置给出当前来源（cards）的字段，带中文名与类型；函数位置给函数。「字段参考」打开同一份目录的完整列表。",
    o: { status: "live", srcOpen: true, ac: true, codeOpt: { caretLine: 0 } },
  },
  firstLoad: {
    label: "首次加载",
    cap: "<b>首次加载</b>：列头先出（列定义在执行前就能推出），表体一行说明在读什么。不画骨架假行。",
    o: { status: "run", firstLoad: true },
  },
  rerun: {
    label: "后台重算",
    cap: "<b>源数据变化后重算</b>：旧结果原样保留可继续看、可点开，表头上方一条 2px 进度线；胶囊写「源数据有变化，正在更新」。完成后行原位替换，滚动位置与选择不丢。",
    o: { status: "rerun", progress: true },
  },
  empty: {
    label: "空结果",
    cap: "<b>空结果</b>：列头保留，说明用人话复述条件（从 WHERE 推出），给「调整查询」与「让 AI 放宽条件」两个去处。",
    o: { status: "empty", empty: true },
  },
  syntax: {
    label: "语法错误",
    cap: "<b>查询写错</b>：出错位置波浪线 + 行号变红，面板底部一条问题说明带行列号和建议；AI 行变成「让 AI 修复」。下面的结果保持上次成功的样子但降为淡墨，胶囊写明「显示 3 分钟前的结果」。「查询」按钮带红点，收起后也看得出有问题。",
    o: {
      status: "err",
      srcOpen: true,
      badge: true,
      stale: true,
      code: CODE_BAD,
      ai: "fix",
      codeOpt: { errLine: 0, squig: "tagz" },
      problem: {
        pos: "第 1 行 · 第 25 列",
        msg: "cards 没有字段 tagz，是不是想写 tags？",
        act: '<button class="btn sm line">改成 tags</button>',
      },
    },
  },
  runtime: {
    label: "运行失败",
    cap: "<b>运行时失败</b>（超时、结果超过 20,000 行、读取超预算）：源码收起时，标题下一条常驻提示讲清原因和出路；结果保持上次成功的版本并变淡。",
    o: {
      status: "err",
      badge: true,
      stale: true,
      notice: notice(
        "err",
        "alert",
        "查询结果超过 20,000 行，没有更新。",
        "加 WHERE 或 LIMIT 缩小范围后会自动重跑。",
        '<button class="btn sm line">打开查询</button><button class="btn sm">重试</button>'
      ),
    },
  },
  aiTyping: {
    label: "AI 输入",
    cap: "<b>让 AI 写</b>：在源码底行直接描述，回车提交；⌘J 从任何位置聚焦到这里。",
    o: { status: "live", srcOpen: true, ai: "typing" },
  },
  aiBusy: {
    label: "AI 编写中",
    cap: "<b>AI 编写中</b>：底行显示刚才的需求和进度，可停止。源码仍可编辑——用户改了就不覆盖（见「AI 冲突」）。",
    o: { status: "ai", srcOpen: true, ai: "busy" },
  },
  aiDone: {
    label: "AI 完成",
    cap: "<b>AI 写完直接生效</b>：不经过「预览 → 应用」。改动的行在源码里淡绿高亮，新出现的列在结果里淡绿高亮，几秒后褪去；底行给「撤销」一步回到原查询。",
    o: {
      status: "live",
      srcOpen: true,
      ai: "done",
      code: CODE_AI,
      codeOpt: { newLines: [1, 4] },
      extraCol: true,
      cols: [COLS[0], COLS[1], COLS[2], { n: "阅读分钟", ic: "num", w: "96px", num: 1 }, COLS[3]],
      footText: "9 条",
      rows: ROWS.slice(0, 9),
    },
  },
  aiConflict: {
    label: "AI 冲突",
    cap: "<b>生成期间用户改过查询</b>：保留用户的版本，AI 结果放在底行等决定——对比、采用或丢弃。",
    o: { status: "live", srcOpen: true, ai: "conflict" },
  },
  schema: {
    label: "字段变化",
    cap: "<b>查询改了列，视图引用失效</b>：失效的筛选/排序 chip 变成黄底删除线，提示条一键清理。原来的「已检查」按钮去掉——清理掉失效项提示就自然消失。",
    o: {
      status: "live",
      chips:
        '<span class="chip">标签 <b>包含 心理学</b><span class="x">' +
        ic("x", "xs") +
        '</span></span><span class="chip dead">已删除的列 <b>阅读状态 = 在读</b><span class="x">' +
        ic("x", "xs") +
        "</span></span>",
      notice: notice(
        "warn",
        "warn",
        "查询里已没有「阅读状态」列，1 个筛选条件不再生效。",
        "",
        '<button class="btn sm line">移除失效条件</button>'
      ),
    },
  },
  saveFail: {
    label: "保存失败",
    cap: "<b>查询保存失败</b>（数据库被占用、另一处改过）：胶囊变黄写「查询未保存」，提示条区分两种出路：重试保存，或丢弃本地改动读取已保存的版本。查询照常按本地版本运行。",
    o: {
      status: "unsaved",
      srcOpen: true,
      notice: notice(
        "warn",
        "warn",
        "查询改动还没保存。",
        "另一个窗口在 2 分钟前修改过这个数据库。",
        '<button class="btn sm line">重试保存</button><button class="btn sm">读取已保存的版本</button>'
      ),
    },
  },
  readonly: {
    label: "点只读单元格",
    cap: "<b>结果是只读的</b>：双击或打字时不进编辑态，而是在单元格旁浮出说明，给出「打开卡片」直达原文。卡片名常态就是链接（悬停下划线 + ↗）。",
    o: {
      status: "live",
      selCell: true,
      tip: `<div class="ro-tip" style="left:120px;top:112px"><b>${ic("lock", "s")}查询结果不能直接改</b>要改这张卡片的标题，请在原文里编辑，改完这里会自动更新。<div class="acts"><button class="btn sm soft">${ic("out", "s")}打开卡片</button><button class="btn sm">知道了</button></div></div>`,
    },
  },
};
