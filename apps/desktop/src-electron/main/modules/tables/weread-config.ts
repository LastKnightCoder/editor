import { Database } from "better-sqlite3";
import { Table } from "../../types/table";

class WeReadConfigTable implements Table {
  upgradeTable(_db: Database): void {
    // 未来版本升级时使用
  }

  getListenEvents(): Record<string, (db: Database, ...args: any) => any> {
    return {};
  }

  set(db: Database, key: string, value: string | number | null): void {
    const stmt = db.prepare(`
      INSERT INTO weread_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value !== null ? String(value) : null, Date.now());
  }

  get(db: Database, key: string): string | null {
    const stmt = db.prepare(`
      SELECT value FROM weread_config WHERE key = ?
    `);
    const row = stmt.get(key) as any;
    return row ? row.value : null;
  }

  getNumber(db: Database, key: string): number | null {
    const value = this.get(db, key);
    return value ? Number(value) : null;
  }
}

export default new WeReadConfigTable();
