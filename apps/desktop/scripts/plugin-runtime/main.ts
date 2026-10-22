import { app, BrowserWindow, ipcMain } from "electron";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import localModule from "../../src-electron/main/modules/plugin-local";
import client from "../../package.json";
import { createDriver } from "./driver";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
};
const directory = env("TAU_PLUGIN_TEST_DIRECTORY");
const phase = env("TAU_PLUGIN_TEST_PHASE");
const plugins = path.join(env("TAU_LOCAL_TEST_APP_DIR"), "plugins");
const fixture = (name: string) => env(`TAU_PLUGIN_TEST_${name}`);
const COUNTER = "example.external-counter";
const OTHER = "example.external-other";
app.setPath("userData", path.join(directory, "profile"));
app.getVersion = () => client.version;

/** 与作者执行 install:local 的落盘结果一致：插件目录下按 ID 放置构建产物。 */
async function install(id: string, source: string) {
  await rm(path.join(plugins, id), { recursive: true, force: true });
  await cp(source, path.join(plugins, id), { recursive: true });
}

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    await localModule.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    // 验收不访问插件门户，目录与社区接口按离线处理。
    for (const channel of ["catalog", "release", "versions", "community"]) {
      ipcMain.removeHandler(`plugin-local:${channel}`);
      ipcMain.handle(`plugin-local:${channel}`, () => {
        throw new Error("验收环境离线");
      });
    }
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
    const { run, wait, click, menu, text } = createDriver(window);
    type Snapshot = {
      plugins: { id: string; state: string; version: string }[];
      commands: { pluginId: string }[];
      styles: number;
      settingsCount: number;
      mountId?: string;
      workspaceId: string;
      issues: string[];
      errors: Record<string, string | null>;
    };
    const snapshot = () => run<Snapshot>("pluginVerification.snapshot()");
    const plugin = async (id: string) => (await snapshot()).plugins.find(item => item.id === id);
    const idle = "pluginVerification.snapshot().ready && !pluginVerification.snapshot().busy";
    const stateIs = (id: string, state: string) =>
      wait(
        `pluginVerification.snapshot().plugins.find(p => p.id === ${JSON.stringify(id)})?.state === ${JSON.stringify(state)} && ${idle}`
      );
    const rescan = async () => {
      await run("pluginVerification.list()");
      await menu("更多插件操作", "重新扫描");
      await wait(idle);
    };
    const counterSettings = async (count: number) => {
      await run(`pluginVerification.detail(${JSON.stringify(COUNTER)}, "settings")`);
      await text(`已保存计数：${count}`);
    };
    const toggle = async (label: string) => {
      await run("pluginVerification.list()");
      await click(label);
    };
    await wait("Boolean(window.pluginVerification)");
    await wait(idle);
    assert.equal(await run("pluginVerification.snapshot().directory"), plugins);

    if (phase === "initial") {
      // 同 URL 在 revoke 后仍命中模块缓存；裸宿主导入也不能直接解析。
      const esm = await run(
        `(async()=>{const url=URL.createObjectURL(new Blob(['export const token = {}'],{type:'text/javascript'}));const first=await import(url);URL.revokeObjectURL(url);const second=await import(url);let bareRejected=false;try{await import('@tau/plugins')}catch{bareRejected=true}return {cached:first===second,bareRejected};})()`
      );
      assert.deepEqual(esm, { cached: true, bareRejected: true });
      assert.equal((await plugin(COUNTER))?.state, "disabled", "新安装的插件默认停用");
      assert.equal((await snapshot()).commands.length, 0);
      assert.equal((await snapshot()).styles, 0);
      await click("启用 计数器示例");
      await stateIs(COUNTER, "active");
      await run(`pluginVerification.open(${JSON.stringify(COUNTER)})`);
      await text("已保存计数：0");
      assert.equal(
        await run(
          "getComputedStyle(document.querySelector('.example-counter'),'::before').maskImage.includes('data:image/svg+xml')"
        ),
        true
      );
      await click("增加并保存");
      await text("已保存计数：1");
      await click("说明");
      await wait("document.querySelector('[role=dialog]') !== null");
      await run("pluginVerification.back()");
      await toggle("停用 计数器示例");
      await stateIs(COUNTER, "disabled");
      assert.equal((await snapshot()).styles, 0);
      assert.equal((await snapshot()).commands.length, 0);
      await run(`pluginVerification.detail(${JSON.stringify(COUNTER)}, "settings")`);
      await text("插件设置暂不可用");
      await click("启用 计数器示例");
      await stateIs(COUNTER, "active");
      await text("已保存计数：1");
      await click("增加并保存");
      await text("已保存计数：2");

      await install(OTHER, fixture("SECOND"));
      await rescan();
      assert.equal((await plugin(OTHER))?.state, "disabled");
      await click("启用 计数器示例二");
      await stateIs(OTHER, "active");
      assert.equal((await snapshot()).commands.length, 2);
      await run(`pluginVerification.detail(${JSON.stringify(OTHER)}, "settings")`);
      await text("已保存计数：0");

      // 重新扫描替换运行中的插件：成功升级保留数据，故障版本回退旧实例。
      await install(COUNTER, fixture("REPLACEMENT"));
      await rescan();
      assert.equal((await plugin(COUNTER))?.version, "1.1.0");
      await stateIs(COUNTER, "active");
      await counterSettings(2);
      await install(COUNTER, fixture("FAILING"));
      await rescan();
      assert.equal(
        (await snapshot()).issues.some(issue => issue.includes("已恢复旧版本")),
        true,
        "故障版本应回退"
      );
      await stateIs(COUNTER, "active");
      await install(COUNTER, fixture("REPLACEMENT"));
      await rescan();
      assert.equal((await snapshot()).issues.length, 0);
      const heapBefore = await run("performance.memory?.usedJSHeapSize ?? null");
      for (let index = 0; index < 10; index++) {
        await install(COUNTER, fixture(index % 2 ? "REPLACEMENT" : "ARTIFACT"));
        await rescan();
        await stateIs(COUNTER, "active");
        const current = await snapshot();
        assert.equal(current.commands.length, 2);
        assert.equal(current.styles, 2);
        assert.equal(current.settingsCount, 2);
      }
      assert.equal((await plugin(COUNTER))?.version, "1.1.0");
      console.log("[plugin-rescan] 升级/故障回退/连续 10 次替换的贡献与 CSS 数量通过；堆观察", {
        before: heapBefore,
        after: await run("performance.memory?.usedJSHeapSize ?? null"),
      });

      await run(`pluginVerification.open(${JSON.stringify(COUNTER)})`);
      await text("已保存计数：2");
      const workspaceA = (await snapshot()).workspaceId;
      const cleanup = await run("pluginVerification.switchWorkspace('runtime-verification-b')");
      assert.deepEqual(cleanup, { aborted: true, commands: 0, styles: 0, lateWriteRejected: true });
      await wait(
        `${idle} && pluginVerification.snapshot().workspaceId !== ${JSON.stringify(workspaceA)}`
      );
      await stateIs(COUNTER, "active");
      await stateIs(OTHER, "active");
      await counterSettings(0);
      await click("增加并保存");
      await text("已保存计数：1");
      await run("pluginVerification.switchWorkspace('runtime-verification')");
      await wait(
        `${idle} && pluginVerification.snapshot().workspaceId === ${JSON.stringify(workspaceA)}`
      );
      await counterSettings(2);
      console.log("[plugin-workspace] 双工作区数据隔离/旧上下文拒绝/返回恢复通过");
    } else if (phase === "restore") {
      await stateIs(COUNTER, "active");
      await stateIs(OTHER, "active");
      assert.equal((await plugin(COUNTER))?.version, "1.1.0");
      assert.equal((await snapshot()).commands.length, 2);
      await counterSettings(2);
      await toggle("停用 计数器示例");
      await stateIs(COUNTER, "disabled");
    } else if (phase === "disabled") {
      assert.equal((await plugin(COUNTER))?.state, "disabled", "停用意图跨重启保留");
      await stateIs(OTHER, "active");
      assert.equal((await snapshot()).commands.length, 1);
      assert.equal((await snapshot()).styles, 1);
      await click("启用 计数器示例");
      await stateIs(COUNTER, "active");
    } else if (phase === "missing" || phase === "incompatible") {
      // 包不可用的插件不进入宿主，只作为问题展示，且不影响其他插件。
      assert.equal(await plugin(COUNTER), undefined);
      assert.equal((await snapshot()).issues.length, 1);
      await stateIs(OTHER, "active");
      assert.equal((await snapshot()).commands.length, 1);
      assert.equal((await snapshot()).styles, 1);
      await text("需要处理");
    } else if (phase.startsWith("recover-")) {
      if (phase === "recover-cleanup") {
        assert.equal((await plugin(COUNTER))?.state, "disabled");
        await click("启用 计数器示例");
      }
      await stateIs(COUNTER, "active");
      assert.equal((await snapshot()).issues.length, 0);
      await counterSettings(2);
    } else if (phase === "failed-install" || phase === "timeout") {
      await stateIs(COUNTER, phase === "timeout" ? "restart-required" : "failed");
      if (phase === "failed-install")
        assert.match((await snapshot()).errors[COUNTER] ?? "", /重载验证故障/);
      await stateIs(OTHER, "active");
      assert.equal((await snapshot()).commands.length, 1);
      assert.equal((await snapshot()).styles, 1);
    } else if (phase === "cleanup") {
      await stateIs(COUNTER, "active");
      await toggle("停用 计数器示例");
      await stateIs(COUNTER, "restart-required");
      assert.equal((await snapshot()).commands.length, 1);
      await stateIs(OTHER, "active");
    } else throw new Error(`未知阶段：${phase}`);

    const report = await snapshot();
    await run("pluginVerification.stop()");
    assert.equal((await snapshot()).styles, 0);
    window.webContents.session.flushStorageData();
    await mkdir(path.join(directory, "reports"), { recursive: true });
    await writeFile(
      path.join(directory, "reports", `${phase}.json`),
      JSON.stringify(
        {
          phase,
          status: "passed",
          platform: process.platform,
          arch: process.arch,
          electron: process.versions.electron,
          node: process.versions.node,
          snapshot: report,
        },
        null,
        2
      )
    );
    window.destroy();
    console.log(`[plugin-runtime] 独立进程验证通过：${phase}`);
    app.quit();
  })
  .catch(async error => {
    console.error(error);
    await mkdir(path.join(directory, "reports"), { recursive: true });
    await writeFile(
      path.join(directory, "reports", `${phase}.json`),
      JSON.stringify({ phase, status: "failed", error: String(error) }, null, 2)
    );
    app.exit(1);
  });
