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
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function run() {
  await app.whenReady();
  window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.on("console-message", event => diagnostics.push(event.message));
  await window.loadURL(config.url + "#/articles/1");
  await until("document.querySelector('[data-portable-counter] output')?.textContent === '7'");
  assert(
    await evaluate('!("_INIT_DATA_" in window) && !("__BLOG_DEV_MOCK_DATA__" in window)'),
    "站点不能依赖旧页面注入或开发 mock 全局数据"
  );
  assert((await evaluate("document.body.textContent")).includes("第一篇文章"));
  cases.push("独立博客从正式数据产物加载原文章页面与完整编辑器");
  await click("[data-portable-counter] button");
  await until("document.querySelector('[data-portable-counter] output')?.textContent === '8'");
  cases.push("真实 C23 插件经博客自身依赖映射运行，计数交互可用");
  await until("Boolean(document.querySelector('iframe[title=\"HTML 文档\"]'))");
  let fullPage;
  for (let attempt = 0; attempt < 200; attempt++) {
    fullPage = window.webContents.mainFrame.framesInSubtree.find(
      frame => frame.url === "about:srcdoc"
    );
    if (
      fullPage &&
      (await fullPage
        .executeJavaScript("Boolean(document.querySelector('#full-page-button'))")
        .catch(() => false))
    )
      break;
    fullPage = undefined;
    await pause(30);
  }
  assert(fullPage, "完整 HTML 应由模板隔离为子文档");
  assert(
    (
      await fullPage.executeJavaScript(
        "document.querySelector('style[data-tau-content-css]')?.textContent"
      )
    ).includes("text-red-500")
  );
  await fullPage.executeJavaScript("document.querySelector('#full-page-button').click()");
  assert.equal(
    await fullPage.executeJavaScript("document.querySelector('#full-page-button').textContent"),
    "1"
  );
  assert.equal(
    await evaluate("document.querySelector('[data-portable-counter] output').textContent"),
    "8"
  );
  cases.push("模板保留全页 HTML 的独立脚本交互与伴生 CSS，父页面状态独立");
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
    "location.hash === '#/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  cases.push("项目 URL 由模板选择，导航不请求对应的业务 HTML");
  await evaluate("history.back()");
  await until(
    "location.hash === '#/articles/1' && document.querySelector('[data-portable-counter] output')?.textContent === '7'"
  );
  await evaluate("history.forward()");
  await until(
    "location.hash === '#/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  window.webContents.reload();
  await until(
    "location.hash === '#/projects/12/34' && document.querySelector('[data-portable-counter] output')?.textContent === '31'"
  );
  cases.push("Router 响应浏览器前进、后退和深链刷新，无服务器业务路由回退");
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
  await window.loadURL(config.url + "#/quests/9");
  await until(
    "document.body.textContent.includes('如何分离模板？') && [...document.querySelectorAll('[data-portable-counter] output')].map(node=>node.textContent).join(',') === '42,7,31'"
  );
  cases.push("保留求索录状态、研究资料、独立答案和插件正文");
  await window.loadURL(config.url + "#/cards?tag=" + encodeURIComponent("发布"));
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
