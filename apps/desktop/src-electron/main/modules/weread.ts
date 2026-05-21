import { ipcMain } from "electron";
import type { Notebook } from "@/types/weread";
import type { DataTableView } from "@/types";
import databaseModule from "./database";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadViewTable from "./tables/weread-view";
import WeReadConfigTable from "./tables/weread-config";

class WeReadModule {
  async init() {
    // Notebook operations
    ipcMain.handle(
      "weread:save-notebook",
      async (_event, notebook: Notebook) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.save(db, notebook);
      },
    );

    ipcMain.handle(
      "weread:save-notebooks",
      async (_event, notebooks: Notebook[]) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.saveMany(db, notebooks);
      },
    );

    ipcMain.handle("weread:get-all-notebooks", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadNotebookTable.getAll(db);
    });

    ipcMain.handle(
      "weread:get-notebook-by-id",
      async (_event, bookId: string) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        return WeReadNotebookTable.getById(db, bookId);
      },
    );

    ipcMain.handle("weread:delete-notebook", async (_event, bookId: string) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadNotebookTable.delete(db, bookId);
    });

    ipcMain.handle(
      "weread:update-notebook",
      async (_event, notebook: Notebook) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.save(db, notebook);
      },
    );

    ipcMain.handle("weread:get-last-sync-time", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadConfigTable.getNumber(db, "last_sync_time");
    });

    ipcMain.handle(
      "weread:update-sync-time",
      async (_event, timestamp: number) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadConfigTable.set(db, "last_sync_time", timestamp);
      },
    );

    // View operations
    ipcMain.handle("weread:save-view", async (_event, view: DataTableView) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadViewTable.save(db, view);
    });

    ipcMain.handle("weread:get-all-views", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadViewTable.getAll(db);
    });

    ipcMain.handle(
      "weread:update-view",
      async (_event, view: DataTableView) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadViewTable.save(db, view);
      },
    );

    ipcMain.handle("weread:delete-view", async (_event, viewId: number) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadViewTable.delete(db, viewId);
    });

    ipcMain.handle("weread:get-active-view-id", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadConfigTable.getNumber(db, "active_view_id");
    });

    ipcMain.handle(
      "weread:save-active-view-id",
      async (_event, viewId: number) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadConfigTable.set(db, "active_view_id", viewId);
      },
    );
  }
}

export default new WeReadModule();
