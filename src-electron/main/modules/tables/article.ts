import Database from 'better-sqlite3';
import { ICreateArticle, IUpdateArticle, IArticle } from '@/types';
import Operation from './operation';
import { getContentLength } from "@/utils/helper.ts";

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
        content TEXT,
        banner_bg TEXT,
        is_top INTEGER DEFAULT 0,
        is_delete INTEGER DEFAULT 0,
        count INTEGER DEFAULT 0
      )`;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'articles'");
    const tableInfo = (stmt.get() as { sql: string }).sql;
    if (!tableInfo.includes("links")) {
      const alertStmt = db.prepare("ALTER TABLE articles ADD COLUMN links TEXT");
      alertStmt.run();
    }
    if (!tableInfo.includes("banner_bg")) {
      const alertStmt = db.prepare("ALTER TABLE articles ADD COLUMN banner_bg TEXT DEFAULT ''");
      alertStmt.run();
    }
    if (!tableInfo.includes("is_top")) {
      const alertStmt = db.prepare("ALTER TABLE articles ADD COLUMN is_top INTEGER DEFAULT 0");
      alertStmt.run();
    }
    if (!tableInfo.includes("is_delete")) {
      const alertStmt = db.prepare("ALTER TABLE articles ADD COLUMN is_delete INTEGER DEFAULT 0");
      alertStmt.run();
    }
    if (!tableInfo.includes("count")) {
      const alertStmt = db.prepare("ALTER TABLE articles ADD COLUMN count INTEGER DEFAULT 0");
      alertStmt.run();
      const articles = this.getAllArticles(db);
      for (const article of articles) {
        const contentLength = getContentLength(article.content);
        const stmt = db.prepare('UPDATE articles SET count = ? WHERE id = ?');
        stmt.run(contentLength, article.id);
      }
    }
  }

  static getListenEvents() {
    return {
      'create-article': this.createArticle.bind(this),
      'update-article': this.updateArticle.bind(this),
      'delete-article': this.deleteArticleById.bind(this),
      'get-all-articles': this.getAllArticles.bind(this),
      'get-article-by-id': this.getArticleById.bind(this),
      'update-article-is-top': this.updateArticleIsTop.bind(this),
      'update-article-banner-bg': this.updateArticleBannerBg.bind(this),
    }
  }

  static parseArticle(article: any): IArticle {
    return {
      id: article.id,
      create_time: article.create_time,
      update_time: article.update_time,
      tags: JSON.parse(article.tags),
      title: article.title,
      content: JSON.parse(article.content),
      author: article.author || '',
      links: JSON.parse(article.links || '[]'),
      bannerBg: article.banner_bg || '',
      isTop: article.is_top || false,
      isDelete: article.is_delete || false,
      count: article.count || 0,
    };
  }

  static getAllArticles(db: Database.Database) {
    // 按照创建时间倒序
    const stmt = db.prepare('SELECT * FROM articles WHERE is_delete = 0 ORDER BY create_time DESC');
    const articles = stmt.all();
    return articles.map(article => this.parseArticle(article));
  }

  static getArticleById(db: Database.Database, articleId: number | bigint): IArticle {
    const stmt = db.prepare('SELECT * FROM articles WHERE id = ?');
    return this.parseArticle(stmt.get(articleId));
  }

  static getArticleByIds(db: Database.Database, articleIds: number[]): IArticle[] {
    const placeholders = articleIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT * FROM articles WHERE id IN (${placeholders})`);
    const articles = stmt.all(articleIds);
    return articles.map(article => this.parseArticle(article));
  }

  static createArticle(db: Database.Database, article: ICreateArticle): IArticle {
    const { tags, title, content, bannerBg, isDelete, isTop, count } = article;

    const stmt = db.prepare('INSERT INTO articles (create_time, update_time, tags, title, content, banner_bg, is_delete, is_top, count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isDelete), Number(isTop), count);
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, 'article', 'insert', createdArticleId, now);

    return this.getArticleById(db, createdArticleId);
  }

  static updateArticle(db: Database.Database, article: IUpdateArticle): IArticle {
    const { tags, title, content, id, bannerBg, isTop, isDelete, count } = article;
    const stmt = db.prepare('UPDATE articles SET update_time = ?, tags = ?, title = ?, content = ?, banner_bg = ?, is_top = ?, is_delete = ?, count = ? WHERE id = ?');
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isTop), Number(isDelete), count, id);

    // 如果有 document item isArticle 为 1，并且 article_id 为当前 articleId 的话，更新 document item 的 content 个 update_time
    const documentItemStmt = db.prepare('UPDATE document_items SET update_time = ?, content = ?, count = ? WHERE is_article = 1 AND article_id = ?');
    documentItemStmt.run(now, JSON.stringify(content), count, id);

    // update project_item
    const projectItemStmt = db.prepare("UPDATE project_item SET update_time = ?, content = ?, count = ? WHERE ref_type = 'article' AND ref_id = ?");
    projectItemStmt.run(now, JSON.stringify(content), count, id);

    Operation.insertOperation(db, 'article', 'update', id, now);

    return this.getArticleById(db, id);
  }

  static async deleteArticleById(db: Database.Database, articleId: number): Promise<number> {
    const stmt = db.prepare('UPDATE articles SET is_delete = 1 WHERE id = ?');
    const res = stmt.run(articleId);

    // 设置 document item isArticle 为 0
    const documentItemStmt = db.prepare('UPDATE document_items SET is_article = 0 WHERE is_article = 1 AND article_id = ?');
    documentItemStmt.run(articleId);

    const projectItemStmt = db.prepare("UPDATE project_item SET ref_type = '' WHERE ref_type = 'article' AND ref_id = ?");
    projectItemStmt.run(articleId);

    Operation.insertOperation(db, 'article', 'delete', articleId, Date.now());

    return res.changes;
  }

  static updateArticleIsTop(db: Database.Database, id: number, isTop: boolean): IArticle {
    const stmt = db.prepare('UPDATE articles SET is_top = ? WHERE id = ?');
    stmt.run(Number(isTop), id);
    return this.getArticleById(db, id);
  }

  static updateArticleBannerBg(db: Database.Database, id: number, bannerBg: string): IArticle {
    const stmt = db.prepare('UPDATE articles SET banner_bg = ? WHERE id = ?');
    stmt.run(bannerBg, id);
    return this.getArticleById(db, id);
  }
}
