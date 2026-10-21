import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import localModule from "../../src-electron/main/modules/plugin-local";
import AdmZip from "adm-zip";
import client from "../../package.json";
import { createDriver } from "./driver";

const [phase, directory] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
app.getVersion = () => client.version;
const plugins = path.join(
  process.env.TAU_LOCAL_TEST_APP_DIR ?? path.join(directory, "app-data"),
  "plugins"
);
async function put(version = "1.0.0", destination = plugins) {
  const location = path.join(destination, "example.local");
  await mkdir(location, { recursive: true });
  const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'example.local',name:'本地验证',version:'${version}',create:()=>({activate(ctx){ctx.commands.register({id:'run',title:'运行验证',run:async()=>{const count=((await ctx.storage.get('count'))||0)+1;await ctx.storage.set('count',count);return {count,version:'${version}'};}});}})});`;
  await writeFile(path.join(location, "main.js"), code);
  await writeFile(
    path.join(location, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      apiVersion: 1,
      id: "example.local",
      name: "本地验证",
      version,
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    })
  );
}
app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    if (phase === "update-start") {
      await put();
      await put("1.1.0", path.join(directory, "build"));
      const archive = new AdmZip();
      archive.addLocalFolder(path.join(directory, "build/example.local"), "example.local");
      archive.writeZip(path.join(directory, "update.zip"));
      const manifest = JSON.parse(
        await readFile(path.join(directory, "build/example.local/manifest.json"), "utf8")
      );
      manifest.minAppVersion = "99.0.0";
      archive.updateFile("example.local/manifest.json", Buffer.from(JSON.stringify(manifest)));
      archive.writeZip(path.join(directory, "incompatible.zip"));
      delete manifest.minAppVersion;
      manifest.version = "1.2.0";
      const broken =
        "module.exports.default=require('@tau/plugins').definePlugin({id:'example.local',name:'本地验证',version:'1.2.0',create:()=>({activate(){throw new Error('更新激活故障')}})});";
      manifest.integrity["main.js"] = createHash("sha256").update(broken).digest("hex");
      archive.updateFile("example.local/manifest.json", Buffer.from(JSON.stringify(manifest)));
      archive.updateFile("example.local/main.js", Buffer.from(broken));
      archive.writeZip(path.join(directory, "failing.zip"));
    }
    let selectedZip = path.join(directory, "update.zip");
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedZip] });
    if (phase === "initial") {
      await put();
      await mkdir(path.join(plugins, "broken"));
    }
    if (phase === "reinstall") await put("1.1.0");
    await localModule.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    let opens = 0;
    shell.openPath = async target => {
      assert.equal(target, plugins);
      opens++;
      return "";
    };
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(directory, "preload.cjs"),
      },
    });
    await window.loadFile(path.join(directory, "index.html"));
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const { run, wait, click, menu } = createDriver(window, 15000);
    const pluginMenu = (item: string) => menu("更多插件操作", item);
    await wait(
      "Boolean(window.localTest) && localTest.snapshot().ready !== false && !localTest.snapshot().busy && Boolean(localTest.snapshot().directory)"
    );
    assert.equal(await run("localTest.snapshot().directory"), plugins);
    await pluginMenu("打开插件目录");
    for (const deadline = Date.now() + 5000; opens === 0 && Date.now() < deadline;)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(opens, 1);
    if (phase.startsWith("update-")) {
      // 普通插件的 ZIP 安装与恢复上一版立即落盘并热替换；激活失败时内存回退旧实例，重启后按磁盘版本加载。
      const local = "localTest.snapshot().plugins.find(p=>p.id==='example.local')";
      const version = (value: string) =>
        wait(
          `${local}?.version==='${value}' && ${local}?.state==='active' && !localTest.snapshot().busy`
        );
      if (phase === "update-start") {
        await click("启用 本地验证");
        await wait("localTest.snapshot().commands.length===1");
        assert.deepEqual(await run("localTest.run()"), { count: 1, version: "1.0.0" });
        selectedZip = path.join(directory, "incompatible.zip");
        await pluginMenu("从 ZIP 安装…");
        await wait("document.body.innerText.includes('需要 Tau 99.0.0')");
        selectedZip = path.join(directory, "update.zip");
        await pluginMenu("从 ZIP 安装…");
        await version("1.1.0");
        assert.deepEqual(await run("localTest.run()"), { count: 2, version: "1.1.0" });
        await menu("本地验证 的更多操作", "恢复上一版 1.0.0");
        await version("1.0.0");
        assert.deepEqual(await run("localTest.run()"), { count: 3, version: "1.0.0" });
      } else if (phase === "update-restart") {
        await version("1.0.0");
        assert.deepEqual(await run("localTest.run()"), { count: 4, version: "1.0.0" });
        selectedZip = path.join(directory, "failing.zip");
        await pluginMenu("从 ZIP 安装…");
        await wait(
          "localTest.snapshot().issues.some(e=>e.includes('已恢复旧版本')) && !localTest.snapshot().busy"
        );
        await version("1.0.0");
        assert.deepEqual(await run("localTest.run()"), { count: 5, version: "1.0.0" });
      } else if (phase === "update-failed") {
        await wait(`${local}?.version==='1.2.0' && ${local}?.state==='failed'`);
        assert.equal(await run("localTest.snapshot().commands.length"), 0);
        await menu("本地验证 的更多操作", "恢复上一版 1.0.0");
        await version("1.0.0");
        assert.deepEqual(await run("localTest.run()"), { count: 6, version: "1.0.0" });
      } else {
        await version("1.0.0");
        assert.deepEqual(await run("localTest.run()"), { count: 7, version: "1.0.0" });
      }
    } else if (phase === "author" || phase === "author-restore") {
      const state = await run(
        "localTest.snapshot().plugins.find(p=>p.id==='example.external-counter')?.state"
      );
      assert.equal(state, phase === "author" ? "disabled" : "active");
      if (phase === "author") await click("启用 计数器示例");
      await wait("localTest.snapshot().commands.some(c=>c.id==='example.external-counter:open')");
      await run("localTest.openAuthor()");
      await wait(`document.body.innerText.includes('已保存计数：${phase === "author" ? 0 : 1}')`);
      if (phase === "author") {
        await click("增加并保存");
        await wait("document.body.innerText.includes('已保存计数：1')");
      }
    } else if (phase === "initial") {
      assert.equal(
        await run("localTest.snapshot().plugins.find(p=>p.id==='example.local').state"),
        "disabled"
      );
      assert.equal(await run("localTest.snapshot().issues.length"), 1);
      await click("启用 本地验证");
      await wait("localTest.snapshot().commands.length===1");
      assert.deepEqual(await run("localTest.run()"), { count: 1, version: "1.0.0" });
    } else if (phase === "refresh") {
      assert.deepEqual(await run("localTest.run()"), { count: 2, version: "1.0.0" });
      await put("1.1.0");
      await pluginMenu("重新扫描");
      await wait("!localTest.snapshot().busy");
      // 运行中的普通插件重新扫描即热替换，数据保留。
      assert.equal(
        await run("localTest.snapshot().issues.some(e=>e.includes('文件已更新'))"),
        false
      );
      assert.deepEqual(await run("localTest.run()"), { count: 3, version: "1.1.0" });
      await click("停用 本地验证");
      await wait("!localTest.snapshot().busy");
      await pluginMenu("重新扫描");
      await wait("!localTest.snapshot().busy");
      await click("启用 本地验证");
      await wait("localTest.snapshot().commands.length===1");
      assert.deepEqual(await run("localTest.run()"), { count: 4, version: "1.1.0" });
      await rm(path.join(plugins, "example.local"), { recursive: true });
      await pluginMenu("重新扫描");
      await wait("!localTest.snapshot().busy");
      assert.equal(await run("localTest.snapshot().plugins.length"), 0);
      assert.equal(await run("localTest.snapshot().commands.length"), 0);
    } else if (phase === "reinstall") {
      assert.deepEqual(await run("localTest.run()"), { count: 5, version: "1.1.0" });
      await click("停用 本地验证");
      await wait("!localTest.snapshot().busy");
    } else {
      assert.equal(
        await run("localTest.snapshot().plugins.find(p=>p.id==='example.local').state"),
        "disabled"
      );
    }
    const snapshot = await run("localTest.snapshot()");
    await run("localTest.stop()");
    window.webContents.session.flushStorageData();
    await writeFile(
      path.join(directory, phase + ".json"),
      JSON.stringify({
        phase,
        electron: process.versions.electron,
        snapshot,
      })
    );
    window.destroy();
    app.quit();
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
