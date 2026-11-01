// 把 data-tpl 占位换成模板产出；须在 ai-mobile/ai.js 之前执行（它负责把 data-i 渲染成图标）。
(function () {
  const T = window.WRT;
  document.querySelectorAll("[data-tpl]").forEach(el => {
    const make = T[el.dataset.tpl];
    if (!make) throw new Error(`未知模板：${el.dataset.tpl}`);
    el.outerHTML = make(el);
  });
})();
