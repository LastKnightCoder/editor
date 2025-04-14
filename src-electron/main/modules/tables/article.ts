import Database from "better-sqlite3";
import { ICreateArticle, IUpdateArticle, IArticle } from "@/types";
import Operation from "./operation";
import { getMarkdown } from "@/utils/markdown.ts";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";
import log from "electron-log";

export default class ArticleTable {
  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        links TEXT,
        content_id INTEGER,
        banner_bg TEXT,
        banner_position TEXT DEFAULT 'center',
        is_top INTEGER DEFAULT 0,
        is_delete INTEGER DEFAULT 0,
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )`;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    // 为所有文章添加 FTS 索引
    log.info("开始为所有文章添加 FTS 索引");
    const articles = this.getAllArticles(db);
    for (const article of articles) {
      if (!article.content || !article.content.length) continue;

      // 检查是否已有索引或索引是否过期
      const indexInfo = FTSTable.checkIndexExists(db, article.id, "article");

      // 如果索引不存在或已过期，则添加/更新索引
      if (!indexInfo || indexInfo.updateTime < article.update_time) {
        FTSTable.indexContent(db, {
          id: article.id,
          content: getMarkdown(article.content),
          type: "article",
          updateTime: article.update_time,
        });
        log.info(`已为文章 ${article.id} 添加/更新 FTS 索引`);
      }
    }
  }

  static getListenEvents() {
    return {
      "create-article": this.createArticle.bind(this),
      "create-article-from-project-item":
        this.createArticleFromProjectItem.bind(this),
      "update-article": this.updateArticle.bind(this),
      "delete-article": this.deleteArticleById.bind(this),
      "get-all-articles": this.getAllArticles.bind(this),
      "get-article-by-id": this.getArticleById.bind(this),
      "update-article-is-top": this.updateArticleIsTop.bind(this),
      "update-article-banner-bg": this.updateArticleBannerBg.bind(this),
      "update-article-banner-position":
        this.updateArticleBannerPosition.bind(this),
    };
  }

  static parseArticle(article: any): IArticle {
    let content = [];
    let count = 0;

    // 直接使用JOIN查询结果中的内容
    if (article.content) {
      try {
        content = JSON.parse(article.content);
        count = article.count || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    // 使用文章和内容表中最大的更新时间
    const updateTime = article.content_update_time
      ? Math.max(article.update_time, article.content_update_time)
      : article.update_time;

    return {
      id: article.id,
      create_time: article.create_time,
      update_time: updateTime,
      tags: JSON.parse(article.tags),
      title: article.title,
      content: content,
      author: article.author || "",
      links: JSON.parse(article.links || "[]"),
      bannerBg: article.banner_bg || "",
      bannerPosition: article.banner_position || "center",
      isTop: article.is_top || false,
      isDelete: article.is_delete || false,
      count: count,
      contentId: article.content_id,
    };
  }

  static getAllArticles(db: Database.Database) {
    // 按照创建时间倒序
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      WHERE a.is_delete = 0 
      ORDER BY a.create_time DESC
    `);
    const articles = stmt.all();
    return articles.map((article) => this.parseArticle(article));
  }

  static getArticleById(
    db: Database.Database,
    articleId: number | bigint,
  ): IArticle {
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      WHERE a.id = ? AND a.is_delete = 0
    `);
    const article = stmt.get(articleId);
    return this.parseArticle(article);
  }

  static getArticleByIds(
    db: Database.Database,
    articleIds: number[],
  ): IArticle[] {
    if (articleIds.length === 0) return [];

    const placeholders = articleIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      WHERE a.id IN (${placeholders}) AND a.is_delete = 0
    `);
    const articles = stmt.all(articleIds);
    return articles.map((article) => this.parseArticle(article));
  }

  static createArticle(
    db: Database.Database,
    article: ICreateArticle,
  ): IArticle {
    const {
      tags,
      title,
      content,
      bannerBg,
      bannerPosition,
      isDelete,
      isTop,
      count,
    } = article;

    // 如果没有提供contentId，则创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content,
      count: count,
    });

    // 创建article记录
    const stmt = db.prepare(
      "INSERT INTO articles (create_time, update_time, tags, title, content_id, banner_bg, banner_position, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(tags),
      title,
      contentId,
      bannerBg,
      bannerPosition || "center",
      Number(isDelete),
      Number(isTop),
    );
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, "article", "insert", createdArticleId, now);

    return this.getArticleById(db, createdArticleId);
  }

  static createArticleFromProjectItem(
    db: Database.Database,
    projectItemId: number,
  ): IArticle | null {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }
    const contentId = projectItem.contentId;
    const title = projectItem.title;

    ContentTable.incrementRefCount(db, contentId);

    const stmt = db.prepare(
      "INSERT INTO articles (create_time, update_time, tags, title, content_id, banner_bg, banner_position, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify([]),
      title,
      contentId,
      "",
      "center",
      0,
      0,
    );
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, "article", "insert", createdArticleId, now);

    return this.getArticleById(db, createdArticleId);
  }

  static updateArticle(
    db: Database.Database,
    article: IUpdateArticle,
    ...res: any[]
  ): IArticle {
    const {
      tags,
      title,
      id,
      bannerBg,
      bannerPosition,
      isTop,
      isDelete,
      contentId,
    } = article;
    const win = res[res.length - 1];
    const now = Date.now();

    // 获取当前的article信息
    const currentArticle = this.getArticleById(db, id);

    // 更新article记录
    const stmt = db.prepare(
      "UPDATE articles SET update_time = ?, tags = ?, title = ?, content_id = ?, banner_bg = ?, banner_position = ?, is_top = ?, is_delete = ? WHERE id = ?",
    );
    stmt.run(
      now,
      JSON.stringify(tags || currentArticle.tags),
      title || currentArticle.title,
      contentId,
      bannerBg || currentArticle.bannerBg,
      bannerPosition || currentArticle.bannerPosition,
      Number(isTop ?? currentArticle.isTop),
      Number(isDelete ?? currentArticle.isDelete),
      id,
    );

    Operation.insertOperation(db, "article", "update", id, now);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("article:updated", {
          databaseName: basename(db.name),
          articleId: id,
        });
      }
    });

    return this.getArticleById(db, id);
  }

  static deleteArticleById(db: Database.Database, articleId: number): number {
    // 获取文章信息，以获取contentId
    const articleInfo = this.getArticleById(db, articleId);

    const stmt = db.prepare("DELETE FROM articles WHERE id = ?");
    const result = stmt.run(articleId);

    if (result.changes > 0) {
      FTSTable.removeIndexByIdAndType(db, articleId, "article");
      VecDocumentTable.removeIndexByIdAndType(db, articleId, "article");
      Operation.insertOperation(db, "article", "delete", articleId, Date.now());

      const documentItemStmt = db.prepare(
        "UPDATE document_items SET is_article = 0 WHERE is_article = 1 AND article_id = ?",
      );
      documentItemStmt.run(articleId);

      const projectItemStmt = db.prepare(
        "UPDATE project_item SET ref_type = '' WHERE ref_type = 'article' AND ref_id = ?",
      );
      projectItemStmt.run(articleId);

      if (articleInfo && articleInfo.contentId) {
        // 删除关联的content记录（减少引用计数）
        ContentTable.deleteContent(db, articleInfo.contentId);
      }
    }

    return result.changes;
  }

  static updateArticleIsTop(
    db: Database.Database,
    id: number,
    isTop: boolean,
    ...res: any[]
  ): IArticle {
    const win = res[res.length - 1];
    const stmt = db.prepare("UPDATE articles SET is_top = ? WHERE id = ?");
    stmt.run(Number(isTop), id);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("article:updated", {
          databaseName: basename(db.name),
          articleId: id,
        });
      }
    });

    return this.getArticleById(db, id);
  }

  static updateArticleBannerBg(
    db: Database.Database,
    id: number,
    bannerBg: string,
    ...res: any[]
  ): IArticle {
    const win = res[res.length - 1];
    const stmt = db.prepare("UPDATE articles SET banner_bg = ? WHERE id = ?");
    stmt.run(bannerBg, id);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("article:updated", {
          databaseName: basename(db.name),
          articleId: id,
        });
      }
    });

    return this.getArticleById(db, id);
  }

  static updateArticleBannerPosition(
    db: Database.Database,
    id: number,
    bannerPosition: string,
    ...res: any[]
  ): IArticle {
    const win = res[res.length - 1];
    const stmt = db.prepare(
      "UPDATE articles SET banner_position = ? WHERE id = ?",
    );
    stmt.run(bannerPosition, id);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("article:updated", {
          databaseName: basename(db.name),
          articleId: id,
        });
      }
    });

    return this.getArticleById(db, id);
  }
}
