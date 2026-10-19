import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = process.env.TAU_DATA_TEMPLATE_SPIKE_DIRECTORY;
const base = process.env.TAU_DATA_TEMPLATE_SPIKE_URL;
if (!directory || !base) throw new Error("缺少 spike 环境参数");
const siteDir = path.join(directory, "site");
app.setPath("userData", path.join(directory, "profile"));
const windows: BrowserWindow[] = [];
const results: string[] = [];
const diagnostics: string[] = [];

function track(window: BrowserWindow) {
  window.webContents.on("console-message", (_event, _level, message) =>
    diagnostics.push(`console: ${message}`)
  );
  window.webContents.on("did-fail-load", (_event, code, description, url) =>
    diagnostics.push(`failed-load: ${code} ${description} ${url}`)
  );
  window.webContents.on("crashed" as never, () => diagnostics.push("render-process-gone"));
}

async function open(page: string, options: { failure?: boolean; until?: string } = {}) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  track(window);
  windows.push(window);
  await window.loadURL(new URL(page, base).href);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript("window.__dataDriven");
    if (state?.error) {
      if (options.failure) return window;
      throw new Error(state.error);
    }
    const mounted = options.until
      ? await window.webContents.executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify(options.until)}))`
        )
      : true;
    if (state?.ready && mounted) return window;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  diagnostics.push(`timeout on ${page}, location=${window.webContents.getURL()}`);
  diagnostics.push(
    `html=${(await window.webContents.executeJavaScript("document.documentElement.outerHTML")).slice(0, 500)}`
  );
  throw new Error(`页面等待超时：${page}\n${diagnostics.join("\n")}`);
}

function snapshot(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('[data-portable-counter]');
    return {
      count: Number(element.querySelector('output').textContent),
      markup: element.outerHTML,
      padding: getComputedStyle(element).padding,
      editable: document.querySelector('[data-slate-editor]')?.getAttribute('contenteditable'),
      title: window.__dataDriven?.title,
      source: window.__dataDriven?.source,
    };
  })()`);
}

void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();

    // 1. 首页：模板自己消费 site.json 清单，宿主没有规定首页结构
    const home = await open("/", { until: "main a" });
    const homeState = await home.webContents.executeJavaScript(`(() => ({
      source: window.__dataDriven?.source,
      anchors: [...document.querySelectorAll('main a')].map(a => ({ href: a.getAttribute('href'), text: a.textContent })),
    }))()`);
    assert.equal(homeState.source, "manifest");
    assert.deepEqual(homeState.anchors, [{ href: "articles/1/", text: "数据驱动发布" }]);
    results.push("模板自定义首页：fetch site.json 清单渲染文章列表");

    // 2. fetch 版文章页：真实 ArticlePage + 插件节点
    const fetched = await open("articles/1/", { until: "[data-portable-counter]" });
    const beforeFetch = await snapshot(fetched);
    assert.equal(beforeFetch.source, "fetch");
    assert.equal(beforeFetch.editable, "false");
    assert.equal(beforeFetch.count, 7);
    assert.equal(beforeFetch.padding, "12px");
    results.push("文章页数据来自网络 fetch，真实 ArticlePage 渲染插件节点");

    // 3. 内联对照版：同一数据内联，DOM 与 fetch 版一致（迁移可行性）
    const inlined = await open("inline/1/", { until: "[data-portable-counter]" });
    const beforeInline = await snapshot(inlined);
    assert.equal(beforeInline.source, "inline");
    assert.equal(beforeInline.markup, beforeFetch.markup);
    results.push("同一数据内联与 fetch 渲染 DOM 一致，现有模板可平滑迁移");

    // 4. 只读交互
    await fetched.webContents.executeJavaScript(
      "document.querySelector('[data-portable-counter] button').click()"
    );
    const deadline = Date.now() + 3000;
    while ((await snapshot(fetched)).count !== 8 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await snapshot(fetched)).count, 8);
    results.push("只读文章页内插件交互正常（7 → 8）");

    // 5. 数据独立演进：改数据文件即生效，模板字节不变
    const dataPath = path.join(siteDir, "data/articles/1.json");
    const payload = JSON.parse(await readFile(dataPath, "utf8"));
    payload.content.title = "数据更新后的标题";
    await writeFile(dataPath, JSON.stringify(payload));
    const refreshed = await open("articles/1/", { until: "[data-portable-counter]" });
    const afterRefresh = await snapshot(refreshed);
    assert.equal(afterRefresh.title, "数据更新后的标题");
    const bodyText = await refreshed.webContents.executeJavaScript("document.body.textContent");
    assert.ok(bodyText.includes("数据更新后的标题"), "页面正文包含新标题");
    results.push("修改数据文件后重新打开即生效，无需重新发布模板");

    // 6. 数据缺失：明确失败，不挂载残缺编辑器
    const missing = await open("missing/", { failure: true });
    const errorState = await missing.webContents.executeJavaScript("window.__dataDriven");
    assert.ok(errorState.error.includes("数据加载失败"), errorState.error);
    assert.equal(
      await missing.webContents.executeJavaScript("Boolean(document.querySelector('[data-slate-editor]'))"),
      false
    );
    results.push("数据文件缺失明确报错，不挂载残缺编辑器");

    await writeFile(
      path.join(directory, "browser-report.json"),
      JSON.stringify(
        {
          status: "passed",
          cases: results,
          initial: { title: beforeFetch.title, count: beforeFetch.count, source: beforeFetch.source },
          clickedCount: 8,
          refreshedTitle: afterRefresh.title,
          inlineMarkupMatches: beforeInline.markup === beforeFetch.markup,
        },
        null,
        2
      )
    );
    windows.forEach(window => window.destroy());
    app.exit(0);
  })
  .catch(async error => {
    console.error(error);
    await writeFile(
      path.join(directory, "browser-report.json"),
      JSON.stringify(
        { status: "failed", cases: results, error: String(error), stack: error.stack, diagnostics },
        null,
        2
      )
    );
    windows.forEach(window => window.destroy());
    app.exit(1);
  });
