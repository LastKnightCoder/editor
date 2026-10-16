import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import { discoverPlugins } from "../services/plugin-discovery";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { PluginUpdates } from "../services/plugin-updates";

const directory = () => path.join(PathUtil.getAppDir(), "plugins");

export default {
  name: "plugin-local",
  async init() {
    const updates = new PluginUpdates(directory(), app.getVersion());
    await updates.initialize();
    ipcMain.handle(
      "plugin-local:workspace",
      async (_event, name: string) => (await getPluginRegistry().open(name)).id
    );
    ipcMain.handle("plugin-local:scan", async () => {
      const maintenance = await updates.list();
      const result = await discoverPlugins(directory(), app.getVersion());
      return {
        ...result,
        clientVersion: app.getVersion(),
        updates: maintenance,
        entries: result.entries.map(entry => {
          const blocked = maintenance.find(item => item.id === entry.id && item.blocked);
          return blocked
            ? { ...entry, artifact: undefined, error: blocked.error ?? "更新尚未恢复，暂不加载" }
            : entry;
        }),
      };
    });
    ipcMain.handle("plugin-local:stage-zip", async event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("安装插件需要应用窗口");
      const selected = await dialog.showOpenDialog(window, {
        title: "安装或更新插件",
        properties: ["openFile"],
        filters: [{ name: "插件 ZIP", extensions: ["zip"] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      return updates.stageZip(selected.filePaths[0]);
    });
    ipcMain.handle("plugin-local:restore", (_event, id: string) => updates.restore(id));
    ipcMain.handle("plugin-local:cancel-update", (_event, id: string) => updates.cancel(id));
    ipcMain.handle("plugin-local:open-directory", async () => {
      const root = directory();
      await mkdir(root, { recursive: true });
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
    });
  },
};
