import Database from 'better-sqlite3';
import {
  IDocument,
  ICreateDocument,
  IUpdateDocument,
  IDocumentItem,
  ICreateDocumentItem,
  IUpdateDocumentItem
} from '@/types';
import Operation from './operation';
import { getContentLength } from "@/utils/helper";

export default class DocumentTable {
  static initTable(db: Database.Database) {
    db.exec(`
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

    db.exec(`
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
        parents TEXT DEFAULT '[]',
        count INTEGER DEFAULT 0
      )
    `);
  }

  static async upgradeTable(db: Database.Database) {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_items'");
    const tableInfo = (stmt.get() as { sql: string }).sql;
    if (!tableInfo.includes('parents')) {
      const alertStmt = db.prepare("ALTER TABLE document_items ADD COLUMN parents TEXT DEFAULT '[]'");
      alertStmt.run();
    }
    if (!tableInfo.includes('count')) {
      const alertStmt = db.prepare("ALTER TABLE document_items ADD COLUMN count INTEGER DEFAULT 0");
      alertStmt.run();
      for (const item of await this.getAllDocumentItems(db)) {
        const contentLength = getContentLength(item.content);
        const stmt = db.prepare('UPDATE document_items SET count = ? WHERE id = ?');
        stmt.run(contentLength, item.id);
      }
    }
  }

  static getListenEvents() {
    return {
      'create-document': this.createDocument.bind(this),
      'update-document': this.updateDocument.bind(this),
      'delete-document': this.deleteDocument.bind(this),
      'get-document': this.getDocument.bind(this),
      'get-all-documents': this.getAllDocuments.bind(this),
      'create-document-item': this.createDocumentItem.bind(this),
      'update-document-item': this.updateDocumentItem.bind(this),
      'delete-document-item': this.deleteDocumentItem.bind(this),
      'get-document-item': this.getDocumentItem.bind(this),
      'get-document-items-by-ids': this.getDocumentItemsByIds.bind(this),
      'get-all-document-items': this.getAllDocumentItems.bind(this),
      'is-document-item-child-of': this.isDocumentItemChildOf.bind(this),
      'init-document-item-parents': this.initAllDocumentItemParents.bind(this),
      'init-document-item-parents-by-ids': this.initDocumentItemParentsByIds.bind(this),
      'get-document-item-all-parents': this.getDocumentItemAllParents.bind(this),
      'get-root-documents-by-document-item-id': this.getRootDocumentsByDocumentItemId.bind(this),
    }
  }

  static parseDocument(document: any): IDocument {
    const res = {
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

    delete res.is_delete;
    delete res.is_top;
    delete res.create_time;
    delete res.update_time;

    return res;
  }

  static parseDocumentItem(item: any): IDocumentItem {
    const res = {
      ...item,
      authors: JSON.parse('[]'),
      tags: JSON.parse('[]'),
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

    delete res.create_time;
    delete res.update_time;
    delete res.banner_bg;
    delete res.is_delete;
    delete res.is_directory;
    delete res.is_article;
    delete res.is_card;
    delete res.article_id;
    delete res.card_id;

    return res;
  }

  static async createDocument(db: Database.Database, document: ICreateDocument): Promise<IDocument> {
    const stmt = db.prepare(`
      INSERT INTO documents
      (title, desc, authors, children, tags, links, content, create_time, update_time, banner_bg, icon, is_top, is_delete)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    Operation.insertOperation(db, 'document', 'insert', res.lastInsertRowid, now);

    return this.getDocument(db, Number(res.lastInsertRowid));
  }

  static async updateDocument(db: Database.Database, document: IUpdateDocument): Promise<IDocument> {
    const stmt = db.prepare(`
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
    `);

    const now = Date.now();

    stmt.run(
      document.title,
      document.desc,
      JSON.stringify(document.authors),
      JSON.stringify(document.children),
      JSON.stringify(document.tags),
      JSON.stringify(document.links),
      JSON.stringify(document.content),
      now,
      document.bannerBg,
      document.icon,
      Number(document.isTop),
      Number(document.isDelete),
      document.id
    );

    Operation.insertOperation(
      db,
      'document',
      'update',
      document.id,
      now,
    );

    return this.getDocument(db, document.id);
  }

  static async deleteDocument(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM documents WHERE id = ?');

    Operation.insertOperation(
      db,
      'document',
      'delete',
      id,
      Date.now(),
    );

    return stmt.run(id).changes;
  }

  static async getDocument(db: Database.Database, id: number): Promise<IDocument> {
    const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
    const document = stmt.get(id);
    return this.parseDocument(document);
  }

  static async getAllDocuments(db: Database.Database): Promise<IDocument[]> {
    const stmt = db.prepare('SELECT * FROM documents ORDER BY create_time DESC');
    const documents = stmt.all();
    return documents.map(doc => this.parseDocument(doc));
  }

