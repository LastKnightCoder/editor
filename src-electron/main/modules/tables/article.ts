import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { ICreateArticle, IUpdateArticle, IArticle } from '@/types';

export default class ArticleTable {
  // @ts-ignore
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;

    this.initTable();

    console.log(`init article table`);

    ipcMain.handle('get-all-articles', async () => {
      return await this.getAllArticles();
    });

    ipcMain.handle('get-article-by-id', async (_event, articleId) => {
      return await this.getArticleById(articleId);
    });

    ipcMain.handle('create-article', async (_event, params) => {
      return await this.createArticle(params);
    });

    ipcMain.handle('update-article', async (_event, params) => {
      return await this.updateArticle(params);
    });

    ipcMain.handle('delete-article', async (_event, articleId) => {
      return await this.deleteArticleById(articleId);
    });
  }

  initTable() {
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
    this.db.exec(createTableSql);
  }

  parseArticle(article: any): IArticle {
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

  async getAllArticles() {
    // 按照创建时间倒序
    const stmt = this.db.prepare('SELECT * FROM articles ORDER BY create_time DESC');
    const articles = stmt.all();
    return articles.map(article => this.parseArticle(article));
  }

  async getArticleById(articleId: number | bigint): Promise<IArticle> {
    const stmt = this.db.prepare('SELECT * FROM articles WHERE id = ?');
    return this.parseArticle(stmt.get(articleId));
  }

  async createArticle(article: ICreateArticle): Promise<IArticle> {
    const { tags, title, content, bannerBg, isDelete, isTop } = article;

    const stmt = this.db.prepare('INSERT INTO articles (create_time, update_time, tags, title, content, banner_bg, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isDelete), Number(isTop));
    const createdArticleId = res.lastInsertRowid;
    return await this.getArticleById(createdArticleId);
  }

  async updateArticle(article: IUpdateArticle): Promise<IArticle> {
    const { tags, title, content, id, bannerBg, isTop, isDelete } = article;
    const stmt = this.db.prepare('UPDATE articles SET update_time = ?, tags = ?, title = ?, content = ?, banner_bg = ?, is_top = ?, is_delete = ? WHERE id = ?');
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), title, JSON.stringify(content), bannerBg, Number(isTop), Number(isDelete), id);
    return await this.getArticleById(id);
  }

  async deleteArticleById(articleId: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM articles WHERE id = ?');
    return stmt.run(articleId).changes;
  }

  async updateArticleIsTop(id: number, isTop: boolean): Promise<IArticle> {
    const stmt = this.db.prepare('UPDATE articles SET is_top = ? WHERE id = ?');
    stmt.run(Number(isTop), id);
    return this.getArticleById(id);
  }

  async updateArticleBannerBg(id: number, bannerBg: string): Promise<IArticle> {
    const stmt = this.db.prepare('UPDATE articles SET banner_bg = ? WHERE id = ?');
    stmt.run(bannerBg, id);
    return this.getArticleById(id);
  }
}