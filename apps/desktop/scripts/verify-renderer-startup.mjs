import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-renderer-startup-"));
try {
  // 只验证生产模块求值和 React 首次挂载；不连接真实后端或读取用户工作区。
  const entry = path.join(directory, "main.cjs");
  await writeFile(
    entry,
    `
    const { app, BrowserWindow, ipcMain } = require("electron");
    app.setPath("userData", ${JSON.stringify(path.join(directory, "profile"))});
    ipcMain.handle("refresh-window-min-size", () => undefined);
    ipcMain.handle("get-home-dir", () => ${JSON.stringify(directory)});
    let failed = false;
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: {
        contextIsolation: true,
        preload: ${JSON.stringify(path.join(root, "dist-electron/preload/index.js"))},
      }});
      win.webContents.session.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
        (_details, callback) => callback({ cancel: true })
      );
      win.webContents.on("console-message", (_event, _level, message) => {
        if (/Uncaught/.test(message) && !message.includes("No handler registered")) {
          failed = true;
          console.error(message);
        }
      });
      win.webContents.on("preload-error", (_event, _path, error) => {
        failed = true;
        console.error(error);
      });
      await win.loadFile(${JSON.stringify(path.join(root, "dist/index.html"))});
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !failed) {
        const mounted = await win.webContents.executeJavaScript(
          'Boolean(document.getElementById("root")?.childElementCount)'
        );
        if (mounted) {
          console.log("生产页面模块求值与 React 首次挂载通过");
          app.exit(0);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.error("生产页面启动失败：脚本异常或根节点始终为空");
      app.exit(1);
    }).catch(error => { console.error(error); app.exit(1); });
    setTimeout(() => app.exit(1), 20000);
  `
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [entry], { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code =>
      code === 0 ? resolve() : reject(new Error(`页面启动检查失败：${code}`))
    );
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
