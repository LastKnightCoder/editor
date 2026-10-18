import { isContentPlugin } from "@tau/plugins/package";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import { discoverPlugins } from "../services/plugin-discovery";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { PluginUpdates } from "../services/plugin-updates";
import { readPluginPackage } from "../services/plugin-package";
import { PluginContentStartup } from "../services/plugin-content-startup";
import { installBundledPlugins } from "../services/plugin-bundled";
import { acceptHeadlessPlugin } from "../services/plugin-codecs";
import { ContentPluginPreferences } from "../services/plugin-preferences";
import {
  downloadPluginRelease,
  fetchPluginCatalog,
  fetchPluginRelease,
  fetchPluginVersions,
  fetchPluginCommunity,
  setPluginLiked,
  addPluginComment,
  deletePluginComment,
} from "../services/plugin-center";

const directory = () => path.join(PathUtil.getAppDir(), "plugins");

export default {
  name: "plugin-local",
  async init() {
    const bundled = await installBundledPlugins(
      path.join(app.getAppPath(), "build/bundled-plugins"),
      directory(),
      app.getVersion()
    );
    const updates = new PluginUpdates(directory(), app.getVersion());
    await updates.initialize();
    const preferences = new ContentPluginPreferences(directory());
    await preferences.load();
    const contentStartup = new PluginContentStartup(async id => {
      const maintenance = await updates.list();
      if (maintenance.some(item => item.id === id && item.blocked))
        throw new Error("插件更新尚未恢复");
      const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (artifact.manifest.id !== id || !isContentPlugin(artifact.manifest))
        throw new Error("内容插件身份或声明无效");
      acceptHeadlessPlugin(artifact);
      return artifact;
    });
    const initial = await discoverPlugins(directory(), app.getVersion());
    const initialSources = await updates.sources(initial.entries.map(entry => entry.id));
    const defaults = (id: string) => bundled.includes(id) || initialSources[id]?.kind === "center";
    const snapshot = await contentStartup.get(
      initial.entries
        .filter(
          entry =>
            entry.artifact &&
            isContentPlugin(entry.artifact.manifest) &&
            preferences.enabled(entry.id, defaults(entry.id))
        )
        .map(entry => entry.id)
    );
    ipcMain.handle("plugin-local:content-startup", () => snapshot);
    ipcMain.handle("plugin-local:content-enabled", async (_event, id: string, enabled: boolean) => {
      const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (!isContentPlugin(artifact.manifest)) throw new Error("插件没有静态内容声明");
      await preferences.set(id, enabled);
    });
    ipcMain.handle(
      "plugin-local:workspace",
      async (_event, name: string) => (await getPluginRegistry().open(name)).id
    );
    ipcMain.handle("plugin-local:scan", async () => {
      const maintenance = await updates.list();
      const result = await discoverPlugins(directory(), app.getVersion());
      const sources = await updates.sources(result.entries.map(entry => entry.id));
      return {
        ...result,
        clientVersion: app.getVersion(),
        updates: maintenance,
        entries: result.entries.map(entry => {
          const blocked = maintenance.find(item => item.id === entry.id && item.blocked);
          const sourced = {
            ...entry,
            source: sources[entry.id],
            bundled: bundled.includes(entry.id),
            contentEnabled: preferences.enabled(
              entry.id,
              bundled.includes(entry.id) || sources[entry.id]?.kind === "center"
            ),
          };
          return blocked
            ? { ...sourced, artifact: undefined, error: blocked.error ?? "更新尚未恢复，暂不加载" }
            : sourced;
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
    ipcMain.handle(
      "plugin-local:catalog",
      (_event, query?: string, sort?: import("@/types/plugin-center").PluginCatalogSort) =>
        fetchPluginCatalog(app.getVersion(), query, sort)
    );
    ipcMain.handle("plugin-local:release", (_event, id: string) => fetchPluginRelease(id));
    ipcMain.handle("plugin-local:community", (_event, id: string, cursor: string | null) =>
      fetchPluginCommunity(id, cursor)
    );
    ipcMain.handle("plugin-local:like", (_event, id: string, liked: boolean) =>
      setPluginLiked(id, liked)
    );
    ipcMain.handle(
      "plugin-local:comment",
      (_event, id: string, message: string, requestId: string) =>
        addPluginComment(id, message, requestId)
    );
    ipcMain.handle("plugin-local:delete-comment", (_event, id: string, commentId: string) =>
      deletePluginComment(id, commentId)
    );
    ipcMain.handle("plugin-local:versions", (_event, pluginId: string) =>
      fetchPluginVersions(app.getVersion(), pluginId)
    );
    ipcMain.handle("plugin-local:stage-release", async (_event, id: string) => {
      const { bytes, source } = await downloadPluginRelease(id);
      return updates.stageRelease(bytes, source);
    });
    // 走正常退出流程，窗口的关闭守卫仍生效；用户取消退出时重启在下次退出后执行。
    ipcMain.handle("plugin-local:relaunch", () => {
      app.relaunch();
      app.quit();
    });
    ipcMain.handle("plugin-local:uninstall", async (_event, id: string) => {
      if (await contentStartup.uses(id)) throw new Error("请先停用内容插件并重启应用，再卸载");
      return updates.uninstall(id);
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
