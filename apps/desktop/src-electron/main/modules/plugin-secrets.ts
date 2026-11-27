import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import Database from "better-sqlite3";
import path from "node:path";
import { isMainWindow } from "../windows/main-window";

function checkSender(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !isMainWindow(window) || event.senderFrame !== event.sender.mainFrame)
    throw new Error("凭据只能由主窗口的插件宿主访问");
}

export async function registerPluginSecrets() {
  let store: Database.Database | undefined;
  const database = () => {
    if (store) return store;
    const db = new Database(path.join(app.getPath("userData"), "plugin-secrets.sqlite"));
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS secrets (
        workspace TEXT NOT NULL, plugin TEXT NOT NULL, key TEXT NOT NULL, value BLOB NOT NULL,
        PRIMARY KEY (workspace, plugin, key)
      ) WITHOUT ROWID`);
    } catch (error) {
      db.close();
      throw error;
    }
    return (store = db);
  };
  const encryption = () => {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw new Error("系统安全存储不可用");
    return safeStorage;
  };

  ipcMain.handle("plugin-secrets:get", (event, workspace: string, plugin: string, key: string) => {
    checkSender(event);
    const row = database()
      .prepare<[string, string, string], { value: Buffer }>(
        "SELECT value FROM secrets WHERE workspace=? AND plugin=? AND key=?"
      )
      .get(workspace, plugin, key);
    return row && encryption().decryptString(row.value);
  });
  ipcMain.handle(
    "plugin-secrets:set",
    (event, workspace: string, plugin: string, key: string, value: string) => {
      checkSender(event);
      const encrypted = encryption().encryptString(value);
      database()
        .prepare("INSERT OR REPLACE INTO secrets VALUES (?,?,?,?)")
        .run(workspace, plugin, key, encrypted);
    }
  );
  ipcMain.handle(
    "plugin-secrets:delete",
    (event, workspace: string, plugin: string, key: string) => {
      checkSender(event);
      database()
        .prepare("DELETE FROM secrets WHERE workspace=? AND plugin=? AND key=?")
        .run(workspace, plugin, key);
    }
  );
  ipcMain.handle("plugin-secrets:clear", (event, workspace: string, plugin: string) => {
    checkSender(event);
    database().prepare("DELETE FROM secrets WHERE workspace=? AND plugin=?").run(workspace, plugin);
  });
  app.once("will-quit", () => store?.close());
}
