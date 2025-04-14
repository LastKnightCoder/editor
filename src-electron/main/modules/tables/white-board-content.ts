import Database from "better-sqlite3";
import { WhiteBoardContent } from "@/types";
import Operation from "./operation";
// import log from "electron-log";

export default class WhiteboardTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS white_board_contents (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        name TEXT,
        data TEXT,
        ref_count INTEGER DEFAULT 0
      )
    `);
    this.deleteWhiteBoardContentWhenRefCountIsZero(db);
  }

  static upgradeTable(_db: Database.Database) {
    // 不需要升级
  }

  static deleteWhiteBoardContentWhenRefCountIsZero(db: Database.Database) {
    const stmt = db.prepare(`
      DELETE FROM white_board_contents WHERE ref_count <= 0
    `);
    stmt.run();
  }

  static getListenEvents() {
    return {
      "white-board-content:create": this.createWhiteboardContent.bind(this),
      "white-board-content:get-by-id": this.getWhiteboardContent.bind(this),
      "white-board-content:update": this.updateWhiteboard.bind(this),
      "white-board-content:delete": this.deleteWhiteboard.bind(this),
      "white-board-content:increment-ref-count":
        this.incrementRefCount.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: any): WhiteBoardContent {
    return {
      id: whiteboard.id,
      name: whiteboard.name,
      data: JSON.parse(whiteboard.data),
      createTime: whiteboard.create_time,
      updateTime: whiteboard.update_time,
    };
  }

  static createWhiteboardContent(
    db: Database.Database,
    whiteboard: Omit<
      WhiteBoardContent,
      "id" | "createTime" | "updateTime" | "refCount"
    >,
  ): WhiteBoardContent {
    const stmt = db.prepare(`
      INSERT INTO white_board_contents
      (data, name, create_time, update_time, ref_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(whiteboard.data),
      whiteboard.name,
      now,
      now,
      1,
    );

    Operation.insertOperation(
      db,
      "whiteboard-content",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getWhiteboardContent(db, Number(res.lastInsertRowid));
  }

  static incrementRefCount(db: Database.Database, id: number): number {
    const stmt = db.prepare(`
      UPDATE white_board_contents SET ref_count = ref_count + 1 WHERE id = ?
    `);
    return stmt.run(id).changes;
  }

  static updateWhiteboard(
    db: Database.Database,
    whiteboard: Omit<
      WhiteBoardContent,
      "createTime" | "updateTime" | "refCount"
    >,
  ): WhiteBoardContent {
    const stmt = db.prepare(`
      UPDATE white_board_contents SET
        data = ?,
        name = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      JSON.stringify(whiteboard.data),
      whiteboard.name,
      now,
      whiteboard.id,
    );

    Operation.insertOperation(
      db,
      "whiteboard-content",
      "update",
      whiteboard.id,
      now,
    );

    return this.getWhiteboardContent(db, whiteboard.id);
  }

  static deleteWhiteboard(db: Database.Database, id: number): number {
    // 把 ref_count 减 1
    const stmt = db.prepare(`
      UPDATE white_board_contents SET
        ref_count = ref_count - 1
      WHERE id = ?
    `);
    stmt.run(id);
    // 如果 ref_count 为 0，则删除
    // 在这里不删，因为白板可能作为编辑器的块，删除后撤回无法恢复数据
    // 每次启动时统一删除，这样撤回是可以恢复数据，下次打开没法撤回是合理的
    // const refCountStmt = db.prepare(`
    //   SELECT ref_count FROM white_board_contents WHERE id = ?
    // `);
    // const refCount = refCountStmt.get(id) as { ref_count: number } | undefined;
    // if (refCount && refCount.ref_count <= 0) {
    //   log.info(`删除白板内容: ${id}`);
    //   const deleteStmt = db.prepare(`
    //     DELETE FROM white_board_contents WHERE id = ?
    //   `);
    //   Operation.insertOperation(
    //     db,
    //     "whiteboard-content",
    //     "delete",
    //     id,
    //     Date.now(),
    //   );
    //   return deleteStmt.run(id).changes;
    // }
    return 0;
  }

  static getWhiteboardContent(
    db: Database.Database,
    id: number,
  ): WhiteBoardContent {
    const stmt = db.prepare("SELECT * FROM white_board_contents WHERE id = ?");
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboardContents(db: Database.Database): WhiteBoardContent[] {
    const stmt = db.prepare("SELECT * FROM white_board_contents");
    const whiteboards = stmt.all();
    return whiteboards.map((wb) => this.parseWhiteboard(wb));
  }

  static getWhiteboardByIds(
    db: Database.Database,
    ids: number[],
  ): WhiteBoardContent[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM white_board_contents WHERE id IN (${placeholders})`,
    );
    const whiteboards = stmt.all(...ids);
    return whiteboards.map((wb) => this.parseWhiteboard(wb));
  }
}
