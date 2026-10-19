import { app, BrowserWindow } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { acceptHeadlessPlugin } from "../../src-electron/main/services/plugin-codecs";
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
    assert.equal(packageInfo.manifest.id, "tau.tikz");
    const plugins = path.join(directory, "plugins");
    const preferences = new LocalPluginPreferences(plugins);
    await preferences.load();
    if (phase === "initial" || phase === "restored") await preferences.set("tau.tikz", true);
    if (phase === "disabled") await preferences.set("tau.tikz", false);
    const enabled = preferences.enabled("tau.tikz", false);
    const artifact = await readPluginPackage(path.join(plugins, "tau.tikz"));
    const snapshot = await new PluginContentStartup(async () => artifact).get(
      enabled ? ["tau.tikz"] : []
    );
    assert.equal(snapshot.artifacts.length, enabled ? 1 : 0);
    if (enabled) {
      acceptHeadlessPlugin(artifact);
      const source = "```tikz\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n```";
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
      `window.tikzFixture=${JSON.stringify({ phase, enabled, artifact, baseUrl })}`
    );
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const report = await window.webContents.executeJavaScript("window.tikzVerification");
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
