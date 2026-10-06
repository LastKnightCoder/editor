import Database from "better-sqlite3";
import { WhiteBoardContent } from "@/types";
import Operation from "./operation";
import ContentTable from "./content";
// import log from "electron-log";

export default class WhiteboardTable {
  private static collectElementContentIdCounts(children: unknown[]): Map<number, number> {
    const counts = new Map<number, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dfs = (nodes: any[]) => {
      if (!nodes || !Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (!node) continue;
        if (typeof node.contentId === "number" && node.contentId > 0) {
          counts.set(node.contentId, (counts.get(node.contentId) || 0) + 1);
        }
        if (Array.isArray(node.children)) {
          dfs(node.children);
        }
      }
    };

    dfs(children as any[]);
    return counts;
  }

  private static acquireAddedContentRefs(
    db: Database.Database,
    prevChildren: unknown[],
    nextChildren: unknown[]
  ) {
    const prevCounts = this.collectElementContentIdCounts(prevChildren);
    const nextCounts = this.collectElementContentIdCounts(nextChildren);

    for (const [contentId, nextCount] of nextCounts.entries()) {
      const prevCount = prevCounts.get(contentId) || 0;
      const addedCount = Math.max(0, nextCount - prevCount);
      for (let index = 0; index < addedCount; index += 1) {
        ContentTable.incrementRefCount(db, contentId);
      }
    }
  }

  private static releaseRemovedContentRefs(
    db: Database.Database,
    prevChildren: unknown[],
    nextChildren: unknown[]
  ) {
    const prevCounts = this.collectElementContentIdCounts(prevChildren);
    const nextCounts = this.collectElementContentIdCounts(nextChildren);

    for (const [contentId, prevCount] of prevCounts.entries()) {
      const nextCount = nextCounts.get(contentId) || 0;
      const removedCount = Math.max(0, prevCount - nextCount);
      for (let index = 0; index < removedCount; index += 1) {
        ContentTable.deleteContent(db, contentId);
      }
    }
  }

  private static releaseAllContentRefs(db: Database.Database, children: unknown[]) {
    const counts = this.collectElementContentIdCounts(children);
    for (const [contentId, count] of counts.entries()) {
      for (let index = 0; index < count; index += 1) {
        ContentTable.deleteContent(db, contentId);
      }
    }
  }
  static deleteWhiteBoardContentWhenRefCountIsZero(db: Database.Database) {
    // 先查找所有 ref_count <= 0 的白板
    const selectStmt = db.prepare(`
      SELECT * FROM white_board_contents WHERE ref_count <= 0
    `);
    const whiteboards = selectStmt.all();

    // 释放每个白板中嵌入正文的引用
    for (const whiteboard of whiteboards) {
      try {
        const wb = this.parseWhiteboard(whiteboard);
        if (wb.data && wb.data.children) {
          this.releaseAllContentRefs(db, wb.data.children);
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
      "white-board-content:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: unknown): WhiteBoardContent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wb = whiteboard as any;
    return {
      id: wb.id,
      name: wb.name,
      imgUrl: wb.img_url || "",
      data: JSON.parse(wb.data),
      createTime: wb.create_time,
      updateTime: wb.update_time,
    };
  }

  static createWhiteboardContent(
    db: Database.Database,
    whiteboard: Omit<WhiteBoardContent, "id" | "createTime" | "updateTime" | "refCount">
  ): WhiteBoardContent {
    const stmt = db.prepare(`
      INSERT INTO white_board_contents
      (data, name, img_url, create_time, update_time, ref_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(whiteboard.data),
      whiteboard.name,
      whiteboard.imgUrl || "",
      now,
      now,
      1
    );

    Operation.insertOperation(db, "whiteboard-content", "insert", res.lastInsertRowid, now);

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
    whiteboard: Omit<WhiteBoardContent, "createTime" | "updateTime" | "refCount">
  ): WhiteBoardContent {
    const currentWhiteboard = this.getWhiteboardContent(db, whiteboard.id);
    this.acquireAddedContentRefs(
      db,
      currentWhiteboard?.data?.children || [],
      whiteboard.data?.children || []
    );
    this.releaseRemovedContentRefs(
      db,
      currentWhiteboard?.data?.children || [],
      whiteboard.data?.children || []
    );

    const stmt = db.prepare(`
      UPDATE white_board_contents SET
        data = ?,
        name = ?,
        img_url = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      JSON.stringify(whiteboard.data),
      whiteboard.name,
      whiteboard.imgUrl || "",
      now,
      whiteboard.id
    );

    Operation.insertOperation(db, "whiteboard-content", "update", whiteboard.id, now);

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

  static getWhiteboardContent(db: Database.Database, id: number): WhiteBoardContent {
    const stmt = db.prepare("SELECT * FROM white_board_contents WHERE id = ?");
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboardContents(db: Database.Database): WhiteBoardContent[] {
    const stmt = db.prepare("SELECT * FROM white_board_contents");
    const whiteboards = stmt.all();
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }

  static getWhiteboardByIds(db: Database.Database, ids: number[]): WhiteBoardContent[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM white_board_contents WHERE id IN (${placeholders})`);
    const whiteboards = stmt.all(...ids);
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }
}
