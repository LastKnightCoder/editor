import Database from "better-sqlite3";
import {
  IGoalItem,
  ICreateGoalItem,
  IUpdateGoalItem,
  EGoalItemType,
  EGoalItemStatus,
} from "@/types";

export default class GoalItemTable {
  static getListenEvents() {
    return {
      "create-goal-item": this.createGoalItem.bind(this),
      "update-goal-item": this.updateGoalItem.bind(this),
      "delete-goal-item": this.deleteGoalItem.bind(this),
      "get-goal-item-by-id": this.getGoalItemById.bind(this),
      "get-goal-items-by-goal-id": this.getGoalItemsByGoalId.bind(this),
      "get-goal-items-by-parent-id": this.getGoalItemsByParentId.bind(this),
      "update-goal-item-progress": this.updateGoalItemProgress.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS goal_items (
        id INTEGER PRIMARY KEY,
        goal_id INTEGER NOT NULL,
        parent_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        target_value REAL,
        current_value REAL DEFAULT 0,
        unit TEXT,
        sort_order INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 升级表结构的逻辑
  }

  static createGoalItem(
    db: Database.Database,
    itemData: ICreateGoalItem,
  ): IGoalItem {
    const now = Date.now();
    const {
      goal_id,
      parent_id,
      title,
      description,
      type,
      status = EGoalItemStatus.NotStarted,
      target_value,
      current_value = 0,
      unit,
      sort_order = 0,
    } = itemData;

    const insertSql = `
      INSERT INTO goal_items (
        goal_id, parent_id, title, description, type, status,
        target_value, current_value, unit, sort_order, create_time, update_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(insertSql);
    const result = stmt.run(
      goal_id,
      parent_id,
      title,
      description,
      type,
      status,
      target_value,
      current_value,
      unit,
      sort_order,
      now,
      now,
    );

    if (result.lastInsertRowid) {
      return this.getGoalItemById(db, Number(result.lastInsertRowid));
    } else {
      throw new Error("Failed to create goal item");
    }
  }

  static updateGoalItem(
    db: Database.Database,
    itemData: IUpdateGoalItem,
  ): IGoalItem {
    const now = Date.now();
    const { id, ...updateFields } = itemData;

    const updateParts: string[] = [];
    const updateValues: any[] = [];

    Object.entries(updateFields).forEach(([key, value]) => {
      if (value !== undefined) {
        updateParts.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateParts.length === 0) {
      return this.getGoalItemById(db, id);
    }

    updateParts.push("update_time = ?");
    updateValues.push(now);

    const updateSql = `UPDATE goal_items SET ${updateParts.join(", ")} WHERE id = ?`;
    updateValues.push(id);

    const stmt = db.prepare(updateSql);
    stmt.run(...updateValues);

    return this.getGoalItemById(db, id);
  }

  static deleteGoalItem(db: Database.Database, id: number): boolean {
    const deleteSql = "DELETE FROM goal_items WHERE id = ?";
    const stmt = db.prepare(deleteSql);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static getGoalItemById(db: Database.Database, id: number): IGoalItem {
    const selectSql = "SELECT * FROM goal_items WHERE id = ?";
    const stmt = db.prepare(selectSql);
    const row = stmt.get(id) as any;

    if (!row) {
      throw new Error(`Goal item with id ${id} not found`);
    }

    return this.mapRowToGoalItem(row);
  }

  static getGoalItemsByGoalId(
    db: Database.Database,
    goalId: number,
  ): IGoalItem[] {
    const selectSql =
      "SELECT * FROM goal_items WHERE goal_id = ? ORDER BY sort_order, create_time";
    const stmt = db.prepare(selectSql);
    const rows = stmt.all(goalId) as any[];

    return rows.map((row) => this.mapRowToGoalItem(row));
  }

  static getGoalItemsByParentId(
    db: Database.Database,
    parentId: number | null,
  ): IGoalItem[] {
    let selectSql: string;
    let params: any[];

    if (parentId === null) {
      selectSql =
        "SELECT * FROM goal_items WHERE parent_id IS NULL ORDER BY sort_order, create_time";
      params = [];
    } else {
      selectSql =
        "SELECT * FROM goal_items WHERE parent_id = ? ORDER BY sort_order, create_time";
      params = [parentId];
    }

    const stmt = db.prepare(selectSql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.mapRowToGoalItem(row));
  }

  static updateGoalItemProgress(
    db: Database.Database,
    id: number,
    progressDelta: number,
  ): IGoalItem {
    const item = this.getGoalItemById(db, id);

    if (item.type !== EGoalItemType.Progress) {
      throw new Error("Can only update progress for progress type goal items");
    }

    const newCurrentValue = (item.current_value || 0) + progressDelta;

    // 根据目标值自动判断是否完成
    let newStatus = item.status;
    if (item.target_value && newCurrentValue >= item.target_value) {
      newStatus = EGoalItemStatus.Completed;
    } else if (
      newCurrentValue > 0 &&
      item.status === EGoalItemStatus.NotStarted
    ) {
      newStatus = EGoalItemStatus.InProgress;
    }

    return this.updateGoalItem(db, {
      id,
      current_value: newCurrentValue,
      status: newStatus,
    });
  }

  private static mapRowToGoalItem(row: any): IGoalItem {
    return {
      id: row.id,
      goal_id: row.goal_id,
      parent_id: row.parent_id,
      title: row.title,
      description: row.description,
      type: row.type as EGoalItemType,
      status: row.status as EGoalItemStatus,
      target_value: row.target_value,
      current_value: row.current_value,
      unit: row.unit,
      sort_order: row.sort_order,
      create_time: row.create_time,
      update_time: row.update_time,
    };
  }
}
