import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginTTSRelay } from "../../src-electron/main/services/plugin-tts";
import type { TTSRendererRequest, TTSRendererReply } from "../../shared/tts-renderer";

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
  const main = create(),
    auxiliary = create(),
    relay = new PluginTTSRelay();
  const artifact = JSON.parse(await readFile(path.join(directory, "artifact.json"), "utf8"));
  ipcMain.handle("tts-test:artifact", () => artifact);
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  let ready!: () => void;
  const connected = new Promise<void>(resolve => {
    ready = resolve;
  });
  ipcMain.handle("plugin-local:tts-connect", (event, session: string) => {
    assert.equal(event.sender.id, main.webContents.id);
    relay.connect(event.sender, session);
    ready();
  });
  ipcMain.handle("plugin-local:tts-release", (event, session: string) =>
    relay.release(event.sender.id, session)
  );
  ipcMain.handle("plugin-local:tts-request", (event, id: string, request: TTSRendererRequest) =>
    relay.request(event.sender, id, request)
  );
  ipcMain.handle("plugin-local:tts-reply", (event, reply: TTSRendererReply) =>
    relay.reply(event.sender.id, reply)
  );
  ipcMain.handle("plugin-local:tts-cancel", (event, id: string) =>
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
  const call = (id: string, request: TTSRendererRequest): Promise<TTSRendererReply> =>
    auxiliary.webContents.executeJavaScript(
      `window.electron.invoke("plugin-local:tts-request",${JSON.stringify(id)},${JSON.stringify(request)})`
    );
  for (const id of ["a", "b"]) {
    const reply = await call("open-" + id, {
      kind: "open",
      session: id,
      pluginId: "tau.tts-minimax",
      config: { apiKey: "account-" + id, baseUrl: "https://" + id + ".test" },
      modelId: id === "a" ? "speech-2.8-hd" : "speech-2.6-hd",
    });
    assert.equal(reply.error, undefined);
    assert.equal((reply.result as { canClone: boolean }).canClone, true);
  }
  for (const id of ["a", "b"]) {
    const reply = await call("synth-" + id, {
      kind: "synthesize",
      session: id,
      request: { text: "你好", voiceId: "v" },
    });
    assert.equal(reply.error, undefined);
    assert.deepEqual(Array.from((reply.result as { audio: Uint8Array }).audio), [0, 255, 16]);
  }
  const requests = await main.webContents.executeJavaScript("window.ttsTest.requests");
  assert.deepEqual(
    requests.map((request: { url: string }) => request.url),
    ["https://a.test/v1/t2a_v2", "https://b.test/v1/t2a_v2"]
  );
  assert.deepEqual(
    requests.map((request: { authorization: string }) => request.authorization),
    ["Bearer account-a", "Bearer account-b"]
  );
  const pending = call("pending", {
    kind: "synthesize",
    session: "a",
    request: { text: "pending", voiceId: "v" },
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  await main.webContents.executeJavaScript("window.ttsTest.disable()");
  assert.equal((await pending).errorName, "AbortError");
  assert.equal((await call("old", { kind: "voices", session: "b" })).errorName, "AbortError");
  console.log("TTS Electron真实包验收通过：多账号、跨窗口、音频字节、停用取消");
  app.exit(0);
}
void start().catch(error => {
  console.error(error);
  app.exit(1);
});
