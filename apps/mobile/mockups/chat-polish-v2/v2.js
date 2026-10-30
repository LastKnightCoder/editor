// 对话页 v2 mockup：顶栏与输入区的重复片段在这里拼装，须在 ai-mobile/ai.js（渲染图标）之前执行。
(function () {
  const nav = title =>
    `<span class="ib back" data-i="chevron-left" data-s="23"></span>` +
    `<span class="mid"><b>${title}</b><span><i></i>DeepSeek V4.1 Flash<span data-i="chevron-down" data-s="11"></span></span></span>` +
    `<span class="ib" data-i="history" data-s="20"></span><span class="ib" data-i="square-pen" data-s="19"></span>`;
  document.querySelectorAll("[data-nav]").forEach(element => {
    element.classList.add("v-nav");
    element.innerHTML = nav(element.dataset.nav);
  });

  const toolsA = main =>
    `<div class="tools"><span class="t-btn" data-i="plus" data-s="18"></span>` +
    `<span class="t-chip" data-i="at-sign" data-s="15">引用笔记</span><span class="sp"></span>${main}</div>`;
  const COMPOSERS = {
    "A-idle": `<div class="cA"><div class="tx"><span class="ph">发消息</span></div>${toolsA('<span class="t-main mic" data-i="mic" data-s="19"></span>')}</div>`,
    "A-typing": `<div class="cA"><div class="att"><span class="q" data-i="notebook-pen" data-s="13"><span>10 月 29 日 · 日记</span><span data-i="x" data-s="12"></span></span><span class="img"></span></div><div class="tx">这天写的语音输入想法，能整理成一张卡片吗？</div>${toolsA('<span class="t-main send" data-i="arrow-up" data-s="19"></span>')}</div>`,
    "A-voice": `<div class="cA"><div class="hold on">松开 发送</div>${toolsA('<span class="t-main mic" data-i="keyboard" data-s="18"></span>')}</div>`,
    "A-run": `<div class="cA"><div class="tx"><span class="ph">生成中，可以先写下一条</span></div>${toolsA('<span class="t-main stop" data-i="square" data-s="13"></span>')}</div>`,
    B: `<div class="cB"><div class="tx">发消息</div><div class="tools"><span class="t-chip" data-i="plus" data-s="16">附件</span><span class="t-chip" data-i="at-sign" data-s="15">引用</span><span class="sp"></span><span class="t-main mic" data-i="mic" data-s="19"></span></div></div>`,
    C: `<div class="cC"><div class="box"><div class="tx">发消息</div><div class="tools"><span class="t-btn" data-i="plus" data-s="18"></span><span class="t-btn" data-i="at-sign" data-s="16"></span><span class="t-btn" data-i="image" data-s="17"></span></div></div><span class="big" data-i="mic" data-s="24"></span></div>`,
  };
  document.querySelectorAll("[data-cmp]").forEach(element => {
    element.classList.add("v-cmp");
    if (element.dataset.cmp === "B") element.classList.add("tray");
    element.innerHTML = COMPOSERS[element.dataset.cmp];
  });
})();
