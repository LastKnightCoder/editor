import Database from "better-sqlite3";
import {
  IGoalProgressEntry,
  ICreateGoalProgressEntry,
  IUpdateGoalProgressEntry,
} from "@/types";

export default class GoalProgressEntryTable {
  static getListenEvents() {
    return {
      "create-goal-progress-entry": this.createGoalProgressEntry.bind(this),
      "update-goal-progress-entry": this.updateGoalProgressEntry.bind(this),
      "delete-goal-progress-entry": this.deleteGoalProgressEntry.bind(this),
      "get-goal-progress-entry-by-id": this.getGoalProgressEntryById.bind(this),
      "get-goal-progress-entries-by-goal-item-id":
        this.getGoalProgressEntriesByGoalItemId.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS goal_progress_entries (
        id INTEGER PRIMARY KEY,
        goal_item_id INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        progress_delta REAL,
        create_time INTEGER NOT NULL
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 升级表结构的逻辑
  }

  static createGoalProgressEntry(
    db: Database.Database,
    entryData: ICreateGoalProgressEntry,
  ): IGoalProgressEntry {
    const now = Date.now();
    const { goal_item_id, title, description, progress_delta } = entryData;

    const insertSql = `
      INSERT INTO goal_progress_entries (goal_item_id, title, description, progress_delta, create_time)
      VALUES (?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(insertSql);
    const result = stmt.run(
      goal_item_id,
      title,
      description,
      progress_delta,
      now,
    );

    if (result.lastInsertRowid) {
      return this.getGoalProgressEntryById(db, Number(result.lastInsertRowid));
    } else {
      throw new Error("Failed to create goal progress entry");
    }
  }

  static updateGoalProgressEntry(
    db: Database.Database,
    entryData: IUpdateGoalProgressEntry,
  ): IGoalProgressEntry {
    const { id, title, description, progress_delta } = entryData;

    // 构建动态更新语句
    const updateFields: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updateFields.push("title = ?");
      values.push(title);
    }
    if (description !== undefined) {
      updateFields.push("description = ?");
      values.push(description);
    }
    if (progress_delta !== undefined) {
      updateFields.push("progress_delta = ?");
      values.push(progress_delta);
    }

    if (updateFields.length === 0) {
      // 如果没有字段需要更新，直接返回当前记录
      return this.getGoalProgressEntryById(db, id);
    }

    const updateSql = `
      UPDATE goal_progress_entries 
      SET ${updateFields.join(", ")} 
      WHERE id = ?
    `;
    values.push(id);

    const stmt = db.prepare(updateSql);
    const result = stmt.run(...values);

    if (result.changes > 0) {
      return this.getGoalProgressEntryById(db, id);
    } else {
      throw new Error(`Failed to update goal progress entry with id ${id}`);
    }
  }

  static deleteGoalProgressEntry(db: Database.Database, id: number): boolean {
    const deleteSql = "DELETE FROM goal_progress_entries WHERE id = ?";
    const stmt = db.prepare(deleteSql);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static getGoalProgressEntryById(
    db: Database.Database,
    id: number,
  ): IGoalProgressEntry {
    const selectSql = "SELECT * FROM goal_progress_entries WHERE id = ?";
    const stmt = db.prepare(selectSql);
    const row = stmt.get(id) as any;

    if (!row) {
      throw new Error(`Goal progress entry with id ${id} not found`);
    }

    return this.mapRowToGoalProgressEntry(row);
  }

  static getGoalProgressEntriesByGoalItemId(
    db: Database.Database,
    goalItemId: number,
  ): IGoalProgressEntry[] {
    const selectSql =
      "SELECT * FROM goal_progress_entries WHERE goal_item_id = ? ORDER BY create_time DESC";
    const stmt = db.prepare(selectSql);
    const rows = stmt.all(goalItemId) as any[];

    return rows.map((row) => this.mapRowToGoalProgressEntry(row));
  }

  private static mapRowToGoalProgressEntry(row: any): IGoalProgressEntry {
    return {
      id: row.id,
      goal_item_id: row.goal_item_id,
      title: row.title,
      description: row.description,
      progress_delta: row.progress_delta,
      create_time: row.create_time,
    };
  }
}
