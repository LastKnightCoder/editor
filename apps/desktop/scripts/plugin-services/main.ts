import { app, BrowserWindow, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import services from "../../src-electron/main/modules/plugin-services";

const directory = process.env.TAU_SERVICE_TEST_DIRECTORY;
if (!directory) throw new Error("缺少服务验证目录");
app.setPath("userData", path.join(directory, "profile"));
void app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    await services.init();
    ipcMain.handle("module-init:init-module", () => ({ success: true }));
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(directory, "preload.cjs"),
        contextIsolation: true,
        sandbox: false,
      },
    });
    window.webContents.on("console-message", (_event, _level, message) =>
      console.log("[renderer]", message)
    );
    await window.loadFile(path.join(directory, "index.html"));
    await window.webContents.executeJavaScript(
      await readFile(path.join(directory, "renderer.js"), "utf8")
    );
    const report = await window.webContents.executeJavaScript("window.serviceVerification");
    await writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
    window.destroy();
    app.exit(report.ok ? 0 : 1);
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
