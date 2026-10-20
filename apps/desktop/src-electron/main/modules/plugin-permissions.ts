import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { Module } from "../types/module";
import { PluginPermissionStore } from "../services/plugin-permissions";
import type { PluginPermissionGrant, PluginUsageKind } from "@/types/plugin-permissions";

let store: PluginPermissionStore | undefined;

/** 授权按插件 × 工作区保存在应用数据目录，与插件代码目录分离。 */
export function getPluginPermissionStore() {
  return (store ??= new PluginPermissionStore(
    path.join(app.getPath("userData"), "plugin-permissions.json")
  ));
}

function broadcast(workspaceId: string) {
  for (const window of BrowserWindow.getAllWindows())
    if (!window.isDestroyed()) window.webContents.send("plugin-permissions:changed", workspaceId);
}

class PluginPermissionsModule implements Module {
  name = "plugin-permissions";

  async init() {
    const permissions = getPluginPermissionStore();
    ipcMain.handle("plugin-permissions:snapshot", (_event, workspaceId: string) =>
      permissions.snapshot(workspaceId)
    );
    ipcMain.handle(
      "plugin-permissions:set",
      async (
        _event,
        workspaceId: string,
        pluginId: string,
        permission: string,
        grant: PluginPermissionGrant | null
      ) => {
        await permissions.set(workspaceId, pluginId, permission, grant);
        broadcast(workspaceId);
      }
    );
    ipcMain.handle(
      "plugin-permissions:record",
      (
        _event,
        workspaceId: string,
        pluginId: string,
        counts: Partial<Record<PluginUsageKind, number>>
      ) => permissions.record(workspaceId, pluginId, counts)
    );
    ipcMain.handle("plugin-permissions:usage", (_event, workspaceId: string, pluginId: string) =>
      permissions.usage(workspaceId, pluginId)
    );
  }
}

export default new PluginPermissionsModule();
