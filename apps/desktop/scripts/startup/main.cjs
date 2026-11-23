const assert = require("node:assert/strict");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { app, BrowserWindow, ipcMain } = require("electron");

const root = process.env.TAU_STARTUP_APP_ROOT;
const profile = process.env.TAU_STARTUP_PROFILE;
app.setPath("userData", profile);
app.on("window-all-closed", () => undefined);
const stages = new Set();
let failure;
const fail = message => {
  failure ??= new Error(message);
};
ipcMain.on("perf-monitor:renderer-event", (_event, payload) => {
  if (payload?.kind !== "stage") return;
  stages.add(payload.label);
  if (payload.label === "startup:database-failed") fail("主窗口数据库初始化失败");
});
ipcMain.on("logger:renderer-log", (_event, payload) => {
  if (
    payload?.level === "error" &&
    /应用启动失败|Uncaught|UnhandledRejection/.test(payload.message)
  )
    fail(payload.message);
});
for (const channel of ["refresh-window-min-size", "fonts:apply", "set-window-title"])
  ipcMain.handle(channel, () => undefined);
ipcMain.handle("get-home-dir", () => profile);
ipcMain.handle("module-init:init-module", () => ({ success: true }));
ipcMain.handle("plugin-local:content-startup", () => ({ artifacts: [], errors: {}, intents: {} }));
ipcMain.handle("create-or-connect-database", (_event, databaseName) => {
  if (process.env.TAU_STARTUP_FAIL_DATABASE) throw new Error("启动检查注入的数据库连接失败");
  return { databaseName, connectionId: "startup-fixture" };
});
ipcMain.handle("collaboration:state", () => ({ shares: [], invitations: [] }));
ipcMain.handle("plugin-local:workspace", () => "startup-fixture");
ipcMain.handle("plugin-local:scan", () => ({ directory: profile, entries: [], updates: [] }));
ipcMain.handle("plugin-local:catalog", () => ({ items: [] }));
ipcMain.handle("plugin-permissions:snapshot", () => ({}));
ipcMain.handle("get-window-state", () => ({ maximized: false, fullscreen: false }));
ipcMain.handle("workspace-preferences:get", () => ({ disabledFeatures: [], onboarding: "done" }));
ipcMain.handle("home-layout:get", () => []);
ipcMain.handle("pi-session:interactions", () => ({ ok: true, snapshots: [] }));
ipcMain.handle("pomodoro:summary-today", () => ({ count: 0, duration: 0 }));
for (const channel of [
  "chat-group:get-all",
  "chat-session:list",
  "flashcard:list-decks",
  "get-all-diary-segments-flat",
  "get-all-diary-tag-settings",
  "get-all-white-boards",
  "todo:list-groups",
  "todo:list-archived-groups",
  "todo:list-items-by-type",
  "get-article-tag-counts",
  "get-all-statistic",
  "get-all-diary-entries",
  "plugin-entities:kinds",
  "get-all-fonts",
  "pi-subagents:list",
  "calendar-event:get-for-day",
  "get-all-project-items",
  "get-operation-daily-counts",
  "browser-companion:pending-prompts",
  "get-cards-by-date-range",
  "get-articles-by-date-range",
])
  ipcMain.handle(channel, () => []);
for (const channel of [
  "plugin-window:publishTheme",
  "plugin-local:upload-connect",
  "plugin-local:tts-connect",
  "plugin-local:images-connect",
  "plugin-local:embeddings-connect",
  "plugin-local:video-connect",
  "collaboration:owner-image-connect",
  "plugin-local:video-publish",
  "plugin-local:sync-release-window",
  "plugin-local:publish-release-window",
  "plugin-local:upload-release",
  "plugin-local:tts-release",
  "plugin-local:images-release",
  "plugin-local:embeddings-release",
  "plugin-local:video-release",
  "collaboration:owner-image-release",
])
  ipcMain.handle(channel, () => undefined);

function windowFor(role, preload = true) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: preload ? path.join(root, "dist-electron/preload/index.js") : undefined,
      additionalArguments: role ? ["--tau-window-role=" + role] : [],
    },
  });
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );
  win.webContents.on("preload-error", (_event, _path, error) => fail(error.message));
  win.webContents.on("render-process-gone", (_event, details) =>
    fail("渲染进程退出：" + details.reason)
  );
  win.webContents.on("console-message", ({ message }) => {
    if (/Uncaught|应用启动失败|插件窗口渲染失败/.test(message)) fail(message);
  });
  return win;
}

async function until(check, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (failure) throw failure;
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(label + "超时；已完成阶段：" + [...stages].join(", "));
}

