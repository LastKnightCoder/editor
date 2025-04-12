import Database from "better-sqlite3";
import { WhiteBoard, WhiteBoardContent } from "@/types";
import Operation from "./operation";
import Project from "./project";
import WhiteBoardContentTable from "./white-board-content";
import log from "electron-log";
export default class WhiteboardTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS white_boards (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        white_board_content_ids TEXT DEFAULT '[]',
        title TEXT,
        description TEXT,
        snapshot TEXT
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 检查表结构中是否有 data 字段
    const tableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'white_boards'",
    );
    const tableInfo = (tableInfoStmt.get() as { sql: string }).sql;

    if (tableInfo.includes("is_project_item")) {
      db.exec(`
        ALTER TABLE white_boards DROP COLUMN is_project_item
      `);
    }

    if (tableInfo.includes("presentation_sequences")) {
      db.exec(`
        ALTER TABLE white_boards DROP COLUMN presentation_sequences
      `);
    }

    if (!tableInfo.includes("white_board_content_ids")) {
      db.exec(`
        ALTER TABLE white_boards ADD COLUMN white_board_content_ids TEXT DEFAULT '[]'
      `);
    }

    if (!tableInfo.includes("data")) {
      return;
    }

    // 读取所有白板，将 data 字段数据迁移到 white-board-content 表中
    const stmt = db.prepare(`
      SELECT id, data, title, white_board_content_ids FROM white_boards
    `);
    const whiteboards = stmt.all() as {
      id: number;
      data: string;
      title: string;
      white_board_content_ids: string;
    }[];

    for (const whiteboard of whiteboards) {
      // 跳过没有数据的白板
      if (!whiteboard.data) continue;

      try {
        const data = JSON.parse(whiteboard.data);
        const name = whiteboard.title;
        log.debug(`Migrating data for whiteboard name: ${name}`);
        const contentIds = JSON.parse(
          whiteboard.white_board_content_ids || "[]",
        );

        // 创建新的 white-board-content 记录
        const contentId = WhiteBoardContentTable.createWhiteboardContent(db, {
          data,
          name,
        }).id;

        // 将新创建的 content id 添加到 white_board_content_ids 中
        contentIds.push(contentId);

        // 更新白板的 white_board_content_ids 字段
        const updateStmt = db.prepare(`
          UPDATE white_boards SET white_board_content_ids = ? WHERE id = ?
        `);
        updateStmt.run(JSON.stringify(contentIds), whiteboard.id);
      } catch (error) {
        log.error(
          `Failed to migrate data for whiteboard ${whiteboard.id}:`,
          error,
        );
      }
    }

    // 删除 data 字段
    db.exec(`
      ALTER TABLE white_boards DROP COLUMN data
    `);
  }

  static getListenEvents() {
    return {
      "create-white-board": this.createWhiteboard.bind(this),
      "delete-white-board": this.deleteWhiteboard.bind(this),
      "get-white-board-by-id": this.getWhiteboard.bind(this),
      "get-all-white-boards": this.getAllWhiteboards.bind(this),
      "update-white-board": this.updateWhiteboard.bind(this),
      "get-whiteboard-by-ids": this.getWhiteboardByIds.bind(this),
      "add-sub-white-board": this.addSubWhiteboard.bind(this),
      "delete-sub-white-board": this.deleteSubWhiteboard.bind(this),
      "update-sub-white-board": this.updateSubWhiteboard.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: any): WhiteBoard {
    const whiteBoardContentIds = JSON.parse(
      whiteboard.white_board_content_ids || "[]",
    );

    return {
      id: whiteboard.id,
      tags: JSON.parse(whiteboard.tags || "[]"),
      whiteBoardContentIds,
      whiteBoardContentList: whiteboard.white_board_content_list,
      createTime: whiteboard.create_time,
      updateTime: whiteboard.update_time,
      title: whiteboard.title,
      description: whiteboard.description,
      snapshot: whiteboard.snapshot,
    };
  }

  static createWhiteboard(
    db: Database.Database,
    whiteboard: {
      title: string;
      description: string;
      snapshot?: string;
      whiteBoardContentList?: Pick<WhiteBoardContent, "data" | "name">[];
    },
  ): WhiteBoard {
    const contentIds: number[] = [];

    // 如果有内容，创建 white-board-content 记录
    if (
      whiteboard.whiteBoardContentList &&
      whiteboard.whiteBoardContentList.length > 0
    ) {
      for (const content of whiteboard.whiteBoardContentList) {
        const contentId = WhiteBoardContentTable.createWhiteboardContent(db, {
          data: content.data,
          name: content.name,
        }).id;
        contentIds.push(contentId);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO white_boards
      (title, description, white_board_content_ids, create_time, update_time, snapshot, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const res = stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(contentIds),
      now,
      now,
      whiteboard.snapshot || "",
      JSON.stringify([]),
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

  static addSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    name: string,
    whiteboardData: WhiteBoardContent["data"],
  ): WhiteBoardContent {
    const whiteboardContent = WhiteBoardContentTable.createWhiteboardContent(
      db,
      {
        data: whiteboardData,
        name,
      },
    );

    const whiteboard = this.getWhiteboard(db, whiteboardId);

    const stmt = db.prepare(`
      UPDATE white_boards SET update_time = ?, white_board_content_ids = ? WHERE id = ?
    `);
    stmt.run(
      Date.now(),
      JSON.stringify([
        ...whiteboard.whiteBoardContentIds,
        whiteboardContent.id,
      ]),
      whiteboardId,
    );

    return whiteboardContent;
  }

  static deleteSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    whiteboardContentId: number,
  ): boolean {
    const whiteboard = this.getWhiteboard(db, whiteboardId);
    const stmt = db.prepare(`
      UPDATE white_boards SET update_time = ?, white_board_content_ids = ? WHERE id = ?
    `);

    const newContentIds = whiteboard.whiteBoardContentIds.filter(
      (id) => id !== whiteboardContentId,
    );
    stmt.run(Date.now(), JSON.stringify(newContentIds), whiteboardId);

    WhiteBoardContentTable.deleteWhiteboard(db, whiteboardContentId);

    return true;
  }

  static updateSubWhiteboard(
    db: Database.Database,
    whiteboardContentId: number,
    name: string,
    whiteboardData: WhiteBoardContent["data"],
  ): WhiteBoardContent {
    const whiteboardContent = WhiteBoardContentTable.updateWhiteboard(db, {
      id: whiteboardContentId,
      data: whiteboardData,
      name,
    });

    return whiteboardContent;
  }

  static updateWhiteboard(
    db: Database.Database,
    whiteboard: {
      id: number;
      title?: string;
      description?: string;
      tags?: string[];
      snapshot?: string;
      whiteBoardContentList?: WhiteBoardContent[];
    },
  ): WhiteBoard {
    // 获取当前白板数据
    const currentWhiteboard = this.getWhiteboard(db, whiteboard.id);
    const currentContentIds = currentWhiteboard.whiteBoardContentIds || [];

    // 处理内容列表变更
    const newContentIds: number[] = [];
    if (
      whiteboard.whiteBoardContentList &&
      whiteboard.whiteBoardContentList.length > 0
    ) {
      for (let i = 0; i < whiteboard.whiteBoardContentList.length; i++) {
        const content = whiteboard.whiteBoardContentList[i];
        let contentId: number;

        // 如果有对应的 id，更新
        if (currentContentIds[i]) {
          contentId = currentContentIds[i];
          WhiteBoardContentTable.updateWhiteboard(db, {
            id: contentId,
            data: content.data,
            name: content.name,
          });
        } else {
          // 否则创建新记录
          contentId = WhiteBoardContentTable.createWhiteboardContent(db, {
            data: content.data,
            name: content.name,
          }).id;
        }

        newContentIds.push(contentId);
      }
    }

    // 处理被删除的内容
    for (const oldContentId of currentContentIds) {
      if (!newContentIds.includes(oldContentId)) {
        WhiteBoardContentTable.deleteWhiteboard(db, oldContentId);
      }
    }

    const stmt = db.prepare(`
      UPDATE white_boards SET
        title = ?,
        description = ?,
        tags = ?,
        white_board_content_ids = ?,
        update_time = ?,
        snapshot = ?
      WHERE id = ?
    `);

    const now = Date.now();
    stmt.run(
      whiteboard.title || currentWhiteboard.title,
      whiteboard.description || currentWhiteboard.description,
      JSON.stringify(whiteboard.tags || currentWhiteboard.tags || []),
      JSON.stringify(newContentIds),
      now,
      whiteboard.snapshot || currentWhiteboard.snapshot,
      whiteboard.id,
    );

    Operation.insertOperation(db, "whiteboard", "update", whiteboard.id, now);

    return this.getWhiteboard(db, whiteboard.id);
  }

  static deleteWhiteboard(db: Database.Database, id: number): number {
    // 获取白板内容 ID 并删除相关内容
    const whiteboard = this.getWhiteboard(db, id);
    if (
      whiteboard.whiteBoardContentIds &&
      whiteboard.whiteBoardContentIds.length > 0
    ) {
      for (const contentId of whiteboard.whiteBoardContentIds) {
        WhiteBoardContentTable.deleteWhiteboard(db, contentId);
      }
    }

    const stmt = db.prepare("DELETE FROM white_boards WHERE id = ?");

    Operation.insertOperation(db, "whiteboard", "delete", id, Date.now());

    Project.resetProjectItemRef(db, "white-board", id);

    return stmt.run(id).changes;
  }

  static getWhiteboard(db: Database.Database, id: number): WhiteBoard {
    // 获取白板基础数据
    const stmt = db.prepare(`
      SELECT * FROM white_boards WHERE id = ?
    `);

    const whiteboard: any = stmt.get(id);
    if (!whiteboard) {
      throw new Error(`Whiteboard with id ${id} not found`);
    }

    // 加载内容列表
    const contentIds = JSON.parse(whiteboard.white_board_content_ids || "[]");
    const contentList = [];

    if (contentIds.length > 0) {
      const contents = WhiteBoardContentTable.getWhiteboardByIds(
        db,
        contentIds,
      );
      for (const content of contents) {
        contentList.push(content);
      }
    }

    whiteboard.white_board_content_list = contentList;

    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboards(db: Database.Database): WhiteBoard[] {
    // 获取所有白板
    const stmt = db.prepare(`
      SELECT * FROM white_boards
    `);

    const whiteboards = stmt.all();

    // 为每个白板加载内容列表
    return whiteboards.map((whiteboard) => {
      // 使用类型断言确保类型安全
      const wb = whiteboard as Record<string, any>;
      const contentIds = JSON.parse(wb.white_board_content_ids || "[]");
      const contentList = [];

      if (contentIds.length > 0) {
        const contents = WhiteBoardContentTable.getWhiteboardByIds(
          db,
          contentIds,
        );
        for (const content of contents) {
          contentList.push(content);
        }
      }

      wb.white_board_content_list = contentList;

      return this.parseWhiteboard(wb);
    });
  }

  static getWhiteboardByIds(
    db: Database.Database,
    ids: number[],
  ): WhiteBoard[] {
    if (!ids.length) return [];

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM white_boards WHERE id IN (${placeholders})`,
    );

    const whiteboards = stmt.all(...ids);

    // 为每个白板加载内容列表
    return whiteboards.map((whiteboard) => {
      // 使用类型断言确保类型安全
      const wb = whiteboard as Record<string, any>;
      const contentIds = JSON.parse(wb.white_board_content_ids || "[]");
      const contentList = [];

      if (contentIds.length > 0) {
        const contents = WhiteBoardContentTable.getWhiteboardByIds(
          db,
          contentIds,
        );
        for (const content of contents) {
          contentList.push(content);
        }
      }

      wb.white_board_content_list = contentList;

      return this.parseWhiteboard(wb);
    });
  }
}
