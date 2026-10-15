const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const {
  readFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  renameSync,
} = require("node:fs");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const assert = require("node:assert/strict");

const directory = process.env.TAU_PLUGIN_TEST_DIRECTORY;
app.setPath("userData", path.join(directory, "profile"));
process.env.VITE_DEV_SERVER_URL = "http://localhost/verification";
process.env.TAU_DISABLE_DEV_PLUGINS = process.env.TAU_PLUGIN_TEST_PHASE === "skip" ? "1" : "0";
const phase = process.env.TAU_PLUGIN_TEST_PHASE;
mkdirSync(path.join(directory, "reports"), { recursive: true });
const reportFile = path.join(directory, "reports", `${phase}.json`);

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    await require(path.join(directory, "service.cjs")).default.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    let selected = process.env.TAU_PLUGIN_TEST_ARTIFACT;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
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
      readFileSync(path.join(directory, "renderer.js"), "utf8")
    );
    const run = expression => window.webContents.executeJavaScript(expression);
    async function wait(expression) {
      const end = Date.now() + 20000;
      while (Date.now() < end) {
        if (await run(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(
        "验证等待失败：" + expression + "\n" + (await run("document.body.innerText"))
      );
    }
    async function click(text) {
      const expression = `[...document.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(text)} && !button.disabled && button.getClientRects().length)`;
      await wait(`Boolean(${expression})`);
      await run(`${expression}.click()`);
    }
    await wait("Boolean(window.pluginVerification)");
    await wait("pluginVerification.snapshot().ready");
    const finish = async () => {
      const snapshot = await run("pluginVerification.snapshot()");
      await run("pluginVerification.stop()");
      assert.equal((await run("pluginVerification.snapshot()")).styles, 0);
      writeFileSync(
        reportFile,
        JSON.stringify(
          {
            phase,
            status: "passed",
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            node: process.versions.node,
            snapshot,
          },
          null,
          2
        )
      );
      window.destroy();
      console.log(`[plugin-runtime] 独立进程验证通过：${phase}`);
      app.quit();
    };
    const counter = "example.external-counter";
    const managed = () => run("pluginVerification.snapshot()");
    const openCounter = async () => {
      await run("pluginVerification.settings('example.external-counter')");
    };
    const chooseCounter = async source => {
      selected = source;
      await run("pluginVerification.list()");
      await click("选择开发插件目录");
      await wait("pluginVerification.snapshot().plugins.length === 2");
      await openCounter();
    };
    if (
      [
        "remove",
        "removed",
        "missing",
        "incompatible",
        "recover-missing",
        "recover-incompatible",
        "failed-install",
        "failed-restart",
        "timeout",
        "cleanup",
        "recover-cleanup",
      ].includes(phase)
    ) {
      const snapshot = await managed();
      assert.equal(snapshot.watching, false);
      if (phase === "removed") {
        assert.equal(snapshot.plugins.length, 1);
        assert.equal(
          snapshot.plugins.some(item => item.id === counter),
          false
        );
        assert.equal(
          snapshot.commands.some(item => item.pluginId === counter),
          false
        );
        assert.equal(existsSync(path.join(process.env.TAU_PLUGIN_TEST_ARTIFACT, "main.js")), true);
        await chooseCounter(process.env.TAU_PLUGIN_TEST_ARTIFACT);
        await click("启用");
        await wait("document.body.innerText.includes('已保存计数：2')");
      } else if (phase === "remove") {
        await openCounter();
        await click("移除登记");
        await wait("pluginVerification.snapshot().plugins.length === 1");
      } else if (phase === "missing" || phase === "incompatible") {
        assert.equal(snapshot.plugins.find(item => item.id === counter).state, "disabled");
        assert.equal(
          snapshot.plugins.find(item => item.id === "example.external-other").state,
          "active"
        );
        assert.equal(typeof snapshot.errors[counter], "string");
        assert.equal(snapshot.commands.length, 1);
        assert.equal(snapshot.styles, 1);
        await openCounter();
        await click("停用");
        await wait("!pluginVerification.snapshot().enabled['example.external-counter']");
      } else if (phase === "recover-missing" || phase === "recover-incompatible") {
        await openCounter();
        await click("启用");
        await wait("document.body.innerText.includes('已保存计数：2')");
      } else if (phase === "failed-restart" || phase === "recover-cleanup") {
        if (phase === "failed-restart") assert.match(snapshot.errors[counter], /上次启动未完成/);
        assert.equal(snapshot.commands.length, 1);
        await openCounter();
        await click("移除登记");
        await wait("pluginVerification.snapshot().plugins.length === 1");
        await chooseCounter(process.env.TAU_PLUGIN_TEST_ARTIFACT);
        await click("启用");
        await wait("document.body.innerText.includes('已保存计数：2')");
      } else {
        if (phase === "cleanup") assert.match(snapshot.errors[counter], /上次启动未完成/);
        await openCounter();
        await click("移除登记");
        await wait("pluginVerification.snapshot().plugins.length === 1");
        await chooseCounter(
          phase === "failed-install"
            ? process.env.TAU_PLUGIN_TEST_FAILING
            : phase === "timeout"
              ? process.env.TAU_PLUGIN_TEST_HANGING
              : process.env.TAU_PLUGIN_TEST_CLEANUP
        );
        await click("启用");
        if (phase === "cleanup") {
          await wait(
            "pluginVerification.snapshot().plugins.find(item => item.id === 'example.external-counter').state === 'active'"
          );
          await click("停用");
        }
        if (phase === "failed-install")
          await wait(
            "pluginVerification.snapshot().errors['example.external-counter']?.includes('重载验证故障') && !pluginVerification.snapshot().reloading"
          );
        else
          await wait(
            "pluginVerification.snapshot().plugins.find(item => item.id === 'example.external-counter').state === 'restart-required' && !pluginVerification.snapshot().reloading"
          );
        assert.equal((await managed()).commands.length, 1);
        assert.equal((await managed()).styles, 1);
      }
      await finish();
      return;
    }
    if (process.env.TAU_PLUGIN_TEST_PHASE !== "initial") {
      const snapshot = await run("pluginVerification.snapshot()");
      assert.equal(snapshot.plugins.length, 2);
      assert.equal(snapshot.watching, false);
      if (process.env.TAU_PLUGIN_TEST_PHASE === "skip") {
        assert.equal(snapshot.commands.length, 0);
        assert.equal(snapshot.styles, 0);
      } else if (process.env.TAU_PLUGIN_TEST_PHASE === "disabled") {
        assert.equal(
          snapshot.plugins.find(item => item.id === "example.external-counter").state,
          "disabled"
        );
        assert.equal(
          snapshot.plugins.find(item => item.id === "example.external-other").state,
          "active"
        );
      } else {
        assert.equal(snapshot.commands.length, 2);
        assert.equal(
          snapshot.plugins.find(item => item.id === "example.external-counter").version,
          "1.1.0"
        );
        await run("pluginVerification.settings('example.external-counter')");
        await wait("document.body.innerText.includes('已保存计数：2')");
        await click("移除登记");
        await wait("pluginVerification.snapshot().plugins.length === 1");
        assert.equal(existsSync(path.join(process.env.TAU_PLUGIN_TEST_ARTIFACT, "main.js")), true);
        await run("pluginVerification.list()");
        await click("选择开发插件目录");
        await wait("pluginVerification.snapshot().plugins.length === 2");
        await click("启用");
        await run("pluginVerification.settings('example.external-counter')");
        await wait("document.body.innerText.includes('已保存计数：2')");
        await click("停用");
        await wait(
          "pluginVerification.snapshot().plugins.find(item => item.id === 'example.external-counter').state === 'disabled'"
        );
      }
      await finish();
      return;
    }
    // 同 URL 在 revoke 后仍命中模块缓存；裸宿主导入也不能直接解析。
    const esm = await run(
      `(async()=>{const url=URL.createObjectURL(new Blob(['export const token = {}'],{type:'text/javascript'}));const first=await import(url);URL.revokeObjectURL(url);const second=await import(url);let bareRejected=false;try{await import('@tau/plugins')}catch{bareRejected=true}return {cached:first===second,bareRejected};})()`
    );
    assert.deepEqual(esm, { cached: true, bareRejected: true });
    await click("选择开发插件目录");
    await wait("pluginVerification.snapshot().plugins.length === 1");
    assert.equal((await run("pluginVerification.snapshot()")).commands.length, 0);
    assert.equal((await run("pluginVerification.snapshot()")).styles, 0);
    await click("选择开发插件目录");
    await wait("document.body.innerText.includes('插件已注册')");
    await click("启用");
    await wait("pluginVerification.snapshot().plugins[0].state === 'active'");
    await run("pluginVerification.open('example.external-counter')");
    await wait("document.body.innerText.includes('已保存计数：0')");
    assert.equal(
      await run(
        "getComputedStyle(document.querySelector('.example-counter'),'::before').maskImage.includes('data:image/svg+xml')"
      ),
      true
    );
    await click("增加并保存");
    await wait("document.body.innerText.includes('已保存计数：1')");
    await click("说明");
    await wait("document.querySelector('.tau-ui-portals [role=dialog]') !== null");
    await run("pluginVerification.back()");
    await click("停用");
    await wait("pluginVerification.snapshot().plugins[0].state === 'disabled'");
    assert.equal((await run("pluginVerification.snapshot()")).styles, 0);
    await run("pluginVerification.settings('example.external-counter')");
    await wait("document.body.innerText.includes('插件设置暂不可用')");
    await click("启用");
    await wait("document.body.innerText.includes('已保存计数：1')");
    await click("增加并保存");
    await wait("document.body.innerText.includes('已保存计数：2')");
    await run("pluginVerification.list()");
    selected = process.env.TAU_PLUGIN_TEST_SECOND;
    await click("选择开发插件目录");
    await wait("pluginVerification.snapshot().plugins.length === 2");
    await click("启用");
    await wait("pluginVerification.snapshot().commands.length === 2");
    await run("pluginVerification.settings('example.external-other')");
    await wait("document.body.innerText.includes('已保存计数：0')");
    await run("pluginVerification.settings('example.external-counter')");
    const heapBefore = await run("performance.memory?.usedJSHeapSize ?? null");
    selected = process.env.TAU_PLUGIN_TEST_REPLACEMENT;
    await click("重载构建");
    await wait("!pluginVerification.snapshot().reloading");
    assert.equal(
      (await run("pluginVerification.snapshot()")).plugins.find(
        item => item.id === "example.external-counter"
      ).version,
      "1.1.0"
    );
    await wait("document.body.innerText.includes('已保存计数：2')");
    selected = process.env.TAU_PLUGIN_TEST_FAILING;
    await click("重载构建");
    await wait("document.body.innerText.includes('已恢复旧版本')");
    await wait("!pluginVerification.snapshot().reloading");
    assert.equal(
      (await run("pluginVerification.snapshot()")).plugins.find(
        item => item.id === "example.external-counter"
      ).state,
      "active"
    );
    selected = process.env.TAU_PLUGIN_TEST_SECOND;
    await click("重载构建");
    await wait("document.body.innerText.includes('ID 与当前插件不一致')");
    selected = process.env.TAU_PLUGIN_TEST_REPLACEMENT;
    for (let index = 0; index < 10; index++) {
      await click("重载构建");
      await wait("!pluginVerification.snapshot().reloading");
      const snapshot = await run("pluginVerification.snapshot()");
      assert.equal(snapshot.commands.length, 2);
      assert.equal(snapshot.styles, 2);
      assert.equal(snapshot.settingsCount, 2);
    }
    console.log("[plugin-reload] 重载/失败恢复/ID 拒绝/连续 10 次贡献与 CSS 数量通过；堆观察", {
      before: heapBefore,
      after: await run("performance.memory?.usedJSHeapSize ?? null"),
    });
    const autoRoot = path.join(directory, "automatic-builds");
    mkdirSync(autoRoot);
    cpSync(process.env.TAU_PLUGIN_TEST_ARTIFACT, path.join(autoRoot, "old"), { recursive: true });
    cpSync(process.env.TAU_PLUGIN_TEST_REPLACEMENT, path.join(autoRoot, "good"), {
      recursive: true,
    });
    cpSync(process.env.TAU_PLUGIN_TEST_FAILING, path.join(autoRoot, "bad"), { recursive: true });
    selected = path.join(autoRoot, "good");
    await click("重载构建");
    await wait("!pluginVerification.snapshot().reloading");
    await click("监听构建");
    await wait(
      "pluginVerification.snapshot().watching && !pluginVerification.snapshot().reloading"
    );
    const initialMount = (await run("pluginVerification.snapshot()")).mountId;
    mkdirSync(path.join(autoRoot, ".building-partial"));
    writeFileSync(path.join(autoRoot, ".building-partial/main.js"), "partial");
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal((await run("pluginVerification.snapshot()")).mountId, initialMount);
    const publish = name => {
      const temporary = path.join(autoRoot, "pointer.tmp");
      writeFileSync(
        temporary,
        JSON.stringify({
          formatVersion: 1,
          id: "example.external-counter",
          buildId: randomUUID(),
          directory: name,
        })
      );
      renameSync(temporary, path.join(autoRoot, "tau-build-example.external-counter.json"));
    };
    publish("old");
    await wait(
      "pluginVerification.snapshot().plugins.find(item => item.id === 'example.external-counter').version === '1.0.0' && !pluginVerification.snapshot().reloading"
    );
    publish("bad");
    await wait(
      "document.body.innerText.includes('已恢复旧版本') && !pluginVerification.snapshot().reloading"
    );
    assert.equal((await run("pluginVerification.snapshot()")).watching, true);
    publish("good");
    await wait(
      "pluginVerification.snapshot().plugins.find(item => item.id === 'example.external-counter').version === '1.1.0' && !pluginVerification.snapshot().reloading"
    );
    assert.equal((await run("pluginVerification.snapshot()")).styles, 2);
    await click("停止监听");
    await wait(
      "!pluginVerification.snapshot().watching && !pluginVerification.snapshot().reloading"
    );
    const stoppedMount = (await run("pluginVerification.snapshot()")).mountId;
    publish("old");
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal((await run("pluginVerification.snapshot()")).mountId, stoppedMount);
    console.log("[plugin-watch] 暂存不触发/完整发布自动重载/失败回退/后续恢复/停止监听通过");
    await click("监听构建");
    await wait(
      "pluginVerification.snapshot().watching && !pluginVerification.snapshot().reloading"
    );
    const workspaceA = (await managed()).workspaceId;
    const cleanup = await run("pluginVerification.switchWorkspace('g1-workspace-B')");
    assert.deepEqual(cleanup, { aborted: true, commands: 0, styles: 0, lateWriteRejected: true });
    await wait(
      `pluginVerification.snapshot().ready && pluginVerification.snapshot().workspaceId !== ${JSON.stringify(workspaceA)}`
    );
    assert.equal((await managed()).plugins.length, 0);
    selected = process.env.TAU_PLUGIN_TEST_ARTIFACT;
    await click("选择开发插件目录");
    await wait("pluginVerification.snapshot().plugins.length === 1");
    await click("启用");
    await openCounter();
    await wait("document.body.innerText.includes('已保存计数：0')");
    await click("增加并保存");
    await wait("document.body.innerText.includes('已保存计数：1')");
    publish("good");
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal((await managed()).plugins[0].version, "1.0.0");
    await run("pluginVerification.switchWorkspace('c07-verification')");
    await wait(
      `pluginVerification.snapshot().ready && pluginVerification.snapshot().workspaceId === ${JSON.stringify(workspaceA)}`
    );
    assert.equal((await managed()).plugins.length, 2);
    assert.equal((await managed()).watching, false);
    await openCounter();
    await wait("document.body.innerText.includes('已保存计数：2')");
    console.log(
      "[plugin-workspace] 外部插件双工作区登记/数据隔离/旧上下文拒绝/监听释放/返回恢复通过"
    );
    console.log(
      "[plugin-runtime] 外部产物/真实选择 IPC/静态登记/React hooks/UI Portal/页面导航/设置保存/启停恢复/双插件隔离通过；ESM 缓存探针通过"
    );
    await finish();
  })
  .catch(error => {
    console.error(error);
    writeFileSync(
      reportFile,
      JSON.stringify({ phase, status: "failed", error: String(error) }, null, 2)
    );
    app.exit(1);
  });