async function verifyMain() {
  const startedAt = Date.now();
  const win = windowFor("main");
  await win.loadURL("about:blank");
  // 在页面脚本执行前替换后端通道，真实应用只会收到隔离的空设置。
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Page.enable");
  await win.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    globalThis.WebSocket = class extends EventTarget {
      static OPEN = 1;
      readyState = 0;
      constructor(url) {
        super();
        if (url !== "ws://localhost:24678/backendServer?isServer=false") throw new Error("未声明的启动检查通道");
        setTimeout(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({
            type: "JsonRpcNotification", method: "server-ready", data: null
          }) }));
        }, 0);
      }
      send(raw) {
        const request = JSON.parse(raw);
        const known = ["get-user-setting", "set-user-setting"].includes(request.method);
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({
          type: "JsonRpcResponse", id: request.id, result: {},
          ...(!known ? { error: "未声明的启动检查请求：" + request.method } : {})
        }) })));
      }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    };
  `,
  });
  await win.loadFile(path.join(root, "dist/index.html"));
  const required = [
    "bootstrap-ready",
    "renderer-ready",
    "settings-ready",
    "database-ready",
    "shell-ready",
  ];
  await until(() => required.every(stage => stages.has("startup:" + stage)), "主窗口启动");
  assert(
    await win.webContents.executeJavaScript('Boolean(document.querySelector(".app main"))'),
    "业务壳层未提交"
  );
  console.log(
    `主窗口完整启动通过：模块、扩展、React 提交、设置、数据库与业务壳层就绪（${Date.now() - startedAt}ms）`
  );
  win.destroy();
}

async function verifyContent() {
  const win = windowFor(undefined, false);
  await win.loadFile(path.join(root, "dist/content-runtime.html"));
  await until(
    () => win.webContents.executeJavaScript('typeof tauContentExecute === "function"'),
    "内容转换入口"
  );
  const content = await win.webContents.executeJavaScript(`tauContentExecute({
    hash: "startup", artifacts: [], request: { operation: "prepare-content", input: { markdown: "启动验证" } }
  })`);
  assert(content && typeof content === "object", "内容转换未返回文档");
  assert(
    await win.webContents.executeJavaScript("!globalThis.electron && !globalThis.process"),
    "内容进程隔离失效"
  );
  console.log("内容转换生产入口与编辑器契约准备通过");
  win.destroy();
}

async function verifyPluginWindow() {
  const code = `const React = require('react'); const sdk = require('@tau/plugins');
    module.exports.default = sdk.definePlugin({id:'example.startup',name:'启动验证',version:'1.0.0',
      windows:[{id:'startup',title:'启动验证',component:({params})=>React.createElement('div',{'data-startup-fixture':true},params.message)}],
      create(){throw new Error('窗口入口不得激活插件')}});`;
  const win = windowFor("plugin-window");
  let ready = false;
  ipcMain.handle("plugin-window:bootstrap", () => ({
    windowId: "startup",
    endpoint: "startup",
    options: { kind: "normal", theme: "light" },
    params: { revision: 1, value: { message: "插件窗口已提交" } },
    appearance: {
      revision: 1,
      value: {
        themeId: "paper",
        appearance: "light",
        font: {
          chineseFont: "sans-serif",
          englishFont: "sans-serif",
          codeFont: "monospace",
          fontSize: 16,
        },
      },
    },
    artifact: {
      code,
      manifest: {
        id: "example.startup",
        name: "启动验证",
        version: "1.0.0",
        apiVersion: 1,
        formatVersion: 3,
        platform: "portable",
        profile: "web-v1",
        targets: { desktop: { minAppVersion: "0.0.0" } },
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      },
    },
  }));
  ipcMain.handle("plugin-window:ready", async (_event, input) => {
    assert.equal(input.revision, 1);
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.querySelector("[data-startup-fixture]")?.textContent'
      ),
      "插件窗口已提交"
    );
    ready = true;
    return { status: "shown" };
  });
  ipcMain.handle("plugin-window:failed", () => fail("插件窗口生产入口启动失败"));
  await win.loadFile(path.join(root, "dist/plugin-window.html"));
  await until(() => ready, "插件窗口挂载握手");
  assert(
    await win.webContents.executeJavaScript(
      "!globalThis.electron && Boolean(globalThis.tauPluginWindow)"
    ),
    "插件窗口桥隔离失效"
  );
  console.log("插件窗口生产入口、React 提交和参数版本握手通过");
  win.destroy();
}

app
  .whenReady()
  .then(async () => {
    await verifyMain();
    await verifyContent();
    await verifyPluginWindow();
    if (failure) throw failure;
    app.exit(0);
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => {
  console.error("生产启动检查整体超时");
  app.exit(1);
}, 50_000);
