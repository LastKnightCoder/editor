import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readPluginPackage } from "../services/plugin-package";
import { pluginWorkspaceName, restoreDevelopmentPlugin } from "../services/plugin-registry";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PluginBuildWatcher } from "../services/plugin-build-watcher";
import { getPluginRegistry } from "../services/plugin-workspaces";
import type {
  DevelopmentPluginRecord,
  RestoredDevelopmentPlugin,
} from "@/types/plugin-development";

interface Session {
  token: string;
  workspaceId: string;
  name: string;
  reserved: string[];
  release: () => void;
  reloads: Map<
    string,
    { ticket: string; previous: DevelopmentPluginRecord; next: RestoredDevelopmentPlugin }
  >;
  watchers: Map<string, { watchId: string; watcher: PluginBuildWatcher }>;
}

export default {
  name: "plugin-development",
  async init() {
    const sessions = new Map<number, Session>();
    const store = getPluginRegistry;
    const windowFor = (event: Electron.IpcMainInvokeEvent) => {
      if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL)
        throw new Error("外部开发插件仅在桌面开发环境可用");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("插件目录选择需要应用窗口");
      return window;
    };
    const sessionFor = (event: Electron.IpcMainInvokeEvent, token: string) => {
      const window = windowFor(event);
      const session = sessions.get(window.id);
      if (!session || session.token !== token) throw new Error("插件管理会话已失效");
      return session;
    };
    ipcMain.handle("plugin-development:open", async (event, name: string, reserved: string[]) => {
      const window = windowFor(event);
      const normalized = pluginWorkspaceName(name);
      if (!Array.isArray(reserved) || reserved.some(id => typeof id !== "string"))
        throw new Error("插件保留身份无效");
      if (
        [...sessions.entries()].some(([id, value]) => id !== window.id && value.name === normalized)
      )
        throw new Error("此工作区的开发插件已由另一窗口管理，请先关闭该窗口");
      sessions.get(window.id)?.release();
      const session: Session = {
        token: randomUUID(),
        workspaceId: "",
        name: normalized,
        reserved,
        release: () => undefined,
        reloads: new Map(),
        watchers: new Map(),
      };
      sessions.set(window.id, session);
      const release = () => {
        for (const item of session.watchers.values()) item.watcher.close();
        session.watchers.clear();
        if (sessions.get(window.id) === session) sessions.delete(window.id);
        event.sender.removeListener("destroyed", release);
      };
      session.release = release;
      event.sender.once("destroyed", release);
      try {
        const workspace = await store().open(normalized);
        if (workspace.plugins.some(record => reserved.includes(record.manifest.id)))
          throw new Error("开发插件登记与内置插件 ID 冲突，请修复登记文件后重启");
        sessionFor(event, session.token);
        session.workspaceId = workspace.id;
        const plugins = await Promise.all(workspace.plugins.map(restoreDevelopmentPlugin));
        sessionFor(event, session.token);
        return {
          token: session.token,
          workspaceId: workspace.id,
          plugins,
          skipStartup: process.env.TAU_DISABLE_DEV_PLUGINS === "1",
        };
      } catch (error) {
        release();
        throw error;
      }
    });
    ipcMain.handle("plugin-development:close", (event, token: string) => {
      const window = windowFor(event);
      if (sessions.get(window.id)?.token === token) sessions.get(window.id)?.release();
    });
    ipcMain.handle("plugin-development:choose", async (event, token: string) => {
      const window = windowFor(event);
      const result = await dialog.showOpenDialog(window, {
        title: "选择已构建的可信插件目录",
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const session = sessionFor(event, token);
      const directory = result.filePaths[0];
      const artifact = await readPluginPackage(directory);
      sessionFor(event, token);
      if (session.reserved.includes(artifact.manifest.id)) throw new Error("插件已注册为内置样本");
      const record = await store().add(session.workspaceId, {
        directory,
        manifest: artifact.manifest,
        enabled: false,
        starting: false,
      });
      return { ...record, artifact };
    });
    ipcMain.handle(
      "plugin-development:state",
      async (event, token: string, id: string, enabled: boolean, starting: boolean) => {
        const session = sessionFor(event, token);
        if (typeof id !== "string" || typeof enabled !== "boolean" || typeof starting !== "boolean")
          throw new Error("插件状态无效");
        await store().state(session.workspaceId, id, enabled, starting);
      }
    );
    ipcMain.handle("plugin-development:remove", async (event, token: string, id: string) => {
      const session = sessionFor(event, token);
      if (typeof id !== "string") throw new Error("插件 ID 无效");
      await store().remove(session.workspaceId, id);
    });
    ipcMain.handle("plugin-development:retire", async (event, name: string) => {
      windowFor(event);
      const normalized = pluginWorkspaceName(name);
      if ([...sessions.values()].some(value => value.name === normalized))
        throw new Error("请先关闭此数据库的插件管理窗口");
      await store().retire(normalized);
    });
    ipcMain.handle(
      "plugin-development:prepare-reload",
      async (event, token: string, id: string, buildId?: string) => {
        const session = sessionFor(event, token);
        const previous = await store().get(session.workspaceId, id);
        let directory: string;
        let artifact;
        if (buildId !== undefined) {
          const build = session.watchers.get(id)?.watcher.get(buildId);
          if (!build) return null;
          ({ directory, artifact } = build);
        } else {
          const result = await dialog.showOpenDialog(windowFor(event), {
            title: "选择此插件的新构建目录",
            properties: ["openDirectory"],
          });
          sessionFor(event, token);
          if (result.canceled || !result.filePaths[0]) return null;
          directory = result.filePaths[0];
          artifact = await readPluginPackage(directory);
        }
        sessionFor(event, token);
        if (artifact.manifest.id !== id) throw new Error("新构建的插件 ID 与当前插件不一致");
        const next = { ...previous, directory, manifest: artifact.manifest, artifact };
        const ticket = randomUUID();
        session.reloads.set(id, { ticket, previous, next });
        return { ticket, record: next };
      }
    );
    ipcMain.handle(
      "plugin-development:commit-reload",
      async (
        event,
        token: string,
        ticket: string,
        target: string,
        enabled: boolean,
        starting: boolean
      ) => {
        const session = sessionFor(event, token);
        const reload = [...session.reloads.values()].find(item => item.ticket === ticket);
        if (
          !reload ||
          (target !== "next" && target !== "previous") ||
          typeof enabled !== "boolean" ||
          typeof starting !== "boolean"
        )
          throw new Error("插件重载事务已失效");
        await store().replace(session.workspaceId, { ...reload[target], enabled, starting });
      }
    );
    ipcMain.handle("plugin-development:discard-reload", (event, token: string, ticket: string) => {
      const session = sessionFor(event, token);
      for (const [id, reload] of session.reloads)
        if (reload.ticket === ticket) session.reloads.delete(id);
    });
    ipcMain.handle(
      "plugin-development:watch",
      async (event, token: string, id: string, watchId: string, enabled: boolean) => {
        const session = sessionFor(event, token);
        if (typeof watchId !== "string" || !watchId || typeof enabled !== "boolean")
          throw new Error("监听请求无效");
        const existing = session.watchers.get(id);
        if (!enabled) {
          if (existing?.watchId === watchId) {
            existing.watcher.close();
            session.watchers.delete(id);
          }
          return;
        }
        const record = await store().get(session.workspaceId, id);
        sessionFor(event, token);
        const windowId = windowFor(event).id;
        existing?.watcher.close();
        const watcher = new PluginBuildWatcher(path.dirname(record.directory), id, result => {
          if (session.watchers.get(id)?.watcher !== watcher || sessions.get(windowId) !== session)
            return;
          if (result.stopped) session.watchers.delete(id);
          if (!event.sender.isDestroyed())
            event.sender.send("plugin-development:build", { token, id, watchId, ...result });
        });
        const owned = { watchId, watcher };
        session.watchers.set(id, owned);
        try {
          await watcher.start();
          sessionFor(event, token);
        } catch (error) {
          watcher.close();
          if (session.watchers.get(id) === owned) session.watchers.delete(id);
          throw error;
        }
      }
    );
  },
};
