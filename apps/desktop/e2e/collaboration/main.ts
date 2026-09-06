import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import database from "./database";
import ContentTable from "./content-table";
import manager from "../../src-electron/main/modules/collaboration";
import { contentSession } from "../../src-electron/main/modules/collaboration/content-sessions";

app.setPath("userData", join(process.env.TAU_COLLAB_E2E_DIR!, "electron"));
app.commandLine.appendSwitch("use-mock-keychain");
async function boot() {
  await app.whenReady();
  await manager.init();
  const open = async (databaseName = "primary") => {
    const window = new BrowserWindow({
      width: 1180,
      height: 820,
      show: true,
      webPreferences: {
        preload: process.env.TAU_COLLAB_E2E_PRELOAD,
        contextIsolation: true,
        sandbox: false,
      },
    });
    database.windowToDatabase.set(window.id, databaseName);
    await window.loadURL(
      `${process.env.TAU_COLLAB_E2E_URL}/e2e/collaboration/index.html?databaseName=${databaseName}`
    );
    return window.id;
  };
  ipcMain.handle("e2e:open-window", (_event, name: string) => open(name));
  ipcMain.handle("e2e:quit", () => {
    setTimeout(() => app.quit(), 0);
    return true;
  });
  ipcMain.handle("e2e:database", event => {
    const window = BrowserWindow.fromWebContents(event.sender)!;
    const db = database.getDatabase(database.windowToDatabase.get(window.id)!)!;
    return {
      content: ContentTable.getContentById(db, 7),
      sessionTitle: contentSession(db, 7)?.doc.getText("title").toString(),
      frozen: contentSession(db, 7)?.info.frozen,
      titles: ["articles", "project_item", "document_items"].map(
        table => (db.prepare(`SELECT title FROM ${table} LIMIT 1`).get() as { title: string }).title
      ),
    };
  });
  ipcMain.handle("content:get-by-id", (event, id: number) => {
    const window = BrowserWindow.fromWebContents(event.sender)!;
    return ContentTable.getContentById(
      database.getDatabase(database.windowToDatabase.get(window.id)!)!,
      id
    );
  });
  ipcMain.handle("get-platform", () => process.platform);
  ipcMain.handle("get-home-dir", () => process.env.TAU_COLLAB_E2E_DIR);
  ipcMain.handle("get-editor-dir", () => process.env.TAU_COLLAB_E2E_DIR);
  await open();
}
void boot();
