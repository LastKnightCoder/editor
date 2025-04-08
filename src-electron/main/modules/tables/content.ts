import Database from "better-sqlite3";
import { getContentLength, dfs } from "@/utils/helper.ts";
import { IContent, ICreateContent, IUpdateContent } from "@/types";
import Operation from "./operation";
import { produce } from "immer";
import { Descendant } from "slate";
import PathUtil from "../../utils/PathUtil";
import log from "electron-log";

export default class ContentTable {
  static getListenEvents() {
    return {
      "content:update": this.updateContent.bind(this),
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
    const homePath = PathUtil.getHomeDir();
    const isHasLocalPath = (node: Descendant) => {
      if (node.type === "image") {
        return node.url.startsWith(homePath);
      } else if (node.type === "image-gallery") {
        return node.images.some((image) => image.url.startsWith(homePath));
      } else if (node.type === "video" || node.type === "audio") {
        return node.src.startsWith(homePath);
        // @ts-ignore
      } else if (node.type === "file-attachment") {
        // @ts-ignore
        return node.isLocal && node.localFilePath?.startsWith(homePath);
      }
      return false;
    };

    // 获取所有的 content
    const contents = this.getAllContents(db);
    // 遍历所有的 content
    for (const content of contents) {
      // 使用 immer 修改 content 的 content 字段
      // dfs 遍历 content.content，收集 type 为 image，video，audio，file-attachment 的 node
      let hasNode = false;
      const newContent = produce(content.content, (draft) => {
        dfs(draft, (node) => {
          // @ts-ignore
          if (isHasLocalPath(node)) {
            hasNode = true;
            if (node.type === "image") {
              node.url = node.url.replace(homePath, "~");
            } else if (node.type === "image-gallery") {
              node.images.forEach((image) => {
                image.url = image.url.replace(homePath, "~");
              });
            } else if (node.type === "video" || node.type === "audio") {
              node.src = node.src.replace(homePath, "~");
              // @ts-ignore
            } else if (node.type === "file-attachment") {
              // @ts-ignore
              node.localFilePath = node.localFilePath.replace(homePath, "~");
            }
          }
        });
      });
      // 更新 content 的 content 字段
      if (hasNode) {
        log.info(`升级 content ${content.id} 的 content 字段`);
        this.updateContent(db, content.id, { content: newContent });
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
  ): IContent | null {
    const { content, count } = contentData;

    const stmt = db.prepare(
      "UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?",
    );
    const now = Date.now();
    const actualCount = count || (content ? getContentLength(content) : 0);
    stmt.run(now, JSON.stringify(content || []), actualCount, contentId);
    Operation.insertOperation(db, "content", "update", contentId, now);
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
