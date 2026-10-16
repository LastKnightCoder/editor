import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const directory = process.env.TAU_RENDER_SPIKE_DIRECTORY;
const base = process.env.TAU_RENDER_SPIKE_URL;
if (!directory || !base) throw new Error("缺少 spike 环境参数");
app.setPath("userData", path.join(directory, "profile"));
const windows: BrowserWindow[] = [];
const results: string[] = [];

async function open(page: string, failure = false) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  windows.push(window);
  await window.loadURL(new URL(page, base).href);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript("window.spike");
    if (state?.error) {
      if (failure) return window;
      throw new Error(state.error);
    }
    if (
      !failure &&
      state?.ready &&
      (await window.webContents.executeJavaScript(
        "Boolean(document.querySelector('[data-plugin-content]'))"
      ))
    )
      return window;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`页面等待超时：${page}`);
}
async function snapshot(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('[data-plugin-content]');
    return {
      label: element.querySelector('[data-plugin-label]').textContent,
      count: Number(element.querySelector('[data-count]').dataset.count),
      markup: element.outerHTML,
      padding: getComputedStyle(element).padding,
      sharedReact: window.spike.sharedReact,
      activations: window.desktopActivations || 0,
      editable: document.querySelector('[data-slate-editor]').getAttribute('contenteditable'),
      nodeIntegration: typeof window.require,
      value: window.spike.value,
    };
  })()`);
}

void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const desktop = await open("desktop/index.html");
    const blog = await open("articles/nested/index.html");
    const beforeDesktop = await snapshot(desktop),
      beforeBlog = await snapshot(blog);
    assert.equal(beforeDesktop.sharedReact, true);
    assert.equal(beforeBlog.sharedReact, true);
    assert.equal(beforeDesktop.activations, 1);
    assert.equal(beforeBlog.activations, 0);
    assert.equal(beforeDesktop.editable, "true");
    assert.equal(beforeBlog.editable, "false");
    assert.equal(beforeBlog.nodeIntegration, "undefined");
    assert.equal(beforeDesktop.markup, beforeBlog.markup);
    assert.equal(beforeDesktop.padding, "12px");
    assert.equal(beforeBlog.padding, "12px");
    results.push(
      "真实 ArticlePage 动态装配未知节点",
      "共享 React 单例",
      "博客未执行桌面 activate",
      "可编辑与只读使用相同节点组件及 CSS"
    );
    for (const window of [desktop, blog]) {
      await window.webContents.executeJavaScript(
        "document.querySelector('[data-plugin-content] button').click()"
      );
      const deadline = Date.now() + 3000;
      while ((await snapshot(window)).count !== beforeBlog.count + 1 && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal((await snapshot(window)).count, beforeBlog.count + 1);
    }
    const afterDesktop = await snapshot(desktop),
      afterBlog = await snapshot(blog);
    assert.equal(afterDesktop.markup, afterBlog.markup);
    assert.deepEqual(afterBlog.value, beforeBlog.value);
    results.push("只读博客内按钮交互正常且未修改文档数据");
    const second = await open("second/index.html");
    assert.notEqual((await snapshot(second)).label, beforeBlog.label);
    const pinned = await open("articles/nested/index.html");
    assert.equal((await snapshot(pinned)).label, beforeBlog.label);
    results.push("第二版插件无需重编模板，旧页面仍固定原版本");
    for (const [page, message] of [
      ["missing/index.html", "加载失败"],
      ["tampered/index.html", "摘要不匹配"],
    ]) {
      const window = await open(page, true);
      const state = await window.webContents.executeJavaScript("window.spike");
      assert.ok(state.error.includes(message), state.error);
      assert.equal(
        await window.webContents.executeJavaScript(
          "Boolean(document.querySelector('[data-slate-editor]'))"
        ),
        false
      );
    }
    results.push("缺失或摘要不匹配明确失败，不挂载残缺编辑器");
    await writeFile(
      path.join(directory, "browser-report.json"),
      JSON.stringify(
        {
          status: "passed",
          cases: results,
          initial: { label: beforeBlog.label, count: beforeBlog.count },
          clickedCount: afterBlog.count,
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
        { status: "failed", cases: results, error: String(error), stack: error.stack },
        null,
        2
      )
    );
    windows.forEach(window => window.destroy());
    app.exit(1);
  });
