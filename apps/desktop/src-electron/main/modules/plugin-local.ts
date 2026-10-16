import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import { discoverPlugins } from "../services/plugin-discovery";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { PluginUpdates } from "../services/plugin-updates";
import { readPluginPackage } from "../services/plugin-package";
import { PluginEditorStartup } from "../services/plugin-editor-startup";
import { installBundledPlugins } from "../services/plugin-bundled";
import { acceptHeadlessPlugin } from "../services/plugin-codecs";
import { EditorPluginPreferences } from "../services/plugin-preferences";
import {
  downloadPluginRelease,
  fetchPluginCatalog,
  fetchPluginRelease,
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
    const preferences = new EditorPluginPreferences(directory());
    await preferences.load();
    const editorStartup = new PluginEditorStartup(async id => {
      const maintenance = await updates.list();
      if (maintenance.some(item => item.id === id && item.blocked))
        throw new Error("插件更新尚未恢复");
      const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (artifact.manifest.id !== id || !artifact.manifest.editor)
        throw new Error("编辑器插件身份或声明无效");
      acceptHeadlessPlugin(artifact);
      return artifact;
    });
    const initial = await discoverPlugins(directory(), app.getVersion());
    const initialSources = await updates.sources(initial.entries.map(entry => entry.id));
    const defaults = (id: string) => bundled.includes(id) || initialSources[id]?.kind === "center";
    const snapshot = await editorStartup.get(
      initial.entries
        .filter(
          entry =>
            entry.artifact?.manifest.editor && preferences.enabled(entry.id, defaults(entry.id))
        )
        .map(entry => entry.id)
    );
    ipcMain.handle("plugin-local:editor-startup", () => snapshot);
    ipcMain.handle("plugin-local:editor-enabled", async (_event, id: string, enabled: boolean) => {
      const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (!artifact.manifest.editor) throw new Error("插件没有编辑器声明");
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
            editorEnabled: preferences.enabled(
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
    ipcMain.handle("plugin-local:catalog", (_event, query?: string) =>
      fetchPluginCatalog(app.getVersion(), query)
    );
    ipcMain.handle("plugin-local:release", (_event, id: string) => fetchPluginRelease(id));
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
      if (await editorStartup.uses(id)) throw new Error("请先停用编辑器插件并重启应用，再卸载");
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
