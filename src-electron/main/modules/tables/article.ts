import Database from 'better-sqlite3';
import { ICreateArticle, IUpdateArticle, IArticle } from '@/types';
import Operation from './operation';

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
        is_delete INTEGER DEFAULT 0
      )`;
    db.exec(createTableSql);
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
      isDelete: article.is_delete || false
    };
  }

  static async getAllArticles(db: Database.Database) {
    // 按照创建时间倒序
    const stmt = db.prepare('SELECT * FROM articles ORDER BY create_time DESC');
    const articles = stmt.all();
    return articles.map(article => this.parseArticle(article));
  }

  static async getArticleById(db: Database.Database, articleId: number | bigint): Promise<IArticle> {
    const stmt = db.prepare('SELECT * FROM articles WHERE id = ?');
    return this.parseArticle(stmt.get(articleId));
  }

  static async createArticle(db: Database.Database, article: ICreateArticle): Promise<IArticle> {
    const { tags, title, content, bannerBg, isDelete, isTop } = article;

    const stmt = db.prepare('INSERT INTO articles (create_time, update_time, tags, title, content, banner_bg, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isDelete), Number(isTop));
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, 'article', 'insert', createdArticleId, now);

    return await this.getArticleById(db, createdArticleId);
  }

  static async updateArticle(db: Database.Database, article: IUpdateArticle): Promise<IArticle> {
    const { tags, title, content, id, bannerBg, isTop, isDelete } = article;
    const stmt = db.prepare('UPDATE articles SET update_time = ?, tags = ?, title = ?, content = ?, banner_bg = ?, is_top = ?, is_delete = ? WHERE id = ?');
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isTop), Number(isDelete), id);

    // 如果有 document item isArticle 为 1，并且 article_id 为当前 articleId 的话，更新 document item 的 content 个 update_time
    const documentItemStmt = db.prepare('UPDATE document_items SET update_time = ?, content = ? WHERE is_article = 1 AND article_id = ?');
    documentItemStmt.run(now, JSON.stringify(content), id);

    // update project_item
    const projectItemStmt = db.prepare("UPDATE project_item SET update_time = ?, content = ? WHERE ref_type = 'article' AND ref_id = ?");
    projectItemStmt.run(now, JSON.stringify(content), id);

    Operation.insertOperation(db, 'article', 'update', id, now);

    return await this.getArticleById(db, id);
  }

  static async deleteArticleById(db: Database.Database, articleId: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM articles WHERE id = ?');
    // 设置 document item isArticle 为 0
    const documentItemStmt = db.prepare('UPDATE document_items SET isArticle = 0 WHERE isArticle = 1 AND articleId = ?');
    documentItemStmt.run(articleId);

    const projectItemStmt = db.prepare('UPDATE project_item SET ref_type = "" WHERE ref_type = "article" AND ref_id = ?');
    projectItemStmt.run(articleId);

    Operation.insertOperation(db, 'article', 'delete', articleId, Date.now());

    return stmt.run(articleId).changes;
  }

  static async updateArticleIsTop(db: Database.Database, id: number, isTop: boolean): Promise<IArticle> {
    const stmt = db.prepare('UPDATE articles SET is_top = ? WHERE id = ?');
    stmt.run(Number(isTop), id);
    return this.getArticleById(db, id);
  }

  static async updateArticleBannerBg(db: Database.Database, id: number, bannerBg: string): Promise<IArticle> {
    const stmt = db.prepare('UPDATE articles SET banner_bg = ? WHERE id = ?');
    stmt.run(bannerBg, id);
    return this.getArticleById(db, id);
  }
}