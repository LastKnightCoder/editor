import { app, BrowserWindow, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import services from "../../src-electron/main/modules/plugin-services";
import { inspectPackage } from "../../../plugin-portal/api/package";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { createMarkdownProcessor } from "@tau/markdown";

const [directory, baseUrl] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
app.on("window-all-closed", () => {});
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    await services.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    const info = await inspectPackage(await readFile(path.join(directory, "plugin.zip")));
    assert.equal(info.manifest.id, "tau.typst");
    const artifact = await readPluginPackage(path.join(directory, "plugins/tau.typst"));
    const definition = evaluatePluginPackage(artifact, sharedPluginModules);
    const markdown = createMarkdownProcessor({ codecs: definition.editorCodecs });
    const source = "```typst\n= 标题\n正文\n```";
    assert.equal(markdown.getMarkdown(markdown.importFromMarkdown(source)).trim(), source);
    assert.equal(typeof document, "undefined");
    const results = [];
    for (const role of ["main", "editor-window", "markdown-window", "disabled"]) {
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(directory, "preload.cjs"),
          contextIsolation: true,
          sandbox: false,
        },
      });
      const externalRequests: string[] = [];
      window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        const external = /^https?:/.test(details.url) && !details.url.startsWith(baseUrl);
        if (external) externalRequests.push(details.url);
        callback({ cancel: external });
      });
      window.webContents.on("console-message", (_event, _level, message) =>
        console.log("[renderer]", message)
      );
      await window.loadURL(baseUrl);
      await window.webContents.executeJavaScript(
        `window.typstFixture=${JSON.stringify({ artifact, role, baseUrl })}`
      );
      await window.webContents.executeJavaScript(
        await readFile(path.join(directory, "renderer.js"), "utf8")
      );
      const report = await window.webContents.executeJavaScript("window.typstVerification");
      assert.equal(externalRequests.length, 0);
      await writeFile(
        path.join(directory, `${role}.json`),
        JSON.stringify({ ...report, externalRequests }, null, 2)
      );
      console.log(JSON.stringify(report));
      window.destroy();
      assert.equal(report.ok, true);
      results.push(report);
    }
    await writeFile(
      path.join(directory, "report.json"),
      JSON.stringify({ passed: true, results }, null, 2)
    );
    app.exit(0);
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
