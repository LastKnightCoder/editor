const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const directory = process.env.TAU_PLUGIN_TEST_DIRECTORY;
app.setPath("userData", path.join(directory, "profile"));
process.env.VITE_DEV_SERVER_URL = "http://localhost/verification";

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
      const end = Date.now() + 10000;
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
    await run("pluginVerification.stop()");
    assert.equal((await run("pluginVerification.snapshot()")).styles, 0);
    window.destroy();
    console.log(
      "[plugin-runtime] 外部产物/真实选择 IPC/静态登记/React hooks/UI Portal/页面导航/设置保存/启停恢复/双插件隔离通过；ESM 缓存探针通过"
    );
    app.quit();
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
