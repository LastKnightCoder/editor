import { ipcMain } from "electron";
import log from "electron-log";
import type { Notebook } from "@/types/weread";
import databaseModule from "./database";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadConfigTable from "./tables/weread-config";
import { WEREAD_EXCERPTS_CHANGED_EVENT } from "./tables/excerpt";
import { backfillWeReadExcerpts } from "./tables/weread-excerpts";
import { hasExcerptChanges, type ExcerptSyncResult } from "@/entity/excerpt/types";

const notifyExcerpts = (changed: ExcerptSyncResult | boolean | number | null) => {
  const dirty = typeof changed === "object" ? hasExcerptChanges(changed) : Boolean(changed);
  if (dirty) databaseModule.notifyExternalWrite(WEREAD_EXCERPTS_CHANGED_EVENT);
};

class WeReadModule {
  async init() {
    databaseModule.onDatabaseConnected(dbName => {
      const db = databaseModule.getDatabase(dbName);
      if (!db?.open) return;
      try {
        notifyExcerpts(backfillWeReadExcerpts(db));
      } catch (error) {
        log.error("[WeRead] 摘录回填失败，下次连库重试", error);
      }
    });

    // Notebook operations
    ipcMain.handle("weread:save-notebook", async (_event, notebook: Notebook) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      notifyExcerpts(WeReadNotebookTable.save(db, notebook));
    });

    ipcMain.handle("weread:save-notebooks", async (_event, notebooks: Notebook[]) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      notifyExcerpts(WeReadNotebookTable.saveMany(db, notebooks));
    });

    ipcMain.handle("weread:get-all-notebooks", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadNotebookTable.getAll(db);
    });

    ipcMain.handle("weread:get-notebook-by-id", async (_event, bookId: string) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadNotebookTable.getById(db, bookId);
    });

    ipcMain.handle("weread:delete-notebook", async (_event, bookId: string) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      notifyExcerpts(WeReadNotebookTable.delete(db, bookId));
    });

    ipcMain.handle("weread:update-notebook", async (_event, notebook: Notebook) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      notifyExcerpts(WeReadNotebookTable.save(db, notebook));
    });

    ipcMain.handle("weread:get-last-sync-time", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadConfigTable.getNumber(db, "last_sync_time");
    });

    ipcMain.handle("weread:update-sync-time", async (_event, timestamp: number) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadConfigTable.set(db, "last_sync_time", timestamp);
    });
  }
}

export default new WeReadModule();
