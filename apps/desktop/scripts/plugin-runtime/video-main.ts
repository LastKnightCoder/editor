import { unwrapVideoHostResponse, type VideoHostResponse } from "../../shared/video-host-failure";
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginVideoRelay } from "../../src-electron/main/services/plugin-video";
import type {
  VideoProvidersState,
  VideoRendererReply,
  VideoRendererRequest,
  VideoRendererResults,
} from "../../shared/video-renderer";

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
  const relay = new PluginVideoRelay();
  const artifacts = JSON.parse(await readFile(path.join(directory, "artifacts.json"), "utf8"));
  ipcMain.handle("video-test:artifacts", () => artifacts);
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  let published!: (state: VideoProvidersState) => void;
  const ready = new Promise<VideoProvidersState>(resolve => {
    published = resolve;
  });
  ipcMain.handle("plugin-local:video-connect", (event, session: string) => {
    assert.equal(event.sender.id, main.webContents.id);
    relay.connect(event.sender, session);
  });
  ipcMain.handle("plugin-local:video-release", (event, session: string) =>
    relay.release(event.sender.id, session)
  );
  ipcMain.handle(
    "plugin-local:video-publish",
    (event, session: string, state: VideoProvidersState) => {
      relay.publish(event.sender.id, session, state);
      if (state.ready && state.providers.length === artifacts.length) published(state);
    }
  );
  ipcMain.handle("plugin-local:video-request", (event, id: string, request: VideoRendererRequest) =>
    relay.requestResponse(event.sender, id, request)
  );
  ipcMain.handle("plugin-local:video-reply", (event, reply: VideoRendererReply) =>
    relay.reply(event.sender.id, reply)
  );
  ipcMain.handle("plugin-local:video-cancel", (event, id: string) =>
    relay.cancel(event.sender.id, id)
  );
  await Promise.all([
    main.loadFile(path.join(directory, "index.html")),
    auxiliary.loadFile(path.join(directory, "index.html")),
  ]);
  await main.webContents.executeJavaScript(
    await readFile(path.join(directory, "renderer.js"), "utf8")
  );
  const state = await ready;
  assert.deepEqual(state.providers.map(provider => provider.id).sort(), ["bilibili", "youtube"]);

  const call = async <K extends VideoRendererRequest["kind"]>(
    id: string,
    request: Extract<VideoRendererRequest, { kind: K }>
  ) =>
    unwrapVideoHostResponse(
      await auxiliary.webContents.executeJavaScript<VideoHostResponse<VideoRendererResults[K]>>(
        `window.electron.invoke("plugin-local:video-request",${JSON.stringify(id)},${JSON.stringify(request)})`
      )
    );

  const bilibiliUrl = "https://www.bilibili.com/video/BV1xx411c7mD?p=2";
  assert.equal(await call("m1", { kind: "match", url: bilibiliUrl }), "bilibili");
  assert.equal(await call("m2", { kind: "match", url: "https://youtu.be/abc" }), "youtube");
  assert.equal(await call("m3", { kind: "match", url: "https://example.com/a.mp4" }), null);

  const bilibili = await call("r1", { kind: "resolve", pluginId: "bilibili", url: bilibiliUrl });
  assert.equal(bilibili.title, "测试视频 - 第二讲");
  if (bilibili.defaultVariant === undefined) throw new Error("missing default variant");
  const chosen = bilibili.variants[bilibili.defaultVariant];
  // 设置中保存的登录凭据经插件配置注入，大会员默认选最高清晰度
  assert.deepEqual(chosen.ref, { bvid: "BV1xx411c7mD", cid: "200", quality: 112 });
  assert.equal(
    await call("k1", { kind: "cacheKey", pluginId: "bilibili", ref: chosen.ref }),
    "BV1xx411c7mD-200-112"
  );
  // 主进程调用路径（学习资料后台索引）
  const playback = await relay.call({ kind: "playback", pluginId: "bilibili", ref: chosen.ref });
  assert.equal(playback.kind, "split");
  assert.equal(
    playback.kind === "split" && playback.video.headers?.Referer,
    "https://www.bilibili.com/"
  );

  const youtube = await call("r2", {
    kind: "resolve",
    pluginId: "youtube",
    url: "https://www.youtube.com/watch?v=abc",
  });
  assert.deepEqual(youtube.variants[0].ref, {
    url: "https://www.youtube.com/watch?v=abc",
    videoStream: "299",
    audioStream: "140",
  });
  assert.deepEqual(
    await call("p2", { kind: "playback", pluginId: "youtube", ref: youtube.variants[0].ref }),
    {
      kind: "extract",
      url: "https://www.youtube.com/watch?v=abc",
      videoFormat: "299",
      audioFormat: "140",
      proxy: "http://127.0.0.1:7890",
    }
  );

  const requests = await main.webContents.executeJavaScript("window.videoTest.requests");
  assert.ok(
    requests.some((request: { cookie: string | null }) => request.cookie === "SESSDATA=sess"),
    "B 站请求应携带插件配置中的凭据"
  );
  assert.equal(
    await main.webContents.executeJavaScript("window.videoTest.probeProxy()"),
    "http://127.0.0.1:7890"
  );

  const pending = call("slow", {
    kind: "resolve",
    pluginId: "bilibili",
    url: "https://b23.tv/slow",
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  await auxiliary.webContents.executeJavaScript(
    'window.electron.invoke("plugin-local:video-cancel","slow")'
  );
  await assert.rejects(pending, /取消/);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(await main.webContents.executeJavaScript("window.videoTest.lastAborted()"), true);

  const stopped = call("stopped", {
    kind: "resolve",
    pluginId: "bilibili",
    url: "https://b23.tv/slow",
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  await main.webContents.executeJavaScript("window.videoTest.disable()");
  await assert.rejects(stopped);
  await assert.rejects(
    call("late", { kind: "resolve", pluginId: "bilibili", url: bilibiliUrl }),
    /安装并启用/
  );
  assert.deepEqual(
    relay.providers().providers.map(provider => provider.id),
    ["youtube"]
  );
  await main.webContents.executeJavaScript("window.videoTest.installFault()");
  await assert.rejects(
    call("host-code", { kind: "resolve", pluginId: "video-test.fault", url: "fixture" }),
    { name: "Error", code: "variants", message: "插件未返回可选的清晰度" }
  );
  await main.webContents.executeJavaScript('window.videoTest.faultMode("plugin")');
  const diagnostic = await auxiliary.webContents.executeJavaScript<VideoHostResponse<unknown>>(
    'window.electron.invoke("plugin-local:video-request","unknown-name",{kind:"resolve",pluginId:"video-test.fault",url:"fixture"})'
  );
  assert.equal(diagnostic.ok, false);
  if (diagnostic.ok) throw new Error("expected plugin diagnostic");
  assert.equal(diagnostic.failure.name, "TypeError");
  assert.equal(diagnostic.failure.message, "opaque provider diagnostic");
  assert.equal(diagnostic.failure.code, undefined);
  assert.equal(diagnostic.failure.params, undefined);
  assert.equal(JSON.stringify(diagnostic).includes("must-not-cross"), false);
  assert.equal(JSON.stringify(diagnostic).includes("private.invalid"), false);
  assert.equal("stack" in diagnostic.failure, false);
  assert.throws(() => unwrapVideoHostResponse(diagnostic), {
    name: "TypeError",
    message: "opaque provider diagnostic",
  });
  await main.webContents.executeJavaScript("window.videoTest.removeFault()");
  await main.webContents.executeJavaScript("window.videoTest.disconnect()");
  main.destroy();
  auxiliary.destroy();
  console.log(
    "视频真实插件 ZIP 双窗口验证通过：链接识别、解析、清晰度、凭据与代理注入、缓存身份、播放源、主进程调用、取消及停用"
  );
  app.exit(0);
}
void start().catch(error => {
  console.error(error);
  app.exit(1);
});
