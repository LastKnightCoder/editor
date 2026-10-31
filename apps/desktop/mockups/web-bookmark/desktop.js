// 桌面端场景：样式对比、状态、插入、悬停与编辑
(function () {
  const frame = (no, cap, body, rec) =>
    `<div><div class="cap"><span class="no">${no}</span>${cap}${rec ? '<span class="rec">推荐</span>' : ""}</div>${body}</div>`;
  const doc = (inner, style = "") => `<div class="doc" style="${style}">${inner}</div>`;
  const before = `<p>上周在调研页面切换动画时，读到一份写得很清楚的文档，顺手记在这里：</p>`;
  const after = `<p class="muted">它和 <a class="lnk">FLIP 动画</a> 的思路不同，浏览器会替你截取前后两帧……</p>`;

  /* 1 卡片样式 */
  document.getElementById("style-grid").innerHTML = [
    frame(
      "A",
      "横向卡：文字在左，封面在右",
      doc(
        before +
          block(bookmark("mdn")) +
          block(bookmark("sspai")) +
          after +
          `<ul class="note"><li>标题一行、描述最多两行，底部是网站图标 + 网站名 + 网址。</li><li>没有封面时文字占满整宽，高度不变。</li><li>封面占卡宽 34%，最宽 220px，<code>object-fit: cover</code>。</li></ul>`
      ),
      true
    ),
    frame(
      "B",
      "封面卡：封面在上（1.91:1，og:image 的标准比例）",
      doc(
        before +
          block(bookmark("yt", "cover")) +
          after +
          `<ul class="note"><li>最宽 340px 靠左，适合单独推荐一个视频、一个站点。</li><li>页面没有 og:image 时按 A 显示，不留一块空封面。</li></ul>`
      )
    ),
    frame(
      "C",
      "紧凑行：一组参考资料",
      doc(
        `<p>参考资料：</p>` +
          block(bookmark("mdn", "compact")) +
          block(bookmark("gh", "compact")) +
          block(bookmark("sspai", "compact")) +
          `<ul class="note"><li>42px 一行，连续排列时间距 6px。</li><li>不显示描述和封面，但仍会抓取并保存，切回 A/B 时直接可用。</li></ul>`
      )
    ),
    frame(
      "A′",
      "A 在窄栏（如侧边预览、分栏）里的样子",
      doc(block(bookmark("gh")) + block(bookmark("bare")), "max-width:440px;padding-left:44px") +
        `<ul class="note"><li>卡宽小于 360px 时封面隐藏（容器查询），保证标题至少能显示十来个字。</li></ul>`
    ),
  ].join("");

  /* 2 状态 */
  const loading = `<div class="bm loading"><div class="txt">
      <div class="sk" style="height:14px;width:62%;margin:3px 0 6px"></div>
      <div class="sk" style="height:11px;width:92%"></div>
      <div class="sk" style="height:11px;width:70%;margin-top:4px"></div>
      <div class="src">${favicon(SITES.bare)}<span>developer.mozilla.org/zh-CN/docs/Web/API/View_Tr…</span></div>
    </div><div class="cover"></div></div>`;
  const failed = `<div class="bm"><div class="txt">
      <div class="ttl">developer.mozilla.org/zh-CN/docs/Web/API/View_Transition_API</div>
      <div class="desc" style="display:flex;gap:6px;align-items:center;color:var(--tau-ink-3)">${ic("wifiOff", 13)}没能读取网页信息<button class="retry">重试</button></div>
      <div class="src">${favicon(SITES.bare)}<span class="site">developer.mozilla.org</span></div>
    </div></div>`;
  const bare = `<div class="bm"><div class="txt">
      <div class="ttl">intranet.example.cn/wiki/oncall-handbook</div>
      <div class="src">${favicon(SITES.bare)}<span class="site">intranet.example.cn</span></div>
    </div></div>`;
  const noCover = bookmark("gh", "row", { noCover: true });
  document.getElementById("state-grid").innerHTML = [
    frame(
      "S1",
      "抓取中（插入后 0–3 秒）",
      doc(block(loading, "", false)) +
        `<ul class="note"><li>插入那一刻已经知道网址，先显示域名，骨架只占标题和描述的位置。</li><li>超时 8 秒转入 S2，期间可以继续打字，不阻塞编辑。</li></ul>`
    ),
    frame(
      "S2",
      "抓取失败",
      doc(block(failed)) +
        `<ul class="note"><li>网络问题、需要登录、被反爬拦截都落到这里。标题位置显示网址，卡片仍可点开。</li><li>「重试」只在编辑态出现，阅读态和发布的博客里只看到网址卡。</li><li>封面/图标抓到了但上传失败时，卡片照常显示（用原网站地址），⋯ 里可以重新读取。</li></ul>`
    ),
    frame(
      "S3",
      "页面没有标题以外的信息",
      doc(block(noCover) + block(bare)) +
        `<ul class="note"><li>没有封面：文字占满整宽。</li><li>连 &lt;title&gt; 都没有（内网、文件下载）：网址当标题，不显示错误。</li></ul>`
    ),
    frame(
      "S4",
      "选中（点左侧手柄或方向键移入）",
      doc(before + block(bookmark("mdn"), "selected", false) + after) +
        `<ul class="note"><li>与图片、视频块同样的 accent 描边 + focus ring；Backspace 删除，Enter 在下方新建段落。</li></ul>`
    ),
  ].join("");

  /* 3 插入方式 */
  const pasteMenu = `<div style="position:relative">
      <p>developer.mozilla.org/zh-CN/docs/Web/API/View_Transition_API<span class="caret"></span></p>
      <div class="pop" style="left:0;top:34px;width:220px">
        <div class="hd">粘贴为</div>
        <button class="it on">${ic("link", 14)}链接<span class="k kbd">↵</span></button>
        <button class="it">${ic("bookmark", 14)}网页书签</button>
        <button class="it">${ic("globe", 14)}嵌入网页</button>
        <button class="it">${ic("text", 14)}纯文本<span class="k kbd">Esc</span></button>
      </div>
    </div><div style="height:140px"></div>`;
  const slash = `<div style="position:relative">
      <p>/书签<span class="caret"></span></p>
      <div class="pop" style="left:0;top:34px;width:260px">
        <div class="hd">媒体与嵌入</div>
        <button class="it on">${ic("bookmark", 14)}网页书签<span class="k" style="color:var(--tau-ink-3);font-size:11.5px">bookmark</span></button>
        <button class="it">${ic("globe", 14)}嵌入网页</button>
      </div>
    </div><div style="height:96px"></div>
    <div style="position:relative">
      <div class="pop url-input" style="position:relative">
        ${ic("link", 15)}<input value="https://sspai.com/post/88213" /><button class="btn">添加书签</button>
      </div>
    </div>`;
  document.getElementById("insert-grid").innerHTML = [
    frame(
      "I1",
      "空段落粘贴单个网址",
      doc(pasteMenu) +
        `<ul class="note"><li>菜单停在网址下方，默认高亮「链接」，<span class="kbd">↵</span> 直接确认，和今天的行为一样。</li><li>选「网页书签」后这一段被替换成 S1 抓取中的卡片。</li><li>只在<b>空段落</b>且<b>剪贴板恰好是一个网址</b>时出现；行内粘贴不弹菜单，直接成链接。</li></ul>`,
      true
    ),
    frame(
      "I2",
      "斜杠菜单 → 输入网址",
      doc(slash) +
        `<ul class="note"><li>选中后原地出现网址输入框，回车或「添加书签」插入；Esc 取消并删掉 <code>/书签</code>。</li><li>输入框的地址校验复用链接扩展：像域名的补 <code>https://</code>。</li></ul>`
    ),
    frame(
      "I3",
      "行内链接 ↔ 书签互转",
      doc(
        `<div style="position:relative"><p>推荐阅读 <a class="lnk" style="text-decoration-style:solid">卡片笔记写作法实践</a> 这篇。</p>
        <div class="pop" style="position:relative;display:inline-flex;gap:2px;margin-top:4px;padding:3px">
          <button class="it" style="width:auto">${ic("external", 14)}打开</button>
          <button class="it" style="width:auto">${ic("copy", 14)}复制</button>
          <button class="it" style="width:auto">${ic("pencil", 14)}编辑</button>
          <button class="it on" style="width:auto">${ic("bookmark", 14)}转为书签</button>
        </div></div>`
      ) +
        `<ul class="note"><li>链接浮层多一个「转为书签」：段落里只有这一个链接时整段替换，否则在段落下方插入书签。</li><li>书签「⋯」里对应有「转为链接」。这一项可以后做。</li></ul>`
    ),
  ].join("");

  /* 4 悬停与编辑 */
  const more = `<div class="pop" style="right:8px;top:42px;width:200px">
      <button class="it">${ic("refresh", 14)}重新读取网页信息</button>
      <div class="hd" style="padding-top:8px">外观</div>
      <button class="it on">${ic("rows", 14)}横向卡<span class="k">${ic("check", 14)}</span></button>
      <button class="it">${ic("layout", 14)}封面卡</button>
      <button class="it">${ic("minus", 14)}紧凑</button>
      <div class="sep" style="height:1px;background:var(--tau-line-1);margin:4px 2px"></div>
      <button class="it">${ic("link", 14)}转为链接</button>
      <button class="it">${ic("globe", 14)}转为嵌入网页</button>
      <button class="it" style="color:var(--tau-danger)">${ic("trash", 14)}删除</button>
    </div>`;
  const editPanel = `<div class="pop edit-panel" style="right:8px;top:42px">
      <label>网址</label><input class="field" value="https://sspai.com/post/88213" />
      <label>标题</label><input class="field" value="卡片笔记写作法实践：三个月把零散想法变成长文" />
      <label>描述</label><input class="field multi" value="从闪念笔记到永久笔记，再到一篇完整的文章……" />
      <label>封面</label>
      <div class="seg-row"><button class="chip on">网页封面</button><button class="chip">上传图片</button><button class="chip">不显示</button></div>
      <div class="row"><button class="retry" style="font-size:12px">${"恢复为网页信息"}</button><span style="display:flex;gap:6px"><button class="btn ghost">取消</button><button class="btn">完成</button></span></div>
    </div>`;
  document.getElementById("ops-grid").innerHTML = [
    frame(
      "O1",
      "悬停：右上角操作条",
      doc(before + block(bookmark("mdn"), "show-ui") + after) +
        `<ul class="note"><li>打开 · 复制链接 · 编辑 · ⋯，与图片/代码块的操作条同一套样式。</li><li>悬停时卡片底色变 <code>surface-hover</code>，鼠标是手型；完整网址在卡片底部那一行已经能看到。</li></ul>`
    ),
    frame(
      "O2",
      "⋯ 菜单",
      doc(
        block(bookmark("mdn"), "show-ui") +
          `<div style="height:250px;position:relative">${""}</div>`
      ).replace('<div class="ops">', `${more}<div class="ops">`) +
        `<ul class="note"><li>「重新读取」用于网站改版或第一次抓取失败。</li><li>外观三选一存在节点上（<code>appearance</code>），不做全局设置；切换只改外观，不重新抓取。</li></ul>`
    ),
    frame(
      "O3",
      "编辑面板",
      doc(block(bookmark("sspai"), "show-ui") + `<div style="height:300px"></div>`).replace(
        '<div class="ops">',
        `${editPanel}<div class="ops">`
      ) +
        `<ul class="note"><li>改过的字段记在 <code>overrides</code> 里，「重新读取」只更新没改过的字段。</li><li>上传的封面走 <code>IResourceService.upload</code>，跟随「资源存储」设置：本地就存本地，选了上传插件就上传。</li></ul>`
    ),
  ].join("");
})();
