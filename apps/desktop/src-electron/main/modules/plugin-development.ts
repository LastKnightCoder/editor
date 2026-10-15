import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readDevelopmentPlugin } from "../services/plugin-package";
import {
  DevelopmentPluginRegistry,
  pluginWorkspaceName,
  restoreDevelopmentPlugin,
} from "../services/plugin-registry";
import { randomUUID } from "node:crypto";
import path from "node:path";

interface Session {
  token: string;
  workspaceId: string;
  name: string;
  reserved: string[];
  release: () => void;
}

export default {
  name: "plugin-development",
  async init() {
    const sessions = new Map<number, Session>();
    let registry: DevelopmentPluginRegistry | undefined;
    const store = () =>
      (registry ??= new DevelopmentPluginRegistry(
        path.join(app.getPath("userData"), "plugin-development", "registry.json")
      ));
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
      };
      sessions.set(window.id, session);
      const release = () => {
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
      const artifact = await readDevelopmentPlugin(directory);
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
  },
};
