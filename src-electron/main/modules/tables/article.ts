import Database from "better-sqlite3";
import { ICreateArticle, IUpdateArticle, IArticle } from "@/types";
import Operation from "./operation";
import { getContentLength } from "@/utils/helper.ts";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";
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
    const stmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'articles'",
    );
    const tableInfo = (stmt.get() as { sql: string }).sql;
    if (!tableInfo.includes("links")) {
      const alertStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN links TEXT",
      );
      alertStmt.run();
    }
    if (!tableInfo.includes("banner_bg")) {
      const alertStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN banner_bg TEXT DEFAULT ''",
      );
      alertStmt.run();
    }
    if (!tableInfo.includes("banner_position")) {
      const alertStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN banner_position TEXT DEFAULT 'center'",
      );
      alertStmt.run();
    }
    if (!tableInfo.includes("is_top")) {
      const alertStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN is_top INTEGER DEFAULT 0",
      );
      alertStmt.run();
    }
    if (!tableInfo.includes("is_delete")) {
      const alertStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN is_delete INTEGER DEFAULT 0",
      );
      alertStmt.run();
    }

    // 如果不包含content_id字段，则添加
    if (!tableInfo.includes("content_id")) {
      // 1. 添加content_id列
      const addColumnStmt = db.prepare(
        "ALTER TABLE articles ADD COLUMN content_id INTEGER",
      );
      addColumnStmt.run();

      // 2. 获取所有文章
      const getAllArticlesStmt = db.prepare("SELECT * FROM articles");
      const articles = getAllArticlesStmt.all();

      // 3. 为每篇文章创建内容表记录，并关联
      for (const article of articles as any[]) {
        if (!article.content) continue;

        // 创建content记录
        const content = JSON.parse(article.content as string);
        const count = article.count || getContentLength(content);

        const contentId = ContentTable.createContent(db, {
          content: content,
          count: count,
        });

        // 更新文章的content_id字段
        const updateArticleStmt = db.prepare(
          "UPDATE articles SET content_id = ? WHERE id = ?",
        );
        updateArticleStmt.run(contentId, article.id);
      }

      // 删除content字段
      const dropContentColumnStmt = db.prepare(
        "ALTER TABLE articles DROP COLUMN content",
      );
      dropContentColumnStmt.run();

      // 删除count字段
      const dropCountColumnStmt = db.prepare(
        "ALTER TABLE articles DROP COLUMN count",
      );
      dropCountColumnStmt.run();
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

    return {
      id: article.id,
      create_time: article.create_time,
      update_time: article.update_time,
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
             c.content, c.count
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
             c.content, c.count
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      WHERE a.id = ?
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
             c.content, c.count
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      WHERE a.id IN (${placeholders})
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
  ): IArticle {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
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
      content,
      id,
      bannerBg,
      bannerPosition,
      isTop,
      isDelete,
      count,
      contentId,
    } = article;
    const win = res[res.length - 1];
    const now = Date.now();

    // 获取当前的article信息
    const currentArticle = this.getArticleById(db, id);

    // 处理内容更新
    let newContentId = contentId || currentArticle.contentId;

    if (contentId) {
      // 如果提供了新的contentId，使用新的contentId
      // 并减少旧contentId的引用计数
      if (currentArticle.contentId !== contentId) {
        if (currentArticle.contentId) {
          ContentTable.deleteContent(db, currentArticle.contentId);
        }
        ContentTable.incrementRefCount(db, contentId);
      } else {
        // 更新现有内容
        ContentTable.updateContent(db, contentId, {
          content: content,
          count: count,
        });
      }
    } else if (currentArticle.contentId) {
      // 更新现有内容
      ContentTable.updateContent(db, currentArticle.contentId, {
        content: content,
        count: count,
      });
    } else {
      // 创建新内容
      newContentId = ContentTable.createContent(db, {
        content: content,
        count: count,
      });
    }

    // 更新article记录
    const stmt = db.prepare(
      "UPDATE articles SET update_time = ?, tags = ?, title = ?, content_id = ?, banner_bg = ?, banner_position = ?, is_top = ?, is_delete = ? WHERE id = ?",
    );
    stmt.run(
      now,
      JSON.stringify(tags || currentArticle.tags),
      title || currentArticle.title,
      newContentId,
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

    if (articleInfo && articleInfo.contentId) {
      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, articleInfo.contentId);
    }

    // 标记文章为已删除
    const stmt = db.prepare("UPDATE articles SET is_delete = 1 WHERE id = ?");
    const result = stmt.run(articleId);

    // 设置document-item的isArticle为0
    const documentItemStmt = db.prepare(
      "UPDATE document_items SET is_article = 0 WHERE is_article = 1 AND article_id = ?",
    );
    documentItemStmt.run(articleId);

    // 设置project_item的ref_type为空
    const projectItemStmt = db.prepare(
      "UPDATE project_item SET ref_type = '' WHERE ref_type = 'article' AND ref_id = ?",
    );
    projectItemStmt.run(articleId);

    // 删除全文搜索索引
    FTSTable.removeIndexByIdAndType(db, articleId, "article");
    // 删除向量文档索引
    VecDocumentTable.removeIndexByIdAndType(db, articleId, "article");

    Operation.insertOperation(db, "article", "delete", articleId, Date.now());

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
