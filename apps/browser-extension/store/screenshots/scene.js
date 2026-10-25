/**
 * 截图场景的共用部分，须在 icons.js 之前引入：
 * - <div class="browser" data-host data-path data-title data-favicon data-site-icon> 生成浏览器标签栏与地址栏；
 * - <div class="page" data-article data-scroll="像素"> 填入示例网页（一篇虚构博客文章），可按滚动位置上移。
 *   页面在引入本脚本前设置 window.MARKS = { 标记名: "yellow" | "selected" | "flash" ... }，
 *   对应的 <mark data-mark> 渲染成高亮、选区或引用闪烁；未设置的标记保持原文；
 * - 带 data-anchor="标记名" 的浮层（选区工具条等）定位到该标记首行的上方，与真实工具条的摆放规则一致。
 */
for (const browser of document.querySelectorAll(".browser[data-host]")) {
  const { host, path = "", title, favicon = "慢", siteIcon = "lock" } = browser.dataset;
  const chrome = document.createElement("div");
  chrome.className = "chrome";
  chrome.innerHTML = `
    <div class="tabs">
      <div class="lights"><span></span><span></span><span></span></div>
      <div class="tab"><span class="favicon">${favicon}</span>${title}</div>
      <div class="tab idle">新标签页</div>
    </div>
    <div class="toolbar">
      <i data-icon="chevron-left" data-size="17"></i>
      <i data-icon="chevron-right" data-size="17"></i>
      <i data-icon="rotate-cw" data-size="15"></i>
      <div class="address"><i data-icon="${siteIcon}" data-size="12"></i><b>${host}</b>${path}</div>
      <span class="ext-button" title="Tau 伴读">τ</span>
      <i data-icon="puzzle" data-size="15"></i>
    </div>`;
  browser.prepend(chrome);
}

const ARTICLE = `
<header class="site-header">
  <span class="brand">慢读笔记</span>
  <span>文章</span><span>专题</span><span>关于</span>
</header>
<article class="article">
  <div class="kicker">学习方法 · 长文</div>
  <h2>为什么写下来的想法，更容易被记住</h2>
  <div class="meta">林知远 · 2026 年 9 月 12 日 · 阅读约 8 分钟</div>
  <p data-block="1">我们常常以为，读懂了就是记住了。可是合上书一周后，<mark data-mark="m1">真正还能复述出来的内容往往不到两成</mark>。理解与记忆是两件事：理解发生在阅读的当下，记忆却需要在之后被一次次唤起。</p>
  <p data-block="2">心理学里有一个被反复验证的现象，叫作「生成效应」：<mark data-mark="m2">自己组织语言写下的内容，比单纯阅读过的内容记得更牢</mark>。原因并不神秘——写的时候，你必须把模糊的感觉变成明确的句子，这个过程本身就是一次深度加工。</p>
  <h3>写，是一次主动的提取</h3>
  <p data-block="3">很多人做笔记的方式是摘抄，把原文原样搬过来。摘抄当然有用，它帮你留住出处；但<mark data-mark="m3">只有当你用自己的话重新解释一遍，知识才真正和你已有的经验连在一起</mark>。不妨在每段摘录旁边，补上一句「这让我想到……」。</p>
  <p data-block="4"><mark data-mark="m4">间隔一段时间再回看笔记，效果比集中复习好得多。</mark>每一次回看都是一次提取练习，大脑会把这段内容标记为「仍然需要」，于是遗忘曲线被一点点拉平。</p>
  <p data-block="5">所以，下次读到打动你的段落，别急着划过去。停下来，标一笔，写一句。<mark data-mark="m5">留下痕迹的阅读，才会在未来某一天重新被你找到。</mark></p>
</article>`;

const page = document.querySelector(".page[data-article]");
if (page) {
  page.innerHTML = ARTICLE;
  page.style.marginTop = `-${page.dataset.scroll ?? 0}px`;
  const marks = window.MARKS ?? {};
  for (const mark of page.querySelectorAll("mark[data-mark]")) {
    const kind = marks[mark.dataset.mark];
    const span = document.createElement("span");
    span.innerHTML = mark.innerHTML;
    if (kind === "selected" || kind === "flash") span.className = kind;
    else if (kind) span.className = `hl ${kind}`;
    if (kind) span.id = mark.dataset.mark;
    mark.replaceWith(span);
  }
}

const TOOLBAR_GAP = 8;
/** 等图标替换与字体就绪后再量尺寸（icons.js 在本脚本之后运行） */
function placeAnchored() {
  for (const floating of document.querySelectorAll("[data-anchor]")) {
    const target = document.getElementById(floating.dataset.anchor);
    const container = floating.offsetParent;
    if (!target || !container) continue;
    const base = container.getBoundingClientRect();
    const firstLine = target.getClientRects()[0];
    const whole = target.getBoundingClientRect();
    const left = whole.left + whole.width / 2 - floating.offsetWidth / 2 - base.left;
    floating.style.left = `${Math.max(12, Math.min(base.width - floating.offsetWidth - 12, left))}px`;
    floating.style.top = `${firstLine.top - base.top - floating.offsetHeight - TOOLBAR_GAP}px`;
  }
  document.documentElement.dataset.ready = "true";
}
addEventListener("load", () => void document.fonts.ready.then(placeAnchored));
