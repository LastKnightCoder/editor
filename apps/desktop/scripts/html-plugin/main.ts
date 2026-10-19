import { app, BrowserWindow, ipcMain } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginContentStartup } from "../../src-electron/main/services/plugin-content-startup";
import { acceptHeadlessPlugin } from "../../src-electron/main/services/plugin-codecs";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import { inspectPackage } from "../../../plugin-portal/api/package";
import client from "../../package.json";
import tailwindRuntime from "../../src-electron/main/modules/tailwind-runtime";
import {
  readPublishPlugins,
  PublishPluginCatalog,
} from "../../src-electron/main/services/plugin-publish";
import { desktopContentPlugins } from "../../shared/content-plugins";

const [directory, phase, baseUrl] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
app.getVersion = () => client.version;
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    ipcMain.handle("get-home-dir", () => path.join(directory, "home"));
    const packageInfo = await inspectPackage(await readFile(path.join(directory, "plugin.zip")));
    assert.equal(packageInfo.manifest.id, "tau.html");
    const plugins = path.join(directory, "plugins");
    const preferences = new LocalPluginPreferences(plugins);
    await preferences.load();
    if (phase === "initial" || phase === "restored") await preferences.set("tau.html", true);
    if (phase === "disabled") await preferences.set("tau.html", false);
    const enabled = preferences.enabled("tau.html", false);
    await assert.rejects(
      () => readPluginPackage(path.join(plugins, "tau.html"), "0.58.0"),
      /插件需要 Tau/
    );
    const artifact = await readPluginPackage(path.join(plugins, "tau.html"));
    const snapshot = await new PluginContentStartup(async () => artifact).get(
      enabled ? ["tau.html"] : []
    );
    assert.equal(snapshot.artifacts.length, enabled ? 1 : 0);
    if (enabled) {
      acceptHeadlessPlugin(artifact);
      const source = "<div>HTML 块</div>";
      assert.equal(getMarkdown(importFromMarkdown(source)).trim(), source);
    }
    await tailwindRuntime.init();
    const styleSources = desktopContentPlugins.extensions.flatMap(
      extension => extension.styleSources ?? []
    );
    const catalog = new PublishPluginCatalog(
      await readPublishPlugins(plugins, {
        builtinTypes: ["paragraph", "formatted"],
        plugins: enabled
          ? [
              {
                id: "tau.html",
                version: artifact.manifest.version,
                mainHash: artifact.manifest.integrity[artifact.manifest.main],
                stylesHash: artifact.manifest.styles
                  ? artifact.manifest.integrity[artifact.manifest.styles]
                  : undefined,
                nodeTypes: ["html-block", "html-inline"],
                styleSources,
              },
            ]
          : [],
      })
    );
    const block = {
      type: "html-block",
      html: '<div class="p-4">博客块</div>',
      children: [{ type: "formatted", text: "" }],
    };
    const inline = {
      type: "html-inline",
      html: '<b class="font-bold">博客行内</b>',
      children: [{ type: "formatted", text: "" }],
    };
    let entries: unknown[] = [];
    let publishCss = "";
    if (enabled) {
      assert.equal(catalog.styleSources(block)[0].extension, "html");
      assert.equal(catalog.styleSources(inline)[0].code, inline.html);
      entries = catalog.dependencies([block, inline], "index.html");
      for (const file of catalog.files()) {
        const destination = path.join(directory, "published", file.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.content);
      }
      for (const node of [block, inline])
        for (const source of catalog.styleSources(node))
          publishCss += await tailwindRuntime.compileTailwindCss(source.code, source.extension);
      assert.match(publishCss, /padding/);
      assert.match(publishCss, /font-weight/);
    }
    const window = new BrowserWindow({
      show: false,
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
      `window.htmlFixture=${JSON.stringify({ phase, enabled, artifact, baseUrl, entries, publishCss })}`
    );
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const report = await window.webContents.executeJavaScript("window.htmlVerification");
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
