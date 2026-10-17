import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [phase, directory] = process.argv.slice(2);
app.setPath("userData", join(directory, "profile"));
app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    await window.loadFile(join(directory, "index.html"));
    const script = readFileSync(join(directory, "renderer.js"), "utf8");
    const result: unknown = await window.webContents.executeJavaScript(
      script + "\n;globalThis.verifyBuiltinPersistence(" + JSON.stringify(phase) + ")"
    );
    window.webContents.session.flushStorageData();
    writeFileSync(
      join(directory, phase + ".json"),
      JSON.stringify({ result, electron: process.versions.electron })
    );
    window.destroy();
    app.quit();
  })
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
