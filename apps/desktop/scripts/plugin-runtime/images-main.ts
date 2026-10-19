import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginImagesRelay } from "../../src-electron/main/services/plugin-images";
import type { ImagesRendererRequest, ImagesRendererReply } from "../../shared/images-renderer";

async function start() {
  const directory = process.argv[2];
  app.setPath("userData", path.join(directory, "profile"));
  await app.whenReady();
  const create = () =>
    new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        preload: path.join(directory, "preload.cjs"),
      },
    });
  const main = create();
  const auxiliary = create();
  const relay = new PluginImagesRelay();
  const artifact = JSON.parse(await readFile(path.join(directory, "artifact.json"), "utf8"));
  ipcMain.handle("images-test:artifact", () => artifact);
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  let ready!: () => void;
  const connected = new Promise<void>(resolve => {
    ready = resolve;
  });
  ipcMain.handle("plugin-local:images-connect", (event, session: string) => {
    assert.equal(event.sender.id, main.webContents.id);
    relay.connect(event.sender, session);
    ready();
  });
  ipcMain.handle("plugin-local:images-release", (event, session: string) =>
    relay.release(event.sender.id, session)
  );
  ipcMain.handle("plugin-local:images-changed", () => {});
  ipcMain.handle(
    "plugin-local:images-closed",
    (event, message: { session: string; hostSession: string }) =>
      relay.rendererClosed(event.sender.id, message.hostSession, message.session)
  );
  ipcMain.handle(
    "plugin-local:images-request",
    (event, id: string, request: ImagesRendererRequest) => relay.request(event.sender, id, request)
  );
  ipcMain.handle("plugin-local:images-reply", (event, reply: ImagesRendererReply) =>
    relay.reply(event.sender.id, reply)
  );
  ipcMain.handle("plugin-local:images-cancel", (event, id: string) =>
    relay.cancel(event.sender.id, id)
  );
  await Promise.all([
    main.loadFile(path.join(directory, "index.html")),
    auxiliary.loadFile(path.join(directory, "index.html")),
  ]);
  await main.webContents.executeJavaScript(
    await readFile(path.join(directory, "renderer.js"), "utf8")
  );
  await connected;
  const call = (id: string, request: ImagesRendererRequest): Promise<ImagesRendererReply> =>
    auxiliary.webContents.executeJavaScript(
      `(()=>{const request=${JSON.stringify(request, (_key, value) => (value instanceof Uint8Array ? Array.from(value) : value))};if(request.kind==="edit")for(const image of request.request.images)image.content=new Uint8Array(image.content);return window.electron.invoke("plugin-local:images-request",${JSON.stringify(id)},request)})()`
    );
  for (const id of ["a", "b"]) {
    const opened = await call(`open-${id}`, {
      kind: "open",
      session: id,
      pluginId: artifact.manifest.id,
      config: { apiKey: `account-${id}`, baseUrl: `https://${id}.test` },
      modelId: `model-${id}`,
    });
    assert.equal(opened.error, undefined);
    assert.deepEqual(opened.result, { canGenerate: true, canEdit: true });
    const generated = await call(`generate-${id}`, {
      kind: "generate",
      session: id,
      request: { prompt: "generate" },
    });
    assert.equal(generated.error, undefined);
    assert.deepEqual(
      Array.from((generated.result as { content: Uint8Array }[])[0].content),
      [0, 255, 16]
    );
  }
  const edited = await call("edit", {
    kind: "edit",
    session: "a",
    request: {
      prompt: "edit",
      images: [{ name: "ref.png", mimeType: "image/png", content: new Uint8Array([1, 2]) }],
    },
  });
  assert.equal(edited.error, undefined);
  const downloaded = await call("url", {
    kind: "generate",
    session: "b",
    request: { prompt: "url" },
  });
  assert.equal(downloaded.error, undefined);
  assert.equal((downloaded.result as { mimeType: string }[])[0].mimeType, "image/webp");
  const requests = await main.webContents.executeJavaScript("window.imagesTest.requests");
  assert.deepEqual(
    requests
      .slice(0, 2)
      .map((request: { url: string; model: string; authorization: string }) => [
        request.url,
        request.model,
        request.authorization,
      ]),
    [
      ["https://a.test/images/generations", "model-a", "Bearer account-a"],
      ["https://b.test/images/generations", "model-b", "Bearer account-b"],
    ]
  );
  assert.equal(requests[2].images, 1);
  assert.equal(requests.at(-1).authorization, null);
  const pending = call("pending", {
    kind: "generate",
    session: "a",
    request: { prompt: "pending" },
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  await auxiliary.webContents.executeJavaScript(
    'window.electron.invoke("plugin-local:images-cancel","pending")'
  );
  assert.equal((await pending).errorName, "AbortError");
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(await main.webContents.executeJavaScript("window.imagesTest.lastAborted()"), true);
  const stopped = call("stopped", {
    kind: "generate",
    session: "b",
    request: { prompt: "pending" },
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  await main.webContents.executeJavaScript("window.imagesTest.disable()");
  assert.equal((await stopped).errorName, "AbortError");
  assert.equal(
    (await call("closed", { kind: "generate", session: "a", request: { prompt: "late" } }))
      .errorName,
    "AbortError"
  );
  await main.webContents.executeJavaScript("window.imagesTest.disconnect()");
  main.destroy();
  auxiliary.destroy();
  console.log(
    "图片真实插件 ZIP 双窗口验证通过：账号、模型、生成、编辑、字节、下载鉴权、取消及停用"
  );
  app.exit(0);
}
void start().catch(error => {
  console.error(error);
  app.exit(1);
});
