import Database from "better-sqlite3";
import { dfs, getContentLength } from "@/utils/helper.ts";
import { IContent, ICreateContent, IUpdateContent } from "@/types";
import log from "electron-log";
import { Descendant } from "slate";
import { produce } from "immer";
import { basename } from "node:path";
import { BrowserWindow } from "electron";

import Operation from "./operation";
import WhiteBoardContentTable from "./white-board-content";
import CardTable from "./card";
import QuestionTable from "./question";

export default class ContentTable {
  static getListenEvents() {
    return {
      "content:update": this.updateContent.bind(this),
      "content:create": this.createContent.bind(this),
      "content:get-by-id": this.getContentById.bind(this),
      "content:delete": this.deleteContent.bind(this),
      "content:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS contents (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        content TEXT,
        count INTEGER DEFAULT 0,
        ref_count INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);

    // 添加索引以优化查询性能
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_contents_update_time ON contents(update_time);
      CREATE INDEX IF NOT EXISTS idx_contents_create_time ON contents(create_time);
      CREATE INDEX IF NOT EXISTS idx_contents_ref_count ON contents(ref_count);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(db: Database.Database) {
    const contents = this.getAllContents(db);
    for (const content of contents) {
      let hasWhiteboard = false;
      let hasCardLink = false;
      // 遍历卡片内容，如果内容中包含白板，则更新白板内容
      const newContent = produce(content.content, (draft) => {
        dfs(draft, (node) => {
          // @ts-ignore
          if (node.type === "whiteboard" && node.data) {
            hasWhiteboard = true;
            // @ts-ignore
            const whiteboardData = node.data;
            const contentId = WhiteBoardContentTable.createWhiteboardContent(
              db,
              {
                data: whiteboardData,
                name: "白板",
              },
            );

            // @ts-ignore
            node.whiteBoardContentId = contentId;
            // @ts-ignore
            delete node.data;
          }
          // @ts-ignore
          if (node.type === "card-link") {
            // @ts-ignore
            const cardId = node.cardId;
            const card = CardTable.getCardById(db, cardId);
            if (!card) return;

            hasCardLink = true;

            // @ts-ignore
            node.refId = card.id;
            // @ts-ignore
            node.type = "content-link";
            // @ts-ignore
            node.contentType = "card";
            // @ts-ignore
            node.contentTitle = "";
            // @ts-ignore
            node.contentId = card.contentId;

            // @ts-ignore
            delete node.cardId;
          }
        });
      });
      if (hasWhiteboard || hasCardLink) {
        log.info(`Migrating data for content ${content.id}:`, newContent);
        const updateContentStmt = db.prepare(
          "UPDATE contents SET content = ? WHERE id = ?",
        );
        updateContentStmt.run(JSON.stringify(newContent), content.id);
      }
    }
  }

  static parseContent(content: any): IContent {
    return {
      id: content.id,
      createTime: content.create_time,
      updateTime: content.update_time,
      content: JSON.parse(content.content),
      count: content.count,
      refCount: content.ref_count,
    };
  }

  static getContentById(
    db: Database.Database,
    contentId: number | bigint,
  ): IContent | null {
    const stmt = db.prepare("SELECT * FROM contents WHERE id = ?");
    const content = stmt.get(contentId);
    if (!content) {
      return null;
    }
    return this.parseContent(content);
  }

  static getAllContents(db: Database.Database): IContent[] {
    const stmt = db.prepare("SELECT * FROM contents ORDER BY create_time DESC");
    const contents = stmt.all();
    return contents.map((content) => this.parseContent(content));
  }

  static getContentByIds(
    db: Database.Database,
    contentIds: number[],
  ): IContent[] {
    if (contentIds.length === 0) return [];

    const placeholders = contentIds.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM contents WHERE id IN (${placeholders})`,
    );
    const contents = stmt.all(contentIds);
    return contents.map((content) => this.parseContent(content));
  }

  static createContent(
    db: Database.Database,
    contentData: Partial<ICreateContent>,
  ): number {
    const { content, count } = contentData;

    const stmt = db.prepare(
      "INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const actualCount = count || (content ? getContentLength(content) : 0);
    const res = stmt.run(
      now,
      now,
      JSON.stringify(content || []),
      actualCount,
      1, // 初始引用计数为1
    );
    const createdContentId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "content", "insert", createdContentId, now);
    return createdContentId;
  }

  static updateContent(
    db: Database.Database,
    contentId: number,
    contentData: Partial<IUpdateContent> & { content: Descendant[] },
    win: BrowserWindow,
  ): IContent | null {
    const { content, count } = contentData;

    const stmt = db.prepare(
      "UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?",
    );
    const now = Date.now();
    const actualCount = count || (content ? getContentLength(content) : 0);
    stmt.run(now, JSON.stringify(content || []), actualCount, contentId);
    Operation.insertOperation(db, "content", "update", contentId, now);
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("content:updated", {
          databaseName: basename(db.name),
          contentId,
        });
      }
    });
    return this.getContentById(db, contentId);
  }

  static deleteContent(db: Database.Database, contentId: number): number {
    // 先减少引用计数
    const decrementStmt = db.prepare(
      "UPDATE contents SET ref_count = ref_count - 1 WHERE id = ?",
    );
    decrementStmt.run(contentId);

    // 查询当前引用计数
    const refCountStmt = db.prepare(
      "SELECT ref_count FROM contents WHERE id = ?",
    );
    const result = refCountStmt.get(contentId) as
      | { ref_count: number }
      | undefined;

    // 如果引用计数为0，则删除
    if (result && result.ref_count <= 0) {
      const deleteStmt = db.prepare("DELETE FROM contents WHERE id = ?");
      Operation.insertOperation(db, "content", "delete", contentId, Date.now());
      // 删除白板内容
      const content = this.getContentById(db, contentId);
      const whiteBoardContentId: number[] = [];
      const questionId: number[] = [];
      dfs(content?.content || [], (node) => {
        if (node.type === "whiteboard" && node.whiteBoardContentId) {
          whiteBoardContentId.push(node.whiteBoardContentId);
        }
        // @ts-ignore
        if (node.type === "question" && node.questionId) {
          // @ts-ignore
          questionId.push(node.questionId);
        }
      });
      whiteBoardContentId.forEach((id) => {
        WhiteBoardContentTable.deleteWhiteboard(db, id);
      });
      questionId.forEach((id) => {
        QuestionTable.deleteQuestion(db, id);
      });

      return deleteStmt.run(contentId).changes;
    }

    return 0;
  }

  static incrementRefCount(db: Database.Database, contentId: number): void {
    const stmt = db.prepare(
      "UPDATE contents SET ref_count = ref_count + 1 WHERE id = ?",
    );
    stmt.run(contentId);
  }

  static searchContentByText(
    db: Database.Database,
    text: string,
    limit = 100,
  ): IContent[] {
    const stmt = db.prepare(
      `SELECT * FROM contents WHERE content LIKE ? ORDER BY update_time DESC LIMIT ?`,
    );
    const contents = stmt.all(`%${text}%`, limit);
    return contents.map((content) => this.parseContent(content));
  }

  static getTotalCount(db: Database.Database): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM contents");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  static getStatistics(db: Database.Database): {
    totalCount: number;
    totalCharacters: number;
  } {
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM contents");
    const totalCountResult = countStmt.get() as { count: number };

    const charsStmt = db.prepare(
      "SELECT SUM(count) as totalChars FROM contents",
    );
    const totalCharsResult = charsStmt.get() as { totalChars: number };

    return {
      totalCount: totalCountResult.count || 0,
      totalCharacters: totalCharsResult.totalChars || 0,
    };
  }
}
