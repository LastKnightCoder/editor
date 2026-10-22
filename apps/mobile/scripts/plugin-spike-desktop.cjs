const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const profile = path.resolve(
  __dirname,
  `../../../output/mobile-plugin-spike/desktop-profile${process.argv.includes("--fresh") ? `-${Date.now()}` : ""}`
);
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1100,
    height: 850,
    show: process.argv.includes("--show"),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.on("console-message", event => {
    if (event.level === "error") console.error(event.message);
  });
  await window.loadURL("http://127.0.0.1:2420/?autotest=1");
});
app.on("window-all-closed", () => app.quit());
