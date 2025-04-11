import Database from "better-sqlite3";
import { WhiteBoard } from "@/types";
import Operation from "./operation";
import Project from "./project";

export default class WhiteboardTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS white_boards (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        data TEXT,
        title TEXT,
        description TEXT,
        snapshot TEXT,
        is_project_item INTEGER DEFAULT 0
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  static getListenEvents() {
    return {
      "create-white-board": this.createWhiteboard.bind(this),
      "delete-white-board": this.deleteWhiteboard.bind(this),
      "get-white-board-by-id": this.getWhiteboard.bind(this),
      "get-all-white-boards": this.getAllWhiteboards.bind(this),
      "update-white-board": this.updateWhiteboard.bind(this),
      "get-whiteboard-by-ids": this.getWhiteboardByIds.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: any): WhiteBoard {
    return {
      ...whiteboard,
      data: JSON.parse(whiteboard.data),
      tags: JSON.parse(whiteboard.tags),
      createTime: whiteboard.create_time,
      updateTime: whiteboard.update_time,
      isProjectItem: Boolean(whiteboard.is_project_item),
    };
  }

  static createWhiteboard(
    db: Database.Database,
    whiteboard: Omit<WhiteBoard, "id" | "createTime" | "updateTime">,
  ): WhiteBoard {
    const stmt = db.prepare(`
      INSERT INTO white_boards
      (title, description, data, create_time, update_time, snapshot, is_project_item)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(whiteboard.data),
      now,
      now,
      whiteboard.snapshot,
      Number(whiteboard.isProjectItem || false),
    );

    Operation.insertOperation(
      db,
      "whiteboard",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getWhiteboard(db, Number(res.lastInsertRowid));
  }

  static updateWhiteboard(
    db: Database.Database,
    whiteboard: Omit<WhiteBoard, "createTime" | "updateTime">,
  ): WhiteboardTable {
    const stmt = db.prepare(`
      UPDATE white_boards SET
        title = ?,
        description = ?,
        tags = ?,
        data = ?,
        update_time = ?,
        snapshot = ?,
        is_project_item = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(whiteboard.tags),
      JSON.stringify(whiteboard.data),
      now,
      whiteboard.snapshot,
      Number(whiteboard.isProjectItem || false),
      whiteboard.id,
    );

    if (whiteboard.isProjectItem) {
      const stmt = db.prepare(
        `UPDATE project_item SET update_time = ?, white_board_data = ?, title = ? WHERE ref_type = 'white-board' AND ref_id = ?`,
      );
      stmt.run(
        now,
        JSON.stringify(whiteboard.data),
        whiteboard.title,
        whiteboard.id,
      );
    }

    Operation.insertOperation(db, "whiteboard", "update", whiteboard.id, now);

    return this.getWhiteboard(db, whiteboard.id);
  }

  static deleteWhiteboard(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM white_boards WHERE id = ?");

    Operation.insertOperation(db, "whiteboard", "delete", id, Date.now());

    Project.resetProjectItemRef(db, "white-board", id);

    return stmt.run(id).changes;
  }

  static getWhiteboard(db: Database.Database, id: number): WhiteBoard {
    const stmt = db.prepare("SELECT * FROM white_boards WHERE id = ?");
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboards(db: Database.Database): WhiteBoard[] {
    const stmt = db.prepare("SELECT * FROM white_boards");
    const whiteboards = stmt.all();
    return whiteboards.map((wb) => this.parseWhiteboard(wb));
  }

  static getWhiteboardByIds(
    db: Database.Database,
    ids: number[],
  ): WhiteBoard[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM white_boards WHERE id IN (${placeholders})`,
    );
    const whiteboards = stmt.all(...ids);
    return whiteboards.map((wb) => this.parseWhiteboard(wb));
  }
}
