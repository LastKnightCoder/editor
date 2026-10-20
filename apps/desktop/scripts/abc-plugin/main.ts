import { app, BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { installContentTestFixture } from "../plugin-content-fixture";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import { inspectPackage } from "../../../plugin-portal/api/package";
import client from "../../package.json";

const [directory, phase, baseUrl] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
app.getVersion = () => client.version;
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const packageInfo = await inspectPackage(await readFile(path.join(directory, "plugin.zip")));
    assert.equal(packageInfo.manifest.id, "tau.abc");
    const plugins = path.join(directory, "plugins");
    const preferences = new LocalPluginPreferences(plugins);
    await preferences.load();
    if (phase === "initial" || phase === "restored") await preferences.set("tau.abc", true);
    if (phase === "disabled") await preferences.set("tau.abc", false);
    const enabled = preferences.enabled("tau.abc", false);
    await assert.rejects(
      () => readPluginPackage(path.join(plugins, "tau.abc"), "0.58.0"),
      /插件需要 Tau/
    );
    const artifact = await readPluginPackage(path.join(plugins, "tau.abc"));
    const snapshot = await new PluginContentStartup(async () => artifact).get(
      enabled ? ["tau.abc"] : []
    );
    assert.equal(snapshot.artifacts.length, enabled ? 1 : 0);
    if (enabled) {
      installContentTestFixture(artifact);
      const source = "```abc\nX:1\nK:C\nC D E F |\n```";
      assert.equal(getMarkdown(importFromMarkdown(source)).trim(), source);
    }
    const window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    const externalRequests: string[] = [];
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const external = /^https?:/.test(details.url) && !details.url.startsWith(baseUrl);
      if (external) externalRequests.push(details.url);
      callback({ cancel: external });
    });
    await window.loadURL(baseUrl);
    await window.webContents.executeJavaScript(
      `window.abcFixture=${JSON.stringify({ phase, enabled, artifact, baseUrl })}`
    );
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const report = await window.webContents.executeJavaScript("window.abcVerification");
    assert.equal(externalRequests.length, 0, "编译触发了外部资源请求");
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
