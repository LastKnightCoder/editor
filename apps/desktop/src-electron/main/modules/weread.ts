import { ipcMain } from "electron";
import type { Notebook } from "@/types/weread";
import databaseModule from "./database";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadConfigTable from "./tables/weread-config";

class WeReadModule {
  async init() {
    // Notebook operations
    ipcMain.handle("weread:save-notebook", async (_event, notebook: Notebook) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadNotebookTable.save(db, notebook);
    });

    ipcMain.handle("weread:save-notebooks", async (_event, notebooks: Notebook[]) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadNotebookTable.saveMany(db, notebooks);
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
      WeReadNotebookTable.delete(db, bookId);
    });

    ipcMain.handle("weread:update-notebook", async (_event, notebook: Notebook) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadNotebookTable.save(db, notebook);
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
