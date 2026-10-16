import { app, BrowserWindow, ipcMain, shell } from "electron";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import localModule from "../../src-electron/main/modules/plugin-local";

const [phase, directory] = process.argv.slice(2);
app.setPath("userData", path.join(directory, "profile"));
const plugins = path.join(
  process.env.TAU_LOCAL_TEST_APP_DIR ?? path.join(directory, "app-data"),
  "plugins"
);
async function put(version = "1.0.0") {
  const location = path.join(plugins, "example.local");
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
    const run = (code: string) => window.webContents.executeJavaScript(code);
    async function wait(code: string) {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await run(code)) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw Error("验证超时：" + code + "\n" + (await run("document.body.innerText")));
    }
    async function click(label: string) {
      const expression = `[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent===${JSON.stringify(label)})&&!b.disabled)`;
      await wait(`Boolean(${expression})`);
      await run(`${expression}.click()`);
    }
    await wait(
      "Boolean(window.localTest) && localTest.snapshot().ready !== false && !localTest.snapshot().busy && Boolean(localTest.snapshot().directory)"
    );
    assert.equal(await run("document.body.innerText.includes('选择开发插件目录')"), false);
    assert.equal(await run("localTest.snapshot().directory"), plugins);
    await click("打开插件目录");
    await wait("!document.querySelector('button[disabled]')");
    assert.equal(opens, 1);
    if (phase.startsWith("water")) {
      const sidebarButton = `document.querySelector('nav button[aria-label="喝水打卡"]')`;
      const openWaterSidebar = async () => {
        await wait(`Boolean(${sidebarButton})`);
        assert.equal(
          await run(`${sidebarButton}.querySelector('svg path')?.getAttribute('d')`),
          "M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"
        );
        assert.equal(
          await run(`${sidebarButton}.querySelector('svg')?.getAttribute('stroke')`),
          "currentColor"
        );
        await run(`${sidebarButton}.click()`);
        await wait(`${sidebarButton}?.getAttribute('aria-current') === 'page'`);
      };
      const state =
        "localTest.snapshot().plugins.find(p=>p.id==='lastknight.water-checkin')?.state";
      const hasCommand =
        "localTest.snapshot().commands.some(c=>c.id==='lastknight.water-checkin:open')";
      assert.equal(await run(state), phase === "water-restore" ? "active" : "disabled");
      if (phase === "water") await click("启用 喝水打卡");
      if (phase !== "water-disabled") {
        await wait(hasCommand);
        await openWaterSidebar();
        assert.equal(
          await run(`Boolean(document.querySelector('nav button[title="收起「习惯」"]'))`),
          true
        );
        await wait(`document.body.innerText.includes('已喝水：${phase === "water" ? 0 : 2} 杯')`);
        assert.equal(await run("localTest.snapshot().styles"), 1);
        if (phase === "water") {
          await click("喝了一杯");
          await wait("document.body.innerText.includes('已喝水：1 杯')");
          await click("喝了一杯");
          await wait("document.body.innerText.includes('已喝水：2 杯')");
          await run("localTest.list()");
          await click("停用 喝水打卡");
          await wait(`!${hasCommand}`);
          assert.equal(await run("localTest.snapshot().styles"), 0);
          assert.equal(await run(`Boolean(${sidebarButton})`), false);
          assert.equal(
            await run(`Boolean(document.querySelector('nav button[title="收起「习惯」"]'))`),
            false
          );
          await click("启用 喝水打卡");
          await wait(hasCommand);
          await run("localTest.openWater()");
          await wait("document.body.innerText.includes('已喝水：2 杯')");
          await wait(`${sidebarButton}?.getAttribute('aria-current') === 'page'`);
        } else {
          await click("清零");
          await wait("document.body.innerText.includes('已喝水：0 杯')");
          await click("喝了一杯");
          await wait("document.body.innerText.includes('已喝水：1 杯')");
          const originalWorkspace = await run("localTest.snapshot().workspaceId");
          await run("localTest.switchWorkspace('water-author-b')");
          await wait(
            `localTest.snapshot().ready && localTest.snapshot().workspaceId !== ${JSON.stringify(originalWorkspace)} && ${hasCommand}`
          );
          await openWaterSidebar();
          await wait("document.body.innerText.includes('已喝水：0 杯')");
          await click("喝了一杯");
          await wait("document.body.innerText.includes('已喝水：1 杯')");
          await click("喝了一杯");
          await wait("document.body.innerText.includes('已喝水：2 杯')");
          await run("localTest.switchWorkspace('water-author-a')");
          await wait(
            `localTest.snapshot().ready && localTest.snapshot().workspaceId === ${JSON.stringify(originalWorkspace)} && ${hasCommand}`
          );
          await openWaterSidebar();
          await wait("document.body.innerText.includes('已喝水：1 杯')");
          await run("localTest.list()");
          await click("停用 喝水打卡");
          await wait(`!${hasCommand}`);
        }
      } else {
        assert.equal(await run(hasCommand), false);
        assert.equal(await run("localTest.snapshot().styles"), 0);
        assert.equal(await run(`Boolean(${sidebarButton})`), false);
      }
    } else if (phase === "author" || phase === "author-restore") {
      const state = await run(
        "localTest.snapshot().plugins.find(p=>p.id==='example.external-counter')?.state"
      );
      assert.equal(state, phase === "author" ? "disabled" : "active");
      if (phase === "author") await click("启用 独立计数插件");
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
      await click("刷新列表");
      await wait("!localTest.snapshot().busy");
      assert.equal(
        await run("localTest.snapshot().issues.some(e=>e.includes('文件已更新'))"),
        true
      );
      assert.deepEqual(await run("localTest.run()"), { count: 3, version: "1.0.0" });
      await click("停用 本地验证");
      await wait("!localTest.snapshot().busy");
      await click("刷新列表");
      await wait("!localTest.snapshot().busy");
      await click("启用 本地验证");
      await wait("localTest.snapshot().commands.length===1");
      assert.deepEqual(await run("localTest.run()"), { count: 4, version: "1.1.0" });
      await rm(path.join(plugins, "example.local"), { recursive: true });
      await click("刷新列表");
      await wait("!localTest.snapshot().busy");
      assert.equal(await run("localTest.snapshot().plugins.length"), 1);
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
      JSON.stringify({ phase, electron: process.versions.electron, snapshot })
    );
    window.destroy();
    app.quit();
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