  static async createDocumentItem(db: Database.Database, item: ICreateDocumentItem): Promise<IDocumentItem> {
    const stmt = db.prepare(`
      INSERT INTO document_items
      (create_time, update_time, title, authors, tags, is_directory, 
      children, is_article, article_id, is_card, card_id, 
      content, banner_bg, icon, is_delete, parents, count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      item.count,
    );

    Operation.insertOperation(
      db,
      'document-item',
      'insert',
      Number(res.lastInsertRowid),
      Date.now(),
    );

    return this.getDocumentItem(db, Number(res.lastInsertRowid));
  }

  static async updateDocumentItem(db: Database.Database, item: IUpdateDocumentItem): Promise<IDocumentItem> {
    console.log('updateDocumentItem', item);
    const stmt = db.prepare(`
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
        parents = ?,
        count = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
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
      item.count,
      item.id
    );

    Operation.insertOperation(db, 'document-item', 'update', item.id, now);

    if (item.isCard) {
      const cardStmt = db.prepare(
        `UPDATE cards SET content = ?, update_time = ?, count = ? WHERE id = ?`
      );
      cardStmt.run(JSON.stringify(item.content), now, item.count, item.cardId);
    }

    if (item.isArticle) {
      const articleStmt = db.prepare(
        `UPDATE articles SET content = ?, update_time = ?, count = ? WHERE id = ?`
      );
      articleStmt.run(JSON.stringify(item.content), now, item.count, item.articleId);
    }

    return this.getDocumentItem(db, item.id);
  }

  static async deleteDocumentItem(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM document_items WHERE id = ?');
    Operation.insertOperation(db, 'document-item', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static async getDocumentItem(db: Database.Database, id: number): Promise<IDocumentItem> {
    const stmt = db.prepare('SELECT * FROM document_items WHERE id = ?');
    const item = stmt.get(id);
    return this.parseDocumentItem(item);
  }

  static async getDocumentItemsByIds(db: Database.Database, ids: number[]): Promise<IDocumentItem[]> {
    const res: IDocumentItem[] = [];
    for (const id of ids) {
      res.push(await this.getDocumentItem(db, id));
    }
    return res;
  }

  static async getAllDocumentItems(db: Database.Database): Promise<IDocumentItem[]> {
    const stmt = db.prepare('SELECT * FROM document_items');
    const items = stmt.all();
    return items.map(item => this.parseDocumentItem(item));
  }

  // root_id 是否是 child_id 的父节点，可能存在多级父节点，这里查询所有父节点，如果 root_id 是 child_id 的父节点，则返回 true
  // 为了防止死循环，这里限制最多查询 10 层
  // 思路：先判断 root_id 是否是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 是不是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 的 children 是不是 child_id 的父节点，以此类推
  static async isDocumentItemChildOf(db: Database.Database, id: number, parentId: number): Promise<boolean> {
    const parentDocumentItem = await this.getDocumentItem(db, parentId);
    if (parentDocumentItem.children.includes(id)) {
      return true;
    }
    let children = parentDocumentItem.children;
    let count = 0;
    while (children.length > 0 && count < 10) {
      const newChildren = [];
      for (const childId of children) {
        const childDocumentItem = await this.getDocumentItem(db, childId);
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
  static async initAllDocumentItemParents(db: Database.Database): Promise<void> {
    let documentItems = await this.getAllDocumentItems(db);
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter((documentItem) => !documentItem.isDelete);

    const now = Date.now();
    // 对于每一个文档项，判断是否有某个文档项的 children 包含该文档项的 id，如果有，则将该文档添加到这个文档的 parents 中
    for (const documentItem of documentItems) {
      const parents = [];
      for (const documentItem2 of documentItems) {
        if (documentItem2.children.includes(documentItem.id)) {
          parents.push(documentItem2.id);
        }
      }
      const stmt = db.prepare(`UPDATE document_items SET update_time = ?, parents = ? WHERE id = ?`);
      stmt.run(now, JSON.stringify(parents), documentItem.id);
      Operation.insertOperation(db, 'document-item', 'init-parents', documentItem.id, now)
    }

  }

  static async initDocumentItemParentsByIds(db: Database.Database, ids: number[]): Promise<void> {
    let documentItems = await this.getAllDocumentItems(db);
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter((documentItem) => !documentItem.isDelete);

    const now = Date.now();
    for (const id of ids) {
      const parents = [];
      for (const documentItem of documentItems) {
        if (documentItem.children.includes(id)) {
          parents.push(documentItem.id);
        }
      }
      const stmt = db.prepare(`UPDATE document_item SET update_time = ?, parents = ? WHERE id = ?`);
      stmt.run(now, JSON.stringify(parents), id);
      Operation.insertOperation(db, 'document-item', 'init-parents', id, now);
    }
  }

  static async getDocumentItemAllParents(db: Database.Database, id: number): Promise<number[]> {
    const documentItem = await this.getDocumentItem(db, id);
    const parents = documentItem.parents;
    const parentsSet = new Set(parents);
    if (parents.length > 0) {
      for (const parent of parents) {
        const parentParents = await this.getDocumentItemAllParents(db, parent);
        for (const parentParent of parentParents) {
          parentsSet.add(parentParent);
        }
      }
    }

    return Array.from(parentsSet);
  }

  static async getRootDocumentsByDocumentItemId(db: Database.Database, id: number): Promise<IDocument[]> {
    const parents = await this.getDocumentItemAllParents(db, id);
    // 获取所有的 documents
    const documents = await this.getAllDocuments(db);
    // 判断 document.children 中是否存在 parents
    return documents.filter((document) => {
      return document.children.some((childId) => parents.includes(childId));
    })
  }
}
