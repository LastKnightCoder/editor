import Database from "better-sqlite3";
import { WhiteBoardContent } from "@/types";
import Operation from "./operation";
import ResourceTable from "./resource";
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

  static upgradeTable() {
    // 不需要升级
  }

  static deleteWhiteBoardContentWhenRefCountIsZero(db: Database.Database) {
    // 先查找所有 ref_count <= 0 的白板
    const selectStmt = db.prepare(`
      SELECT * FROM white_board_contents WHERE ref_count <= 0
    `);
    const whiteboards = selectStmt.all();

    // 减少每个白板中资源的引用计数
    for (const whiteboard of whiteboards) {
      try {
        const wb = this.parseWhiteboard(whiteboard);
        if (wb.data && wb.data.children) {
          this.decrementWhiteboardResources(db, wb.data.children);
        }
      } catch (e) {
        // 忽略解析错误，继续删除
      }
    }

    // 删除 ref_count <= 0 的记录
    const deleteStmt = db.prepare(`
      DELETE FROM white_board_contents WHERE ref_count <= 0
    `);
    deleteStmt.run();
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

  static parseWhiteboard(whiteboard: unknown): WhiteBoardContent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wb = whiteboard as any;
    return {
      id: wb.id,
      name: wb.name,
      data: JSON.parse(wb.data),
      createTime: wb.create_time,
      updateTime: wb.update_time,
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
    //
    //   // 减少资源引用计数
    //   const whiteboard = this.getWhiteboardContent(db, id);
    //   if (whiteboard && whiteboard.data && whiteboard.data.children) {
    //     this.decrementWhiteboardResources(db, whiteboard.data.children);
    //   }
    //
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

  /**
   * 减少白板中所有资源的引用计数
   * 使用 DFS 遍历所有元素
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static decrementWhiteboardResources(
    db: Database.Database,
    children: any[],
  ): void {
    if (!children || !Array.isArray(children)) return;

    // DFS 遍历函数
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dfs = (nodes: any[], visit: (node: any) => void) => {
      if (!nodes || !Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (node) {
          visit(node);
          if (node.children && Array.isArray(node.children)) {
            dfs(node.children, visit);
          }
        }
      }
    };

    // 遍历所有子元素
    dfs(children, (element) => {
      if (!element || !element.type) return;

      // 处理 Image 元素
      if (element.type === "image" && element.src) {
        ResourceTable.decrementRefCount(db, element.src);
      }

      // 处理 Video 元素
      if (element.type === "video" && element.src) {
        ResourceTable.decrementRefCount(db, element.src);
      }

      // 处理 RichText 元素 - 需要遍历其 content
      if (element.type === "richtext" && element.content) {
        dfs(element.content, (node) => {
          if (!node || !node.type) return;

          if (node.type === "image" && node.url) {
            ResourceTable.decrementRefCount(db, node.url);
          }

          if (node.type === "inline-image" && node.url) {
            ResourceTable.decrementRefCount(db, node.url);
          }

          if (
            node.type === "image-gallery" &&
            node.images &&
            Array.isArray(node.images)
          ) {
            for (const image of node.images) {
              if (image.url) {
                ResourceTable.decrementRefCount(db, image.url);
              }
            }
          }

          if (node.type === "video" && node.src) {
            ResourceTable.decrementRefCount(db, node.src);
          }

          if (node.type === "audio" && node.src) {
            ResourceTable.decrementRefCount(db, node.src);
          }

          if (node.type === "file-attachment" && node.filePath) {
            ResourceTable.decrementRefCount(db, node.filePath);
          }
        });
      }
    });
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
