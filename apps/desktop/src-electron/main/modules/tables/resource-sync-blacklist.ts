import Database from "better-sqlite3";

export interface ResourceSyncBlacklistRow {
  id: number;
  file_name: string;
  create_time: number;
  update_time: number;
}

export interface ResourceSyncBlacklistItem {
  id: number;
  fileName: string;
  createTime: number;
  updateTime: number;
}

const parse = (row: ResourceSyncBlacklistRow): ResourceSyncBlacklistItem => ({
  id: row.id,
  fileName: row.file_name,
  createTime: row.create_time,
  updateTime: row.update_time,
});

export default class ResourceSyncBlacklistTable {
  static getListenEvents() {
    return {
      "resource-sync-blacklist:list": this.list.bind(this),
      "resource-sync-blacklist:add": this.add.bind(this),
      "resource-sync-blacklist:remove": this.remove.bind(this),
      "resource-sync-blacklist:clear": this.clear.bind(this),
    };
  }
  static list(db: Database.Database): ResourceSyncBlacklistItem[] {
    const stmt = db.prepare(
      "SELECT * FROM resource_sync_blacklist ORDER BY update_time DESC, create_time DESC"
    );
    return (stmt.all() as ResourceSyncBlacklistRow[]).map(parse);
  }

  static add(db: Database.Database, fileNames: string[] = []): ResourceSyncBlacklistItem[] {
    const normalized = Array.from(
      new Set((fileNames || []).map(name => name?.trim()).filter((name): name is string => !!name))
    );
    if (!normalized.length) {
      return this.list(db);
    }

    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO resource_sync_blacklist (file_name, create_time, update_time)
      VALUES (?, ?, ?)
      ON CONFLICT(file_name) DO UPDATE SET update_time = excluded.update_time
    `);

    const insert = db.transaction((names: string[]) => {
      names.forEach(name => {
        stmt.run(name, now, now);
      });
    });
    insert(normalized);
    return this.list(db);
  }

  static remove(
    db: Database.Database,
    payload: { ids?: number[]; fileNames?: string[] } = {}
  ): ResourceSyncBlacklistItem[] {
    const ids = Array.from(new Set((payload.ids || []).filter((id): id is number => !!id)));
    const names = Array.from(
      new Set(
        (payload.fileNames || []).map(name => name?.trim()).filter((name): name is string => !!name)
      )
    );

    if (!ids.length && !names.length) {
      return this.list(db);
    }

    const removeById =
      ids.length > 0
        ? db.prepare(
            `DELETE FROM resource_sync_blacklist WHERE id IN (${ids.map(() => "?").join(",")})`
          )
        : null;

    if (removeById) {
      removeById.run(...ids);
    }

    if (names.length) {
      const stmt = db.prepare("DELETE FROM resource_sync_blacklist WHERE file_name = ?");
      const batch = db.transaction((list: string[]) => {
        list.forEach(name => stmt.run(name));
      });
      batch(names);
    }

    return this.list(db);
  }

  static clear(db: Database.Database): ResourceSyncBlacklistItem[] {
    db.exec("DELETE FROM resource_sync_blacklist");
    return [];
  }
}
