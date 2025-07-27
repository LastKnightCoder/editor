import Database from "better-sqlite3";
import { IGoal, ICreateGoal, IUpdateGoal, EGoalStatus } from "@/types";

export default class GoalTable {
  static getListenEvents() {
    return {
      "create-goal": this.createGoal.bind(this),
      "update-goal": this.updateGoal.bind(this),
      "delete-goal": this.deleteGoal.bind(this),
      "get-goal-by-id": this.getGoalById.bind(this),
      "get-all-goals": this.getAllGoals.bind(this),
      "get-goals-by-status": this.getGoalsByStatus.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date INTEGER,
        end_date INTEGER,
        status TEXT DEFAULT 'in_progress',
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // 升级表结构的逻辑
  }

  static createGoal(db: Database.Database, goalData: ICreateGoal): IGoal {
    const now = Date.now();
    const {
      title,
      description,
      start_date,
      end_date,
      status = EGoalStatus.InProgress,
    } = goalData;

    const insertSql = `
      INSERT INTO goals (title, description, start_date, end_date, status, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(insertSql);
    const result = stmt.run(
      title,
      description,
      start_date,
      end_date,
      status,
      now,
      now,
    );

    if (result.lastInsertRowid) {
      return this.getGoalById(db, Number(result.lastInsertRowid));
    } else {
      throw new Error("Failed to create goal");
    }
  }

  static updateGoal(db: Database.Database, goalData: IUpdateGoal): IGoal {
    const now = Date.now();
    const { id, ...updateFields } = goalData;

    const updateParts: string[] = [];
    const updateValues: any[] = [];

    Object.entries(updateFields).forEach(([key, value]) => {
      if (value !== undefined) {
        updateParts.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateParts.length === 0) {
      return this.getGoalById(db, id);
    }

    updateParts.push("update_time = ?");
    updateValues.push(now);

    const updateSql = `UPDATE goals SET ${updateParts.join(", ")} WHERE id = ?`;
    updateValues.push(id);

    const stmt = db.prepare(updateSql);
    stmt.run(...updateValues);

    return this.getGoalById(db, id);
  }

  static deleteGoal(db: Database.Database, id: number): boolean {
    const deleteSql = "DELETE FROM goals WHERE id = ?";
    const stmt = db.prepare(deleteSql);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static getGoalById(db: Database.Database, id: number): IGoal {
    const selectSql = "SELECT * FROM goals WHERE id = ?";
    const stmt = db.prepare(selectSql);
    const row = stmt.get(id) as any;

    if (!row) {
      throw new Error(`Goal with id ${id} not found`);
    }

    return this.mapRowToGoal(row);
  }

  static getAllGoals(db: Database.Database): IGoal[] {
    const selectSql = "SELECT * FROM goals ORDER BY create_time DESC";
    const stmt = db.prepare(selectSql);
    const rows = stmt.all() as any[];

    return rows.map((row) => this.mapRowToGoal(row));
  }

  static getGoalsByStatus(db: Database.Database, status: EGoalStatus): IGoal[] {
    const selectSql =
      "SELECT * FROM goals WHERE status = ? ORDER BY create_time DESC";
    const stmt = db.prepare(selectSql);
    const rows = stmt.all(status) as any[];

    return rows.map((row) => this.mapRowToGoal(row));
  }

  private static mapRowToGoal(row: any): IGoal {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status as EGoalStatus,
      create_time: row.create_time,
      update_time: row.update_time,
    };
  }
}
