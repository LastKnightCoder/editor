import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import {
  IDocument,
  ICreateDocument,
  IUpdateDocument,
  IDocumentItem,
  ICreateDocumentItem,
  IUpdateDocumentItem
} from '@/types';

export default class DocumentTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        desc TEXT,
        authors TEXT,
        children TEXT,
        tags TEXT,
        links TEXT,
        content TEXT,
        banner_bg TEXT,
        icon TEXT,
        is_top INTEGER DEFAULT 0,
        is_delete INTEGER DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_items (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        authors TEXT,
        tags TEXT,
        is_directory INTEGER DEFAULT 0,
        children TEXT,
        is_article INTEGER DEFAULT 0,
        article_id INTEGER DEFAULT 0,
        is_card INTEGER DEFAULT 0,
        card_id INTEGER DEFAULT 0,
        content TEXT,
        banner_bg TEXT,
        icon TEXT,
        is_delete INTEGER DEFAULT 0,
        parents TEXT DEFAULT '[]'
      )
    `);
  }

  initHandlers() {
    ipcMain.handle('create-document', async (_event, params: ICreateDocument) => {
      return await this.createDocument(params);
    });

    ipcMain.handle('update-document', async (_event, params: IUpdateDocument) => {
      return await this.updateDocument(params);
    });

    ipcMain.handle('delete-document', async (_event, id: number) => {
      return await this.deleteDocument(id);
    });

    ipcMain.handle('get-document', async (_event, id: number) => {
      return await this.getDocument(id);
    });

    ipcMain.handle('get-all-documents', async () => {
      return await this.getAllDocuments();
    });

    // Document item handlers
    ipcMain.handle('create-document-item', async (_event, params: ICreateDocumentItem) => {
      return await this.createDocumentItem(params);
    });

    ipcMain.handle('update-document-item', async (_event, params: IUpdateDocumentItem) => {
      return await this.updateDocumentItem(params);
    });

    ipcMain.handle('delete-document-item', async (_event, id: number) => {
      return await this.deleteDocumentItem(id);
    });

    ipcMain.handle('get-document-item', async (_event, id: number) => {
      return await this.getDocumentItem(id);
    });

    ipcMain.handle('get-document-items-by-ids', async (_event, ids: number[]) => {
      return await this.getDocumentItemsByIds(ids);
    });

    ipcMain.handle('get-all-document-items', async () => {
      return await this.getAllDocumentItems();
    });

    // Relationship handlers
    ipcMain.handle('is-document-item-child-of', async (_event, id: number, parentId: number) => {
      return await this.isDocumentItemChildOf(id, parentId);
    });

    ipcMain.handle('init-document-item-parents', async () => {
      return await this.initAllDocumentItemParents();
    });

    ipcMain.handle('init-document-item-parents-by-ids', async (_event, ids: number[]) => {
      return await this.initDocumentItemParentsByIds(ids);
    })

    ipcMain.handle('get-document-item-all-parents', async (_event, id: number) => {
      return await this.getDocumentItemAllParents(id);
    });
  }

  parseDocument(document: any): IDocument {
    return {
      ...document,
      authors: JSON.parse(document.authors || '[]'),
      content: JSON.parse(document.content),
      children: JSON.parse(document.children || '[]'),
      tags: JSON.parse(document.tags || '[]'),
      links: JSON.parse(document.links || '[]'),
      isDelete: document.is_delete,
      createTime: document.create_time,
      updateTime: document.update_time,
      bannerBg: document.banner_bg,
      isTop: document.is_top
    };
  }

  parseDocumentItem(item: any): IDocumentItem {
    return {
      ...item,
      content: JSON.parse(item.content),
      children: JSON.parse(item.children || '[]'),
      parents: JSON.parse(item.parents || '[]'),
      isDelete: item.is_delete,
      createTime: item.create_time,
      updateTime: item.update_time,
      bannerBg: item.banner_bg,
      isDirectory: item.is_directory,
      isArticle: item.is_article,
      isCard: item.is_card,
      articleId: item.article_id,
      cardId: item.card_id
    };
  }

  async createDocument(document: ICreateDocument): Promise<IDocument> {
    const stmt = this.db.prepare(`
      INSERT INTO documents
      (title, desc, authors, children, tags, links, content, create_time, update_time, banner_bg, icon, is_top, is_delete)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      document.title,
      document.desc,
      JSON.stringify(document.authors),
      JSON.stringify(document.children),
      JSON.stringify(document.tags),
      JSON.stringify(document.links),
      JSON.stringify(document.content),
      now,
      now,
      document.bannerBg,
      document.icon,
      Number(document.isTop),
      Number(document.isDelete)
    );

    return this.getDocument(Number(res.lastInsertRowid));
  }

  async updateDocument(document: IUpdateDocument): Promise<IDocument> {
    const stmt = this.db.prepare(`
      UPDATE documents SET
        title = ?,
        desc = ?,
        authors = ?,
        children = ?,
        tags = ?,
        links = ?,
        content = ?,
        update_time = ?,
        banner_bg = ?,
        icon = ?,
        is_top = ?,
        is_delete = ?
      WHERE id = ?
    )`);

    stmt.run(
      document.title,
      document.desc,
      JSON.stringify(document.authors),
      JSON.stringify(document.children),
      JSON.stringify(document.tags),
      JSON.stringify(document.links),
      JSON.stringify(document.content),
      Date.now(),
      document.bannerBg,
      document.icon,
      Number(document.isTop),
      Number(document.isDelete),
    );

    return this.getDocument(document.id);
  }

  async deleteDocument(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    return stmt.run(id).changes;
  }

  async getDocument(id: number): Promise<IDocument> {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    const document = stmt.get(id);
    return this.parseDocument(document);
  }

  async getAllDocuments(): Promise<IDocument[]> {
    const stmt = this.db.prepare('SELECT * FROM documents');
    const documents = stmt.all();
    return documents.map(doc => this.parseDocument(doc));
  }

  async createDocumentItem(item: ICreateDocumentItem): Promise<IDocumentItem> {
    const stmt = this.db.prepare(`
      INSERT INTO document_items
      (create_time, update_time, title, authors, tags, is_directory, 
      children, is_article, article_id, is_card, card_id, 
      content, banner_bg, icon, is_delete, parents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      item.title,
      JSON.stringify(item.authors),
      JSON.stringify(item.tags),
      Number(item.isDirectory),
      JSON.stringify(item.children),
      Number(item.isArticle),
      item.articleId,
      Number(item.isCard),
      item.cardId,
      JSON.stringify(item.content),
      item.bannerBg,
      item.icon,
      Number(item.isDelete),
      JSON.stringify(item.parents),
    );

    // TODO 插入操作记录

    return this.getDocumentItem(Number(res.lastInsertRowid));
  }

  async updateDocumentItem(item: IUpdateDocumentItem): Promise<IDocumentItem> {
    const stmt = this.db.prepare(`
      UPDATE document_items SET
        update_time = ?,
        title = ?,
        authors = ?,
        tags = ?,
        is_directory = ?,
        children = ?,
        is_article = ?,
        article_id = ?,
        is_card = ?,
        card_id = ?,
        content = ?,
        banner_bg = ?,
        icon = ?,
        is_delete = ?,
        parents = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      document.title,
      JSON.stringify(item.authors),
      JSON.stringify(item.tags),
      Number(item.isDirectory),
      JSON.stringify(item.children),
      Number(item.isArticle),
      item.articleId,
      Number(item.isCard),
      item.cardId,
      JSON.stringify(item.content),
      item.bannerBg,
      item.icon,
      Number(item.isDelete),
      JSON.stringify(item.parents),
      item.id
    );

    // TODO 插入操作记录

    if (item.isCard) {
      const cardStmt = this.db.prepare(
        `UPDATE cards SET content = ?, update_time = ? WHERE id = ?`
      );
      cardStmt.run(JSON.stringify(item.content), now, item.cardId);
    }

    if (item.isArticle) {
      const articleStmt = this.db.prepare(
        `UPDATE articles SET content = ?, update_time = ? WHERE id = ?`
      );
      articleStmt.run(JSON.stringify(item.content), now, item.articleId);
    }

    return this.getDocumentItem(item.id);
  }

  async deleteDocumentItem(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM document_items WHERE id = ?');
    return stmt.run(id).changes;
  }

  async getDocumentItem(id: number): Promise<IDocumentItem> {
    const stmt = this.db.prepare('SELECT * FROM document_items WHERE id = ?');
    const item = stmt.get(id);
    return this.parseDocumentItem(item);
  }

  async getDocumentItemsByIds(ids: number[]): Promise<IDocumentItem[]> {
    const res: IDocumentItem[] = [];
    for (const id of ids) {
      res.push(await this.getDocumentItem(id));
    }
    return res;
  }

  async getAllDocumentItems(): Promise<IDocumentItem[]> {
    const stmt = this.db.prepare('SELECT * FROM document_items');
    const items = stmt.all();
    return items.map(item => this.parseDocumentItem(item));
  }

  // root_id 是否是 child_id 的父节点，可能存在多级父节点，这里查询所有父节点，如果 root_id 是 child_id 的父节点，则返回 true
  // 为了防止死循环，这里限制最多查询 10 层
  // 思路：先判断 root_id 是否是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 是不是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 的 children 是不是 child_id 的父节点，以此类推
  async isDocumentItemChildOf(id: number, parentId: number): Promise<boolean> {
    const parentDocumentItem = await this.getDocumentItem(parentId);
    if (parentDocumentItem.children.includes(id)) {
      return true;
    }
    let children = parentDocumentItem.children;
    let count = 0;
    while (children.length > 0 && count < 10) {
      const newChildren = [];
      for (const childId of children) {
        const childDocumentItem = await this.getDocumentItem(childId);
        if (childDocumentItem.children.includes(id)) {
          return true;
        }
        newChildren.push(...childDocumentItem.children);
      }
      children = newChildren;
      count++;
    }
    return false;
  }

  // 首先获取所有的文档项，对于每一个文档项，判断是否有某个文档项的 children 包含该文档项的 id，
  // 如果有，则将该文档添加到这个文档的 parents 中
  async initAllDocumentItemParents(): Promise<void> {
    let documentItems = await this.getAllDocumentItems();
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter((documentItem) => !documentItem.isDelete);

    // 对于每一个文档项，判断是否有某个文档项的 children 包含该文档项的 id，如果有，则将该文档添加到这个文档的 parents 中
    for (const documentItem of documentItems) {
      const parents = [];
      for (const documentItem2 of documentItems) {
        if (documentItem2.children.includes(documentItem.id)) {
          parents.push(documentItem2.id);
        }
      }
      const stmt = this.db.prepare(`UPDATE document_items SET parents = ? WHERE id = ?`);
      stmt.run(JSON.stringify(parents), documentItem.id);
    }
  }

  async initDocumentItemParentsByIds(ids: number[]): Promise<void> {
    let documentItems = await this.getAllDocumentItems();
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter((documentItem) => !documentItem.isDelete);

    for (const id of ids) {
      const parents = [];
      for (const documentItem of documentItems) {
        if (documentItem.children.includes(id)) {
          parents.push(documentItem.id);
        }
      }
      const stmt = this.db.prepare(`UPDATE document_item SET parents = ? WHERE id = ?`);
      stmt.run(JSON.stringify(parents), id);
    }
  }

  async getDocumentItemAllParents(id: number): Promise<number[]> {
    const documentItem = await this.getDocumentItem(id);
    const parents = documentItem.parents;
    const parentsSet = new Set(parents);
    if (parents.length > 0) {
      for (const parent of parents) {
        const parentParents = await this.getDocumentItemAllParents(parent);
        for (const parentParent of parentParents) {
          parentsSet.add(parentParent);
        }
      }
    }

    return Array.from(parentsSet);
  }
}