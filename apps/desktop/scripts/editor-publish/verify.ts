import { app, BrowserWindow, ipcMain } from "electron";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { acceptHeadlessPlugin } from "../../src-electron/main/services/plugin-codecs";
import { getMarkdown, importFromMarkdown } from "../../src/utils/markdown";
import { customMarkdown } from "./custom-fixture";
import { Worker } from "node:worker_threads";
const directory = process.env.TAU_EDITOR_PUBLISH_DIRECTORY;
const url = process.env.TAU_EDITOR_PUBLISH_URL;
if (!directory || !url) throw new Error("缺少验收参数");
app.setPath("userData", path.join(directory, "profile"));
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const artifact = await readPluginPackage(
      path.join(directory, "desktop-plugins/example.portable-counter")
    );
    const custom = await readPluginPackage(
      path.join(directory, "desktop-plugins/tau.custom-block")
    );
    const artifacts = [artifact, custom];
    artifacts.forEach(acceptHeadlessPlugin);
    assert.equal(getMarkdown(importFromMarkdown(customMarkdown)).trim(), customMarkdown);
    const indexing = new Worker(path.join(directory, "index-content-worker.cjs"), {
      workerData: { editorPlugins: artifacts },
    });
    try {
      const reply = await new Promise<{ ok: boolean; result: { content: string } }>(
        (resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("插件索引线程转换超时")), 10000);
          indexing.once("error", error => {
            clearTimeout(timeout);
            reject(error);
          });
          indexing.once("message", result => {
            clearTimeout(timeout);
            resolve(result);
          });
          indexing.postMessage({
            raw: JSON.stringify(
              importFromMarkdown(customMarkdown + "\n\n::portable-counter{value=7}")
            ),
            title: "插件索引",
            whole: true,
            sections: false,
          });
        }
      );
      assert.equal(reply.ok, true);
      assert.ok(reply.result.content.includes(customMarkdown));
      assert.ok(reply.result.content.includes("portable-counter"));
    } finally {
      await indexing.terminate();
    }
    const startup = new PluginContentStartup(async id =>
      artifacts.find(item => item.manifest.id === id)!
    );
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    ipcMain.handle("skill:list", () => []);
    ipcMain.handle("plugin-local:scan", () => ({
      directory: "/test",
      entries: artifacts.map(artifact => ({
        id: artifact.manifest.id,
        artifact,
        enabled: true,
      })),
    }));
    ipcMain.handle("tailwind-runtime:compile", () =>
      readFile(path.join(directory, "custom-runtime.css"), "utf8")
    );
    const snapshot = await startup.get(artifacts.map(artifact => artifact.manifest.id));
    ipcMain.handle("plugin-local:content-startup", () => snapshot);
    const window = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    await window.loadURL(new URL("articles/1.html", url).href);
    const run = (source: string) => window.webContents.executeJavaScript(source);
    const deadline = Date.now() + 30_000;
    while (!(await run("Boolean(document.querySelector('[data-portable-counter]'))"))) {
      const error = await run("document.querySelector('#root[role=alert]')?.textContent");
      if (error) throw new Error(error);
      if (Date.now() > deadline) throw new Error("博客插件挂载超时");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(
      await run("document.querySelector('[data-slate-editor]').getAttribute('contenteditable')"),
      "false"
    );
    assert.equal(await run("typeof window.require"), "undefined");
    assert.equal(
      await run("document.querySelector('[data-portable-counter] output').textContent"),
      "7"
    );
    const blogMarkup = await run("document.querySelector('[data-portable-counter]').outerHTML");
    while (!(await run("Boolean(document.querySelector('[data-custom-acceptance]'))"))) {
      if (Date.now() > deadline) throw new Error("博客 custom-block 挂载超时");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const customMarkup = await run("document.querySelector('[data-custom-acceptance]').outerHTML");
    assert.equal(
      await run("getComputedStyle(document.querySelector('[data-custom-acceptance]')).padding"),
      "13px"
    );
    await run("document.querySelector('[data-custom-acceptance] button').click()");
    const desktop = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(directory, "preload.cjs"),
      },
    });
    await desktop.loadFile(path.join(directory, "desktop.html"));
    const desktopRun = (source: string) => desktop.webContents.executeJavaScript(source);
    desktop.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) console.error("桌面验收:", message);
    });
    const desktopDeadline = Date.now() + 30_000;
    while (!(await desktopRun("Boolean(document.querySelector('[data-portable-counter]'))"))) {
      const error = await desktopRun("document.body.dataset.error");
      if (error) throw new Error(error);
      if (Date.now() > desktopDeadline) throw new Error("桌面插件挂载超时");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(
      await desktopRun(
        "document.querySelector('[data-slate-editor]').getAttribute('contenteditable')"
      ),
      "true"
    );
    assert.equal(
      await desktopRun("document.querySelector('[data-portable-counter]').outerHTML"),
      blogMarkup
    );
    assert.deepEqual(await desktopRun("window.verifiedPluginSkill"), {
      name: "自定义组件块",
      source: "plugin",
    });
    while (!(await desktopRun("Boolean(document.querySelector('[data-custom-acceptance]'))"))) {
      if (Date.now() > desktopDeadline)
        throw new Error(
          "桌面 custom-block 挂载超时：" + (await desktopRun("document.body.innerText"))
        );
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(
      await desktopRun("document.querySelector('[data-custom-acceptance]').outerHTML"),
      customMarkup
    );
    assert.equal(
      await run("document.querySelector('[data-custom-acceptance] output').textContent"),
      "4"
    );
    await desktopRun("document.querySelector('[data-custom-acceptance] button').click()");
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(
      await desktopRun("document.querySelector('[data-custom-acceptance] output').textContent"),
      "4"
    );
    assert.equal(await desktopRun("window.insertPublishedCounter()"), 2);
    desktop.destroy();
    assert.equal(
      await run("getComputedStyle(document.querySelector('[data-portable-counter]')).padding"),
      "12px"
    );
    await run("document.querySelector('[data-portable-counter] button').click()");
    const clickDeadline = Date.now() + 3000;
    while (
      (await run("document.querySelector('[data-portable-counter] output').textContent")) !== "8"
    ) {
      if (Date.now() > clickDeadline) throw new Error("交互未更新");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await writeFile(
      path.join(directory, "browser-report.json"),
      JSON.stringify(
        {
          status: "passed",
          cases: [
            "真实 Vite 模板",
            "正式发布器生成",
            "单入口插件动态挂载",
            "桌面正式启动装配与 Markdown codec",
            "实际 custom-block 包启用后 Skill 进入用户技能列表",
            "桌面与博客内容 DOM 一致",
            "样式摘要与加载",
            "只读博客交互 7→8",
            "博客无 Node 集成",
            "真实 custom-block 单包在桌面与博客 DOM 一致",
            "主进程与真实索引线程从同一插件包加载 codec，无静态插件源码依赖",
            "custom-block 动态 Tailwind 13px 编译与博客交互 3→4",
          ],
        },
        null,
        2
      )
    );
    window.destroy();
    app.exit(0);
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
