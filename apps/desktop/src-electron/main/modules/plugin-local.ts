import { isContentPlugin } from "@tau/plugins/package";
import { copyJson } from "@tau/plugins/host";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import { discoverPlugins } from "../services/plugin-discovery";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { PluginUpdates } from "../services/plugin-updates";
import { readPluginPackage } from "../services/plugin-package";
import { PluginContentStartup } from "../services/plugin-content-startup";
import { acceptHeadlessPlugin } from "../services/plugin-codecs";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import {
  pluginSyncSessions,
  acceptSyncRendererReply,
  releaseSyncRenderer,
} from "../services/plugin-sync";
import userSetting from "./user-setting";
import { getMainWindows } from "../windows/main-window";
import { pluginUploadRelay } from "../services/plugin-upload";
import type { UploadRequest, UploadRendererReply } from "../../../shared/upload-renderer";
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
    const updates = new PluginUpdates(directory(), app.getVersion());
    await updates.initialize();
    const preferences = new LocalPluginPreferences(directory());
    await userSetting.getSettingSnapshot();
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
    const defaults = (id: string) => initialSources[id]?.kind === "center";
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
    ipcMain.handle("plugin-local:upload-connect", (event, session: string) => {
      if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
        throw new Error("上传插件只能由主窗口执行");
      pluginUploadRelay.connect(event.sender, session);
    });
    ipcMain.handle("plugin-local:upload-release", (event, session: string) =>
      pluginUploadRelay.release(event.sender.id, session)
    );
    ipcMain.handle("plugin-local:upload-reply", (event, reply: UploadRendererReply) =>
      pluginUploadRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:upload", (event, request: UploadRequest) =>
      pluginUploadRelay.upload(event.sender, request)
    );
    ipcMain.handle("plugin-local:set-enabled", async (_event, id: string, enabled: boolean) => {
      const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (artifact.manifest.id !== id) throw new Error("插件身份无效");
      await pluginSyncSessions.protect(id, () => preferences.set(id, enabled));
      for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed()) window.webContents.send("plugin-local:state-changed");
    });
    ipcMain.handle(
      "plugin-local:workspace",
      async (_event, name: string) => (await getPluginRegistry().open(name)).id
    );
    ipcMain.handle("plugin-local:scan", async (_event, legacy?: Record<string, unknown>) => {
      if (legacy !== undefined) await preferences.importBrowser(legacy);
      const maintenance = await updates.list();
      const result = await discoverPlugins(directory(), app.getVersion());
      const sources = await updates.sources(result.entries.map(entry => entry.id));
      if (legacy !== undefined)
        await preferences.initialize(
          Object.fromEntries(
            result.entries
              .filter(entry => entry.artifact)
              .map(entry => [entry.id, sources[entry.id]?.kind === "center"])
          )
        );
      return {
        ...result,
        clientVersion: app.getVersion(),
        updates: maintenance,
        entries: result.entries.map(entry => {
          const blocked = maintenance.find(item => item.id === entry.id && item.blocked);
          const sourced = {
            ...entry,
            source: sources[entry.id],
            enabled: preferences.enabled(entry.id, sources[entry.id]?.kind === "center"),
          };
          return blocked
            ? { ...sourced, artifact: undefined, error: blocked.error ?? "更新尚未恢复，暂不加载" }
            : sourced;
        }),
      };
    });
    ipcMain.handle("plugin-local:stage-zip", async event => {
      if (app.isPackaged) throw new Error("请从插件中心安装插件");
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
      "plugin-local:sync-begin",
      (event, id: string, config: import("@tau/plugins").JsonValue) =>
        pluginSyncSessions.begin(event.sender.id, id, copyJson(config))
    );
    ipcMain.handle(
      "plugin-local:sync-reply",
      (event, reply: import("../../../shared/sync-renderer").SyncRendererReply) =>
        acceptSyncRendererReply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:sync-release-window", event =>
      releaseSyncRenderer(event.sender.id)
    );
    ipcMain.handle("plugin-local:sync-end", (event, session: string) =>
      pluginSyncSessions.end(event.sender.id, session)
    );
    ipcMain.handle(
      "plugin-local:sync-config",
      async (_event, id: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
        if (artifact.manifest.id !== id) throw new Error("插件身份无效");
        await userSetting.updateProviderPlugin("sync", id, copyJson(config));
      }
    );
    ipcMain.handle(
      "plugin-local:upload-config",
      async (_event, id: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
        if (artifact.manifest.id !== id) throw new Error("插件身份无效");
        await userSetting.updateProviderPlugin("imageBed", id, copyJson(config));
      }
    );
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
    ipcMain.handle("plugin-local:relaunch", async () => {
      if (await pluginSyncSessions.hasTasks()) throw new Error("同步任务正在进行，请完成后重启");
      app.relaunch();
      app.quit();
    });
    ipcMain.handle("plugin-local:uninstall", async (_event, id: string) => {
      if (await contentStartup.uses(id)) throw new Error("请先停用内容插件并重启应用，再卸载");
      await pluginSyncSessions.protect(id, async () => {
        await updates.uninstall(id);
        await preferences.forget(id);
      });
      for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed()) window.webContents.send("plugin-local:state-changed");
    });
    ipcMain.handle("plugin-local:restore", (_event, id: string) =>
      pluginSyncSessions.protect(id, () => updates.restore(id))
    );
    ipcMain.handle("plugin-local:cancel-update", (_event, id: string) => updates.cancel(id));
    ipcMain.handle("plugin-local:open-directory", async () => {
      const root = directory();
      await mkdir(root, { recursive: true });
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
    });
  },
};
