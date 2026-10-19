const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const configFile = process.env.TAU_SPA_SPIKE_CONFIG;
if (!configFile) throw new Error("缺少验证配置");
const config = JSON.parse(require("node:fs").readFileSync(configFile, "utf8"));
app.setPath("userData", path.join(config.output, "browser-profile"));
app.disableHardwareAcceleration();
const windows = [];
const cases = [];
const diagnostics = [];
const evidence = {};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = (window, expression) => window.webContents.executeJavaScript(expression);

async function until(window, expression) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await evaluate(window, expression)) return;
    await pause(25);
  }
  throw new Error(
    `等待超时：${expression}\n${window.webContents.getURL()}\n${diagnostics.join("\n")}`
  );
}

async function open(url, expectedKey, failure = false) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  windows.push(window);
  window.webContents.on("console-message", (_event, details) =>
    diagnostics.push(typeof details === "object" ? details.message : String(details))
  );
  window.webContents.on("render-process-gone", (_event, details) =>
    diagnostics.push(`进程退出：${details.reason}`)
  );
  await window.loadURL(url);
  if (failure) await until(window, "Boolean(document.querySelector('[data-testid=page-error]'))");
  else await ready(window, expectedKey);
  return window;
}

async function ready(window, key) {
  await until(
    window,
    `(() => {
    const page = document.querySelector('[data-testid=page]');
    return page?.dataset.key === ${JSON.stringify(key)} && page.dataset.loading === 'false' && Boolean(page.querySelector('[data-testid=content-title]'));
  })()`
  );
}

async function click(window, selector) {
  await evaluate(
    window,
    `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw Error('找不到操作目标'); node.click(); })()`
  );
}

async function navigate(window, key) {
  await click(window, `nav a[data-key="${key}"]`);
  await ready(window, key);
}

function count(window, preview = false) {
  const selector = `${preview ? "[data-testid=preview]" : "[data-testid=page] > [data-testid=body]"} [data-portable-counter] output`;
  return evaluate(
    window,
    `Number(document.querySelector(${JSON.stringify(selector)})?.textContent)`
  );
}

