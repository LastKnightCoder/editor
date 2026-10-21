const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const config = JSON.parse(require("node:fs").readFileSync(process.env.TAU_BLOG_CONFIG, "utf8"));
app.setPath("userData", path.join(config.output, "browser-profile"));
app.disableHardwareAcceleration();
const cases = [];
const diagnostics = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(code) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await evaluate(code)) return;
    await pause(30);
  }
  throw new Error(
    "等待超时：" +
      code +
      "\n" +
      (await evaluate("document.body.textContent")) +
      "\n" +
      diagnostics.join("\n")
  );
}
const click = selector =>
  evaluate(
    `(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error(${JSON.stringify("缺少元素：" + selector)});node.click()})()`
  ).catch(error => {
    throw new Error(`点击 ${selector} 失败：${error.message}`);
  });
async function run() {
  await app.whenReady();
  window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.on("console-message", event => diagnostics.push(event.message));
  await window.loadURL(config.url + "articles/1");
  await until("document.querySelector('[data-portable-counter] output')?.textContent === '7'");
  assert(
    await evaluate('!("_INIT_DATA_" in window) && !("__BLOG_DEV_MOCK_DATA__" in window)'),
    "站点不能依赖旧页面注入或开发 mock 全局数据"
  );
  assert((await evaluate("document.body.textContent")).includes("第一篇文章"));
  cases.push("独立博客从正式数据产物加载原文章页面与完整编辑器");
  window.setContentSize(1280, 800);
  await until("getComputedStyle(document.querySelector('header nav.hidden')).display === 'flex'");
  cases.push(
    "@tau/blog 样式处于级联层，模板的断点工具类可覆盖（桌面导航可见），同页图册插件的样式不覆盖模板"
  );
  await click("[data-portable-counter] button");
  await until("document.querySelector('[data-portable-counter] output')?.textContent === '8'");
  cases.push("真实 C23 插件经公开渲染器运行，计数交互可用");
  const gallery = "[data-element-frame]:has(img[src^='data:image/svg'])";
  await until(`document.querySelectorAll("${gallery} img").length === 3`);
  assert(
    await evaluate(
      `[...document.querySelectorAll("${gallery} img")].every(img => img.complete && img.naturalWidth === 400)`
    ),
    "图册图片未加载"
  );
  assert(
    await evaluate(
      "[...document.querySelectorAll('style')].some(style => style.textContent.includes('.swiper'))"
    ),
    "图册插件样式未注入"
  );
  await evaluate(
    `document.querySelector("${gallery}").firstElementChild.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`
  );
  await pause(50);
  assert(
    await evaluate(`!document.querySelector('[role="toolbar"][aria-label="图册属性"]')`),
    "只读正文出现图册属性条"
  );
  await evaluate(`document.querySelector("${gallery} img").click()`);
  await until(
    `document.querySelector('[role="dialog"][aria-label="图片预览"]')?.textContent.includes('图册第1张')`
  );
  await click('[role="dialog"][aria-label="图片预览"] button[title="关闭 (Esc)"]');
  await until(`!document.querySelector('[role="dialog"][aria-label="图片预览"]')`);
  cases.push("正式图册插件经公开渲染器显示图片与样式，只读无属性条，单击打开图片查看器");
  await until("Boolean(document.querySelector('#html-fragment-button'))");
  assert(
    await evaluate("!document.querySelector('iframe[title=\"HTML 文档\"]')"),
    "渲染器不得替换 HTML 插件行为"
  );
  assert(
    await evaluate(
      "[...document.querySelectorAll('style[data-tau-content-style]')].some(style => style.textContent.includes('text-red-500'))"
    )
  );
  await click("#html-fragment-button");
  assert.equal(await evaluate("document.querySelector('#html-fragment-button').textContent"), "1");
  assert.equal(
    await evaluate("document.querySelector('[data-portable-counter] output').textContent"),
    "8"
  );
  cases.push("HTML 使用原插件渲染、交互与伴生 CSS，无模板 iframe 适配");
  // 源码块的全屏工作台已退役，只读时操作条只有「复制源码」
  assert(
    await evaluate(
      `Boolean(document.querySelector('button[aria-label="复制源码"], button[title="复制源码"]')) && !document.querySelector('button[aria-label="全屏"], button[title="全屏"]')`
    ),
    "只读源码块的操作条应只有复制源码"
  );
  assert.equal(await evaluate("document.querySelector('#html-fragment-button').textContent"), "1");
  cases.push("只读源码块只提供复制源码，不改写正文");
  await evaluate(
    `(()=>{const link=document.querySelector('a.blog-content-link[href*="articles/2"]');if(!link)throw Error('缺少预览链接');link.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));link.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));})()`
  );
  await until(
    "document.querySelector('.blog-content-link-preview [data-portable-counter] output')?.textContent === '19'"
  );
  await click(".blog-content-link-preview [data-portable-counter] button");
  await until(
    "document.querySelector('.blog-content-link-preview [data-portable-counter] output')?.textContent === '20'"
  );
  assert.equal(
    await evaluate("document.querySelector('[data-portable-counter] output').textContent"),
    "8"
  );
  cases.push("正文与悬停预览持有独立编辑器、计数状态和数据上下文");
  await evaluate(
    `(()=>{const link=document.querySelector('a.blog-content-link[href*="articles/2"]');link.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));link.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));})()`
  );
  await until("!document.querySelector('.blog-content-link-preview')");
  await evaluate(
    `(()=>{const link=document.querySelector('a.blog-content-link[href*="articles/1"]');link.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));})()`
  );
  await until(
    "document.querySelector('.blog-content-link-preview [data-portable-counter] output')?.textContent === '7'"
  );
  await click(".blog-content-link-preview [data-portable-counter] button");
  await click(".blog-content-link-preview [data-portable-counter] button");
  await until(
    "document.querySelector('.blog-content-link-preview [data-portable-counter] output')?.textContent === '9'"
  );
  assert.equal(
    await evaluate("document.querySelector('[data-portable-counter] output').textContent"),
    "8"
  );
  await evaluate(
    `(()=>{const link=document.querySelector('a.blog-content-link[href*="articles/1"]');link.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));})()`
  );
  await until("!document.querySelector('.blog-content-link-preview')");
  cases.push("同一内容的多个实例共享取数缓存，分别装配节点与组件状态");
  await click('a.blog-content-link[href*="projects/12/34"]');
  await until(
    "location.pathname === '/notes/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  assert(
    await evaluate(
      "performance.getEntriesByType('navigation').length === 1 && !document.querySelector('[role=alert]')"
    ),
    "站内链接应由 Router 处理，不整页跳转"
  );
  cases.push("项目 URL 由模板选择，站内链接由 Router 处理、不整页跳转");
  await evaluate("history.back()");
  await until(
    "location.pathname === '/notes/articles/1' && document.querySelector('[data-portable-counter] output')?.textContent === '7'"
  );
  await evaluate("history.forward()");
  await until(
    "location.pathname === '/notes/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  window.webContents.reload();
  await until(
    "location.pathname === '/notes/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  cases.push("Router 响应浏览器前进、后退；深链刷新经模板 404.html 回退渲染");
  await click('button[aria-label="搜索"]');
  await until(
    "Boolean(document.querySelector('input[placeholder]')) && document.body.textContent.includes('搜索')"
  );
  const input = await evaluate(
    "[...document.querySelectorAll('input')].map(input=>({placeholder:input.placeholder,type:input.type}))"
  );
  await evaluate(
    `(()=>{const input=[...document.querySelectorAll('input')].find(input=>input.placeholder.includes('搜索'));if(!input)throw Error('缺少搜索框');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'共享协议');input.dispatchEvent(new Event('input',{bubbles:true}));})()`
  );
  await until(
    "Boolean(document.querySelector('a[href*=\"articles/2\"]')) && document.body.textContent.includes('共享协议文章 2')"
  );
  cases.push("保留搜索窗口与本地搜索行为，索引读取不依赖当前项目 URL");
  await window.loadURL(config.url + "quests/9");
  await until(
    "document.body.textContent.includes('如何分离模板？') && [...document.querySelectorAll('[data-portable-counter] output')].map(node=>node.textContent).join(',') === '42,7,31'"
  );
  cases.push("保留求索录状态、研究资料、独立答案和插件正文");
  await window.loadURL(config.url + "cards?tag=" + encodeURIComponent("发布"));
  await until("document.body.textContent.includes('共享协议卡片')");
  cases.push("保留卡片列表与标签筛选，查询参数归模板 Router");
  const report = { cases, diagnostics, searchInputs: input };
  await fs.writeFile(
    path.join(config.output, "browser-report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report));
  window.destroy();
  app.quit();
}
run().catch(async error => {
  const state = window
    ? await evaluate(
        "JSON.stringify({text:document.body.textContent,links:[...document.querySelectorAll('a')].map(a=>({text:a.textContent,href:a.getAttribute('href'),class:a.className}))})"
      ).catch(() => "")
    : "";
  await fs.writeFile(
    path.join(config.output, "browser-error.txt"),
    String(error.stack) + "\n" + diagnostics.join("\n") + "\n" + state
  );
  console.error(error);
  window?.destroy();
  app.exit(1);
});
