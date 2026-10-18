import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginUploadRelay } from "../../src-electron/main/services/plugin-upload";
import type { UploadRequest, UploadRendererReply } from "../../shared/upload-renderer";
const directory = process.argv[2];
async function start() {
  app.setPath("userData", path.join(directory, "profile"));
  await app.whenReady();
  const relay = new PluginUploadRelay();
  const create = () =>
    new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        preload: path.join(directory, "preload.cjs"),
      },
    });
  const main = create(),
    auxiliary = create();
  let ready!: () => void;
  const connected = new Promise<void>(resolve => {
    ready = resolve;
  });
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  ipcMain.handle("plugin-local:upload-connect", (event, session: string) => {
    assert.equal(event.sender.id, main.webContents.id);
    relay.connect(event.sender, session);
    ready();
  });
  ipcMain.handle("plugin-local:upload-release", (event, session: string) =>
    relay.release(event.sender.id, session)
  );
  ipcMain.handle("plugin-local:upload-reply", (event, reply: UploadRendererReply) =>
    relay.reply(event.sender.id, reply)
  );
  ipcMain.handle("plugin-local:upload", (event, request: UploadRequest) =>
    relay.upload(event.sender, request)
  );
  try {
    await Promise.all([
      main.loadFile(path.join(directory, "index.html")),
      auxiliary.loadFile(path.join(directory, "index.html")),
    ]);
    await main.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    await connected;
    const upload = (name: string) =>
      auxiliary.webContents.executeJavaScript(
        `window.electron.invoke("plugin-local:upload", {pluginId:"test.upload",config:{path:"images"},file:{name:${JSON.stringify(name)},mimeType:"application/octet-stream",content:new Uint8Array([0,255])}}).then(url=>({url}),error=>({error:error.message}))`
      );
    assert.deepEqual(await upload("a.bin"), { url: "https://resources.test/a.bin" });
    const pending = upload("pending");
    await new Promise(resolve => setTimeout(resolve, 50));
    await main.webContents.executeJavaScript("window.uploadTest.disable()");
    assert.match((await pending).error, /停用/);
    assert.match((await upload("a.bin")).error, /未启用/);
    await main.webContents.executeJavaScript("window.uploadTest.disconnect()");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.match((await upload("a.bin")).error, /不可用/);
    console.log("跨窗口上传Electron验收通过：二进制、渲染执行、停用回收、宿主不可用");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
void start().catch(error => {
  console.error(error);
  app.exit(1);
});
