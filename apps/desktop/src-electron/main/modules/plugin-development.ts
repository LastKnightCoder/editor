import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readDevelopmentPlugin } from "../services/plugin-package";

export default {
  name: "plugin-development",
  async init() {
    ipcMain.handle("plugin-development:choose", async event => {
      if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL)
        throw new Error("外部开发插件仅在桌面开发环境可用");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("插件目录选择需要应用窗口");
      const result = await dialog.showOpenDialog(window, {
        title: "选择已构建的可信插件目录",
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return readDevelopmentPlugin(result.filePaths[0]);
    });
  },
};
