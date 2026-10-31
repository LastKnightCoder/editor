// 移动端场景：阅读态、编辑态选中、粘贴转换、编辑面板、失败
(function () {
  const mcard = (key, cls = "", extra = "") => {
    const s = SITES[key];
    const thumb = s.cover ? `<div class="thumb" style="background:${s.cover}"></div>` : "";
    const title = s.title || s.host + s.path;
    const desc = s.desc ? `<div class="desc">${esc(s.desc)}</div>` : "";
    return `<div class="mbm ${cls}"><div class="txt"><div class="ttl">${esc(title)}</div>${desc}<div class="src">${favicon(s, 14)}<span>${esc(s.site || s.host)}</span></div></div>${thumb}${extra}</div>`;
  };
  const phone = (nav, body, overlay = "") =>
    `<div class="phone"><div class="status"><span>9:41</span><span>●●● ▮</span></div>${nav}<div class="body">${body}</div>${overlay}<div class="home"></div></div>`;
  const navRead = `<div class="nav"><span class="ib">${ic("back", 20)}</span><span class="t"></span><span class="ib">${ic("more", 20)}</span></div>`;
  const navEdit = `<div class="nav"><span class="ib">${ic("back", 20)}</span><span class="t">编辑中</span><span class="ib" style="color:var(--tau-accent-text);font-size:15px;width:auto;padding:0 10px">完成</span></div>`;
  const head = `<h2>页面切换动画调研</h2><div class="meta">卡片 · 10 月 28 日</div><p>上周在调研页面切换动画时，读到一份写得很清楚的文档：</p>`;
  const tail = `<p>它和 FLIP 动画的思路不同，浏览器会替你截取前后两帧。</p><p>另一篇是关于卡片笔记的实践记录：</p>`;
  const wrap = (no, cap, body, rec) =>
    `<div class="phone-wrap"><div class="cap"><span class="no">${no}</span>${cap}${rec ? '<span class="rec">推荐</span>' : ""}</div>${body}</div>`;

  const sheetHead = s =>
    `<div class="head">${favicon(s, 22)}<div style="min-width:0"><div class="t">${esc(s.title)}</div><div class="u">${esc(s.host + s.path)}</div></div></div>`;

  const actionSheet = `<div class="scrim"></div><div class="sheet"><div class="handle"></div>${sheetHead(SITES.mdn)}
      <div class="quick"><button>${ic("external", 20)}打开</button><button>${ic("copy", 20)}复制链接</button><button>${ic("pencil", 20)}编辑</button></div>
      <button class="row">${ic("refresh", 18)}重新读取网页信息</button>
      <button class="row">${ic("link", 18)}转为链接</button>
      <button class="row danger">${ic("trash", 18)}删除</button></div>`;

  const editSheet = `<div class="scrim"></div><div class="sheet" style="padding-bottom:300px"><div class="handle"></div>
      <div style="font-size:15px;font-weight:600;padding:0 4px 6px;display:flex;justify-content:space-between"><span style="color:var(--tau-ink-2);font-weight:400">取消</span>编辑书签<span style="color:var(--tau-accent-text)">完成</span></div>
      <div style="font-size:12px;color:var(--tau-ink-3);padding:0 4px">标题</div>
      <input class="field" value="View Transition API - Web API | MDN" />
      <div style="font-size:12px;color:var(--tau-ink-3);padding:0 4px">描述</div>
      <input class="field" value="View Transition API 提供了一种机制……" style="margin-bottom:4px" />
    </div><div class="kb" style="z-index:7"><div class="keys">${"<span></span>".repeat(30)}</div></div>`;

  const pasteKb = `<div class="acc"><button class="chip on">${ic("bookmark", 14)}转为书签</button><button class="chip">${ic("globe", 14)}嵌入</button><span style="margin-left:auto;color:var(--tau-ink-3)">${ic("keyboard", 18)}</span></div><div class="kb"><div class="keys">${"<span></span>".repeat(30)}</div></div>`;

  const ripple = `<span class="ripple" style="left:120px;top:30px"></span>`;
  const failedCard = `<div class="mbm"><div class="txt"><div class="ttl">developer.mozilla.org/zh-CN/docs/Web/API/View_Transition_API</div><div class="desc" style="display:flex;gap:6px;align-items:center;color:var(--tau-ink-3)">${ic("wifiOff", 12)}没能读取网页信息 · <span style="color:var(--tau-accent-text)">重试</span></div><div class="src">${favicon(SITES.bare, 14)}<span>developer.mozilla.org</span></div></div></div>`;
  const loadingCard = `<div class="mbm"><div class="txt"><div class="sk" style="height:14px;width:80%;margin:2px 0 6px"></div><div class="sk" style="height:11px;width:60%"></div><div class="src">${favicon(SITES.bare, 14)}<span>sspai.com</span></div></div><div class="thumb sk"></div></div>`;

  document.getElementById("mobile-phones").innerHTML = [
    wrap(
      "M1",
      "阅读态：点一下直接用系统浏览器打开",
      phone(navRead, head + mcard("mdn", "pressed", ripple) + tail + mcard("sspai")),
      true
    ),
    wrap(
      "M2",
      "编辑态：点一下选中 + 底部操作面板",
      phone(navEdit, head + mcard("mdn", "selected") + tail, actionSheet),
      true
    ),
    wrap(
      "M3",
      "空段落粘贴网址：先成链接，配件栏给「转为书签」（行内粘贴不出现）",
      phone(
        navEdit,
        `<h2>页面切换动画调研</h2><p>另一篇是关于卡片笔记的实践记录：</p><p><span style="color:var(--tau-accent-text);text-decoration:underline;text-underline-offset:3px">https://sspai.com/post/88213</span><span class="caret"></span></p>`,
        pasteKb
      )
    ),
    wrap(
      "M4",
      "编辑书签：标题和描述可改",
      phone(navEdit, head + mcard("mdn", "selected"), editSheet)
    ),
    wrap(
      "M5",
      "抓取中 / 失败",
      phone(
        navEdit,
        head +
          loadingCard +
          `<p>离线时插入的书签：</p>` +
          failedCard +
          `<p>没有封面的页面：</p>` +
          mcard("gh")
      )
    ),
  ].join("");
})();