async function search(window) {
  await evaluate(
    window,
    `(() => {
    const input = document.querySelector('[data-testid=search-input]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '共享协议');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
  );
  await click(window, "[data-testid=search-submit]");
  await until(window, "document.querySelectorAll('[data-testid=search-results] a').length > 0");
  return evaluate(
    window,
    "[...document.querySelectorAll('[data-testid=search-results] a')].map(node => ({key: node.dataset.key, href: node.href}))"
  );
}

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    try {
      const main = await open(config.pathUrl, "home");
      await until(
        main,
        "document.querySelector('header img')?.complete && document.querySelector('header img')?.naturalWidth > 0"
      );
      await evaluate(main, "window.__documentToken = 'same-spa-document'");
      await navigate(main, "article:1");
      assert.equal(await count(main), 7);
      await click(main, "[data-testid=page] > [data-testid=body] [data-portable-counter] button");
      await until(
        main,
        "document.querySelector('[data-portable-counter] output')?.textContent === '8'"
      );
      cases.push("子路径下模板自己的正文渲染真实 C23 计数插件，交互 7→8");

      const location = main.webContents.getURL();
      await click(main, '[data-preview-key="article:2"]');
      await until(
        main,
        "document.querySelector('[data-testid=preview] [data-portable-counter] output')?.textContent === '19'"
      );
      await click(main, "[data-testid=preview] [data-portable-counter] button");
      await until(
        main,
        "document.querySelector('[data-testid=preview] [data-portable-counter] output')?.textContent === '20'"
      );
      assert.equal(await count(main), 8);
      assert.equal(await count(main, true), 20);
      assert.equal(
        await evaluate(
          main,
          "document.head.querySelectorAll('style[data-template-resource=\"example.portable-counter\"]').length"
        ),
        2
      );
      await click(main, "[data-testid=close-preview]");
      await until(main, "!document.querySelector('[data-testid=preview]')");
      assert.equal(
        await evaluate(
          main,
          "document.head.querySelectorAll('style[data-template-resource=\"example.portable-counter\"]').length"
        ),
        1
      );
      assert.equal(await count(main), 8);
      assert.equal(main.webContents.getURL(), location);
      cases.push("模板自行实现预览：状态独立，关闭仅释放自身样式，不改变 Router 地址");

      await click(main, '[data-preview-key="doc:project:12:34"]');
      await until(
        main,
        "document.querySelector('[data-testid=preview] h2')?.textContent === '项目说明'"
      );
      const resourcePaths = await evaluate(
        main,
        "performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname)"
      );
      assert(resourcePaths.some(name => name.includes("/data/projects/12/34.")));
      assert(!resourcePaths.some(name => name.includes("/work/12/items/34")));
      evidence.previewResourcePaths = resourcePaths;
      await click(main, "[data-testid=close-preview]");
      cases.push("ContentRef 预览只读取目标 JSON，没有读取目标公开 HTML");

      const results = await search(main);
      const doc = results.find(item => item.key === "doc:project:12:34");
      assert(doc && doc.href.endsWith("/notes/work/12/items/34"));
      evidence.pathSearchLinks = results;
      await click(main, '[data-testid=search-results] a[data-key="doc:project:12:34"]');
      await ready(main, "doc:project:12:34");
      assert.equal(await evaluate(main, "window.__documentToken"), "same-spa-document");
      cases.push("搜索返回 key，由模板生成自己的 URL 并经现成 Router 导航，文档未重载");

      await evaluate(main, "history.back()");
      await ready(main, "article:1");
      await evaluate(main, "history.forward()");
      await ready(main, "doc:project:12:34");
      cases.push("浏览器前进/后退由模板 BrowserRouter 正常处理");

      const deep = await open(
        new URL("work/12/items/34", config.pathUrl).href,
        "doc:project:12:34"
      );
      await new Promise(resolve => {
        deep.webContents.once("did-finish-load", resolve);
        deep.webContents.reload();
      });
      await ready(deep, "doc:project:12:34");
      cases.push("模板声明的 History fallback 支持子路径深链及刷新");

      await click(main, 'nav a[data-key="article:3"]');
      await until(main, "window.__spike?.pendingKey === 'article:3'");
      await navigate(main, "article:2");
      await pause(500);
      assert.equal(
        await evaluate(main, "document.querySelector('[data-testid=page]').dataset.key"),
        "article:2"
      );
      assert.equal(await count(main), 19);
      cases.push("快速切页后慢数据不会覆盖目标内容，取消属于模板生命周期");

      for (const key of ["card:7", "quest:5", "list:articles", "home"]) await navigate(main, key);
      cases.push("模板可自行消费 card/quest/list/home 的结构与引用关系");

      const summary = await open(config.hashUrl + "#/entry/article%3A1", "article:1");
      assert.equal(
        await evaluate(summary, "Boolean(document.querySelector('[data-testid=summary-only]'))"),
        true
      );
      assert.equal(
        await evaluate(
          summary,
          "document.querySelectorAll('[data-preview-key], [data-portable-counter]').length"
        ),
        0
      );
      const hashResults = await search(summary);
      assert(
        hashResults.some(
          item =>
            item.key === "doc:project:12:34" &&
            item.href.includes("#/entry/doc%3Aproject%3A12%3A34")
        )
      );
      evidence.hashSearchLinks = hashResults;
      await click(summary, '[data-testid=search-results] a[data-key="doc:project:12:34"]');
      await ready(summary, "doc:project:12:34");
      cases.push("第二个模板直接 fetch、自研搜索，使用不同 Hash URL，且可不渲染插件/不提供预览");

      const root = await open(new URL("journal/1", config.rootUrl).href, "article:1");
      assert.equal(await count(root), 7);
      cases.push("同一模板的根路径部署与 /notes/ 部署均可取数和接入插件");

      const updated = await open(new URL("journal/1", config.updatedUrl).href, "article:1");
      assert.equal(
        await evaluate(
          updated,
          "document.querySelector('[data-testid=content-title]').textContent"
        ),
        "只有数据变化后的标题"
      );
      assert.equal(await count(updated), 7);
      cases.push("只变数据清单/内容，冻结模板 JS 不重编也能展示新数据");

      const corrupt = await open(new URL("journal/1", config.corruptUrl).href, null, true);
      assert(
        (
          await evaluate(corrupt, "document.querySelector('[data-testid=page-error]').textContent")
        ).includes("INTEGRITY_MISMATCH")
      );
      assert.equal(
        await evaluate(corrupt, "Boolean(document.querySelector('[data-portable-counter]'))"),
        false
      );
      cases.push("插件产物被篡改时模板明确失败，不执行不匹配脚本");

      await fs.writeFile(
        path.join(config.output, "browser-report.json"),
        JSON.stringify({ status: "passed", cases, evidence, diagnostics }, null, 2)
      );
      windows.forEach(window => window.destroy());
      app.exit(0);
    } catch (error) {
      await fs.writeFile(
        path.join(config.output, "browser-report.json"),
        JSON.stringify(
          {
            status: "failed",
            cases,
            evidence,
            diagnostics,
            error: String(error),
            stack: error.stack,
          },
          null,
          2
        )
      );
      console.error(error);
      windows.forEach(window => window.destroy());
      app.exit(1);
    }
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
