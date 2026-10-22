import { app, BrowserWindow, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { inspectPackage } from "../../../plugin-portal/api/package";
import client from "../../package.json";

const ID = "tau.image-gallery";
const [directory, phase, baseUrl] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
app.getVersion = () => client.version;
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    ipcMain.handle("get-home-dir", () => path.join(directory, "home"));
    // 与插件中心同一套包检查：清单、摘要与文件白名单
    const packageInfo = await inspectPackage(await readFile(path.join(directory, "plugin.zip")));
    assert.equal(packageInfo.manifest.id, ID);
    const plugins = path.join(directory, "plugins");
    const preferences = new LocalPluginPreferences(plugins);
    await preferences.load();
    if (phase === "initial" || phase === "restored") await preferences.set(ID, true);
    if (phase === "disabled") await preferences.set(ID, false);
    const enabled = preferences.enabled(ID, false);
    await assert.rejects(() => readPluginPackage(path.join(plugins, ID), "0.58.0"), /插件需要 Tau/);
    const artifact = await readPluginPackage(path.join(plugins, ID));
    const snapshot = await new PluginContentStartup(async () => artifact).get(enabled ? [ID] : []);
    assert.equal(snapshot.artifacts.length, enabled ? 1 : 0);

    const window = new BrowserWindow({
      show: false,
      width: 1000,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        preload: path.join(directory, "preload.cjs"),
      },
    });
    const externalRequests: string[] = [];
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const external = /^https?:/.test(details.url) && !details.url.startsWith(baseUrl);
      if (external) externalRequests.push(details.url);
      callback({ cancel: external });
    });
    await window.loadURL(baseUrl);
    await window.webContents.executeJavaScript(
      `window.galleryFixture=${JSON.stringify({ phase, enabled, artifact })}`
    );
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const report = await window.webContents.executeJavaScript("window.galleryVerification");
    assert.equal(externalRequests.length, 0, "渲染触发了外部资源请求");
    await writeFile(
      path.join(directory, `${phase}.json`),
      JSON.stringify({ ...report, externalRequests }, null, 2)
    );
    console.log(JSON.stringify(report));
    window.destroy();
    app.exit(report.ok ? 0 : 1);
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
