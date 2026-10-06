import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { dfs, getContentLength } from "@/utils/helper.ts";
import { IContent, ICreateContent, IUpdateContent } from "@/types";
import { Descendant } from "slate";
import { basename } from "node:path";

import Operation from "./operation";
import WhiteBoardContentTable from "./white-board-content";
import QuestionTable from "./question";
import ContentAiMetaTable from "./content-ai-meta";
import ContentAiInsightsTable from "./content-ai-insights";
import { assertContentIsLocal } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import {
  contentSession,
  contentRevision,
  replaceSessionContent,
} from "../collaboration/content-sessions";
import { readSharedContent, type ContentNode } from "@tau/collaboration";

export default class ContentTable {
  static getListenEvents() {
    return {
      "content:update": this.updateContent.bind(this),
      "content:create": this.createContent.bind(this),
      "content:get-by-id": this.getContentById.bind(this),
      "content:delete": this.deleteContent.bind(this),
      "content:increment-ref-count": this.incrementRefCount.bind(this),
      "content:decrement-ref-count": this.decrementRefCount.bind(this),
    };
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

  static getContentById(db: Database.Database, contentId: number | bigint): IContent | null {
    const stmt = db.prepare("SELECT * FROM contents WHERE id = ?");
    const content = stmt.get(contentId);
    if (!content) {
      return null;
    }
    const parsed = this.parseContent(content);
    const session = contentSession(db, Number(contentId));
    return session
      ? {
          ...parsed,
          content: readSharedContent(session.doc, session.privateNodes).content as Descendant[],
          revision: contentRevision(session),
        }
      : parsed;
  }

  static getAllContents(db: Database.Database): IContent[] {
    const stmt = db.prepare("SELECT * FROM contents ORDER BY create_time DESC");
    const contents = stmt.all();
    return contents.map(content => this.parseContent(content));
  }

  static getContentByIds(db: Database.Database, contentIds: number[]): IContent[] {
    if (contentIds.length === 0) return [];

    const placeholders = contentIds.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM contents WHERE id IN (${placeholders})`);
    const contents = stmt.all(contentIds);
    return contents.map(content => this.parseContent(content));
  }

  static createContent(db: Database.Database, contentData: Partial<ICreateContent>): number {
    const { content, count } = contentData;

    const stmt = db.prepare(
      "INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const actualCount = count || (content ? getContentLength(content) : 0);
    const res = stmt.run(
      now,
      now,
      JSON.stringify(content || []),
      actualCount,
      1 // 初始引用计数为1
    );
    const createdContentId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "content", "insert", createdContentId, now);
    emitContentWritten(db, createdContentId, "create");
    return createdContentId;
  }

  static updateContent(
    db: Database.Database,
    contentId: number,
    contentData: Partial<IUpdateContent> & { content: Descendant[]; expectedRevision?: string },
    ctx: CommandContext = fallbackCommandContext
  ): IContent | null {
    const { content, count } = contentData;
    const session = contentSession(db, contentId);
    if (session) {
      replaceSessionContent(session, content as ContentNode[], contentData.expectedRevision);
      return this.getContentById(db, contentId);
    }
    assertContentIsLocal(db, contentId);

    const stmt = db.prepare(
      "UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?"
    );
    const now = Date.now();
    const actualCount = count || (content ? getContentLength(content) : 0);
    stmt.run(now, JSON.stringify(content || []), actualCount, contentId);
    Operation.insertOperation(db, "content", "update", contentId, now);
    ctx.broadcastOthers("content:updated", { databaseName: basename(db.name), contentId });
    emitContentWritten(db, contentId, "update");
    return this.getContentById(db, contentId);
  }

  static deleteContent(db: Database.Database, contentId: number): number {
    assertContentIsLocal(db, contentId);
    // 元信息与正文同生同灭：引用计数归零时在同一事务里一并删除
    return db.transaction(() => this.releaseContent(db, contentId))();
  }

  private static releaseContent(db: Database.Database, contentId: number): number {
    // 先减少引用计数
    const decrementStmt = db.prepare("UPDATE contents SET ref_count = ref_count - 1 WHERE id = ?");
    decrementStmt.run(contentId);

    // 查询当前引用计数
    const refCountStmt = db.prepare("SELECT ref_count FROM contents WHERE id = ?");
    const result = refCountStmt.get(contentId) as { ref_count: number } | undefined;

    // 如果引用计数为0，则删除
    if (result && result.ref_count <= 0) {
      const deleteStmt = db.prepare("DELETE FROM contents WHERE id = ?");
      Operation.insertOperation(db, "content", "delete", contentId, Date.now());
      // 删除白板内容和问题
      const content = this.getContentById(db, contentId);
      const whiteBoardContentId: number[] = [];
      const questionId: number[] = [];

      // 遍历内容，释放嵌入白板和问题的引用
      dfs(content?.content || [], node => {
        if (node.type === "whiteboard" && node.whiteBoardContentId) {
          whiteBoardContentId.push(node.whiteBoardContentId);
        }
        // @ts-ignore
        if (node.type === "question" && node.questionId) {
          // @ts-ignore
          questionId.push(node.questionId);
        }
      });

      whiteBoardContentId.forEach(id => {
        WhiteBoardContentTable.deleteWhiteboard(db, id);
      });
      questionId.forEach(id => {
        QuestionTable.deleteQuestion(db, id);
      });

      ContentAiMetaTable.delete(db, contentId);
      ContentAiInsightsTable.delete(db, contentId);
      const changes = deleteStmt.run(contentId).changes;
      emitContentWritten(db, contentId, "delete");
      return changes;
    }

    return 0;
  }

  static incrementRefCount(db: Database.Database, contentId: number): void {
    const stmt = db.prepare("UPDATE contents SET ref_count = ref_count + 1 WHERE id = ?");
    stmt.run(contentId);
  }

  static decrementRefCount(db: Database.Database, contentId: number): void {
    const stmt = db.prepare(
      "UPDATE contents SET ref_count = ref_count - 1 WHERE id = ? AND ref_count > 0"
    );
    stmt.run(contentId);
  }

  static searchContentByText(db: Database.Database, text: string, limit = 100): IContent[] {
    const stmt = db.prepare(
      `SELECT * FROM contents WHERE content LIKE ? ORDER BY update_time DESC LIMIT ?`
    );
    const contents = stmt.all(`%${text}%`, limit);
    return contents.map(content => this.parseContent(content));
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

    const charsStmt = db.prepare("SELECT SUM(count) as totalChars FROM contents");
    const totalCharsResult = charsStmt.get() as { totalChars: number };

    return {
      totalCount: totalCountResult.count || 0,
      totalCharacters: totalCharsResult.totalChars || 0,
    };
  }
}
