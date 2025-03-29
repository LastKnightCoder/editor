import Database from "better-sqlite3";
import {
  IDocument,
  ICreateDocument,
  IUpdateDocument,
  IDocumentItem,
  ICreateDocumentItem,
  IUpdateDocumentItem,
} from "@/types";
import { Descendant } from "slate";
import Operation from "./operation";
import { getContentLength } from "@/utils/helper";
import { BrowserWindow } from "electron";
import { basename } from "node:path";

import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import CardTable from "./card";
import ArticleTable from "./article";

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
        content_id INTEGER,
        banner_bg TEXT,
        icon TEXT,
        is_delete INTEGER DEFAULT 0,
        parents TEXT DEFAULT '[]',
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const stmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_items'",
    );
    const tableInfo = (stmt.get() as { sql: string }).sql;
    if (!tableInfo.includes("parents")) {
      const alertStmt = db.prepare(
        "ALTER TABLE document_items ADD COLUMN parents TEXT DEFAULT '[]'",
      );
      alertStmt.run();
    }

    // 如果不包含content_id字段，则添加
    if (!tableInfo.includes("content_id")) {
      // 1. 添加content_id列
      const addColumnStmt = db.prepare(
        "ALTER TABLE document_items ADD COLUMN content_id INTEGER",
      );
      addColumnStmt.run();

      // 2. 获取所有文档条目
      const getAllItemsStmt = db.prepare("SELECT * FROM document_items");
      const items = getAllItemsStmt.all();

      // 3. 为每个条目创建内容记录
      for (const item of items as any[]) {
        let contentId = null;

        // 处理不同的引用类型
        if (item.is_card && item.card_id) {
          // 对于引用卡片的条目，获取卡片的contentId
          const cardResult = CardTable.getCardById(db, item.card_id);
          if (cardResult && cardResult.contentId) {
            contentId = cardResult.contentId;
            // 增加引用计数
            ContentTable.incrementRefCount(db, contentId);
          }
        } else if (item.is_article && item.article_id) {
          // 对于引用文章的条目，获取文章的contentId
          const articleResult = ArticleTable.getArticleById(
            db,
            item.article_id,
          );
          if (articleResult && articleResult.contentId) {
            contentId = articleResult.contentId;
            // 增加引用计数
            ContentTable.incrementRefCount(db, contentId);
          }
        } else if (item.content) {
          // 创建新的内容记录
          try {
            const content = JSON.parse(item.content);
            const count = item.count || getContentLength(content);

            contentId = ContentTable.createContent(db, {
              content: content,
              count: count,
            });
          } catch (error) {
            console.error("Error parsing content:", error);
          }
        }

        // 更新条目的content_id字段
        if (contentId) {
          const updateStmt = db.prepare(
            "UPDATE document_items SET content_id = ? WHERE id = ?",
          );
          updateStmt.run(contentId, item.id);
        }
      }

      // 删除content字段
      const dropContentColumnStmt = db.prepare(
        "ALTER TABLE document_items DROP COLUMN content",
      );
      dropContentColumnStmt.run();

      // 删除count字段
      const dropCountColumnStmt = db.prepare(
        "ALTER TABLE document_items DROP COLUMN count",
      );
      dropCountColumnStmt.run();
    }
  }

  static getListenEvents() {
    return {
      "create-document": this.createDocument.bind(this),
      "update-document": this.updateDocument.bind(this),
      "delete-document": this.deleteDocument.bind(this),
      "get-document": this.getDocument.bind(this),
      "get-all-documents": this.getAllDocuments.bind(this),
      "create-document-item": this.createDocumentItem.bind(this),
      "update-document-item": this.updateDocumentItem.bind(this),
      "delete-document-item": this.deleteDocumentItem.bind(this),
      "get-document-item": this.getDocumentItem.bind(this),
      "get-document-items-by-ids": this.getDocumentItemsByIds.bind(this),
      "get-all-document-items": this.getAllDocumentItems.bind(this),
      "is-document-item-child-of": this.isDocumentItemChildOf.bind(this),
      "init-document-item-parents": this.initAllDocumentItemParents.bind(this),
      "init-document-item-parents-by-ids":
        this.initDocumentItemParentsByIds.bind(this),
      "get-document-item-all-parents":
        this.getDocumentItemAllParents.bind(this),
      "get-root-documents-by-document-item-id":
        this.getRootDocumentsByDocumentItemId.bind(this),
    };
  }

  static parseDocument(document: any): IDocument {
    const res = {
      ...document,
      authors: JSON.parse(document.authors || "[]"),
      content: JSON.parse(document.content),
      children: JSON.parse(document.children || "[]"),
      tags: JSON.parse(document.tags || "[]"),
      links: JSON.parse(document.links || "[]"),
      isDelete: document.is_delete,
      createTime: document.create_time,
      updateTime: document.update_time,
      bannerBg: document.banner_bg,
      isTop: Boolean(document.is_top),
    };

    delete res.is_delete;
    delete res.is_top;
    delete res.create_time;
    delete res.update_time;

    return res;
  }

  static parseDocumentItem(item: any): IDocumentItem {
    let content: Descendant[] = [];
    let count = 0;
    const contentId = item.content_id;

    try {
      content = JSON.parse(item.content);
      count = item.count || 0;
    } catch (error) {
      console.error("Error parsing content:", error);
    }

    const res = {
      ...item,
      authors: JSON.parse(item.authors || "[]"),
      tags: JSON.parse(item.tags || "[]"),
      content: content,
      children: JSON.parse(item.children || "[]"),
      parents: JSON.parse(item.parents || "[]"),
      isDelete: item.is_delete,
      createTime: item.create_time,
      updateTime: item.update_time,
      bannerBg: item.banner_bg,
      isDirectory: item.is_directory,
      isArticle: item.is_article,
      isCard: item.is_card,
      articleId: item.article_id,
      cardId: item.card_id,
      count: count,
      contentId: contentId,
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
    delete res.content_id;

    return res;
  }

  static createDocument(
    db: Database.Database,
    document: ICreateDocument,
  ): IDocument {
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
      Number(document.isDelete),
    );

    Operation.insertOperation(
      db,
      "document",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getDocument(db, Number(res.lastInsertRowid));
  }

  static updateDocument(
    db: Database.Database,
    document: IUpdateDocument,
  ): IDocument {
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
      document.id,
    );

    Operation.insertOperation(db, "document", "update", document.id, now);

    return this.getDocument(db, document.id);
  }

  static deleteDocument(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM documents WHERE id = ?");

    Operation.insertOperation(db, "document", "delete", id, Date.now());

    return stmt.run(id).changes;
  }

  static getDocument(db: Database.Database, id: number): IDocument {
    const stmt = db.prepare("SELECT * FROM documents WHERE id = ?");
    const document = stmt.get(id);
    return this.parseDocument(document);
  }

  static getAllDocuments(db: Database.Database): IDocument[] {
    const stmt = db.prepare(
      "SELECT * FROM documents ORDER BY create_time DESC",
    );
    const documents = stmt.all();
    return documents.map((doc) => this.parseDocument(doc));
  }

  static createDocumentItem(
    db: Database.Database,
    item: ICreateDocumentItem,
  ): IDocumentItem {
    let contentId = null;

    if (item.isCard && item.cardId) {
      const card = CardTable.getCardById(db, item.cardId);
      if (card) {
        contentId = card.contentId;
      }
    } else if (item.isArticle && item.articleId) {
      const article = ArticleTable.getArticleById(db, item.articleId);
      if (article) {
        contentId = article.contentId;
      }
    } else {
      contentId = ContentTable.createContent(db, {
        content: item.content,
        count: item.count || getContentLength(item.content),
      });
    }

    if (!contentId) {
      throw new Error("contentId is null");
    }

    const stmt = db.prepare(`
      INSERT INTO document_items
      (create_time, update_time, title, authors, tags, is_directory, 
      children, is_article, article_id, is_card, card_id, 
      content_id, banner_bg, icon, is_delete, parents)
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
      contentId,
      item.bannerBg,
      item.icon,
      Number(item.isDelete),
      JSON.stringify(item.parents || []),
    );

    Operation.insertOperation(
      db,
      "document-item",
      "insert",
      Number(res.lastInsertRowid),
      Date.now(),
    );

    return this.getDocumentItem(db, Number(res.lastInsertRowid));
  }

  static updateDocumentItem(
    db: Database.Database,
    item: IUpdateDocumentItem,
    ...res: any[]
  ): IDocumentItem {
    const win = res[res.length - 1];

    ContentTable.updateContent(db, item.contentId, {
      content: item.content,
      count: item.count || getContentLength(item.content),
    });

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
        content_id = ?,
        banner_bg = ?,
        icon = ?,
        is_delete = ?,
        parents = ?
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
      item.contentId,
      item.bannerBg,
      item.icon,
      Number(item.isDelete),
      JSON.stringify(item.parents),
      item.id,
    );

    Operation.insertOperation(db, "document-item", "update", item.id, now);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("document-item:updated", {
          databaseName: basename(db.name),
          documentItemId: item.id,
        });
      }
    });

    if (item.isCard && item.cardId) {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (window !== win && !window.isDestroyed()) {
          window.webContents.send("card:updated", {
            databaseName: basename(db.name),
            cardId: item.cardId,
          });
        }
      });
    }

    if (item.isArticle && item.articleId) {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (window !== win && !window.isDestroyed()) {
          window.webContents.send("article:updated", {
            databaseName: basename(db.name),
            articleId: item.articleId,
          });
        }
      });
    }

    return this.getDocumentItem(db, item.id);
  }

  static deleteDocumentItem(db: Database.Database, id: number): number {
    // 获取document_item信息，以获取contentId
    const itemInfo = this.getDocumentItem(db, id);

    if (itemInfo && itemInfo.contentId) {
      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, itemInfo.contentId);
    }

    const stmt = db.prepare("DELETE FROM document_items WHERE id = ?");

    // 删除全文搜索索引
    FTSTable.removeIndexByIdAndType(db, id, "document-item");
    // 删除向量文档索引
    VecDocumentTable.removeIndexByIdAndType(db, id, "document-item");

    Operation.insertOperation(db, "document-item", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDocumentItem(db: Database.Database, id: number): IDocumentItem {
    const stmt = db.prepare(`
      SELECT di.*, c.content, c.count
      FROM document_items di
      LEFT JOIN contents c ON di.content_id = c.id
      WHERE di.id = ?
    `);
    const item = stmt.get(id);
    return this.parseDocumentItem(item);
  }

  static getDocumentItemsByIds(
    db: Database.Database,
    ids: number[],
  ): IDocumentItem[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT di.*, c.content, c.count
       FROM document_items di
       LEFT JOIN contents c ON di.content_id = c.id
       WHERE di.id IN (${placeholders})`,
    );
    const items = stmt.all(ids);
    return items.map((item) => this.parseDocumentItem(item));
  }

  static getAllDocumentItems(db: Database.Database): IDocumentItem[] {
    const stmt = db.prepare(`
      SELECT di.*, c.content, c.count
      FROM document_items di
      LEFT JOIN contents c ON di.content_id = c.id
    `);
    const items = stmt.all();
    return items.map((item) => this.parseDocumentItem(item));
  }

  // root_id 是否是 child_id 的父节点，可能存在多级父节点，这里查询所有父节点，如果 root_id 是 child_id 的父节点，则返回 true
  // 为了防止死循环，这里限制最多查询 10 层
  // 思路：先判断 root_id 是否是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 是不是 child_id 的父节点，如果是，则返回 true，
  // 如果不是，则继续查询 root_id 的 children 的 children 是不是 child_id 的父节点，以此类推
  static isDocumentItemChildOf(
    db: Database.Database,
    id: number,
    parentId: number,
  ): boolean {
    const parentDocumentItem = this.getDocumentItem(db, parentId);
    if (parentDocumentItem.children.includes(id)) {
      return true;
    }
    let children = parentDocumentItem.children;
    let count = 0;
    while (children.length > 0 && count < 10) {
      const newChildren = [];
      for (const childId of children) {
        const childDocumentItem = this.getDocumentItem(db, childId);
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
  static initAllDocumentItemParents(db: Database.Database): void {
    let documentItems = this.getAllDocumentItems(db);
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter(
      (documentItem) => !documentItem.isDelete,
    );

    const now = Date.now();
    // 对于每一个文档项，判断是否有某个文档项的 children 包含该文档项的 id，如果有，则将该文档添加到这个文档的 parents 中
    for (const documentItem of documentItems) {
      const parents = [];
      for (const documentItem2 of documentItems) {
        if (documentItem2.children.includes(documentItem.id)) {
          parents.push(documentItem2.id);
        }
      }
      const stmt = db.prepare(
        `UPDATE document_items SET update_time = ?, parents = ? WHERE id = ?`,
      );
      stmt.run(now, JSON.stringify(parents), documentItem.id);
      Operation.insertOperation(
        db,
        "document-item",
        "init-parents",
        documentItem.id,
        now,
      );
    }
  }

  static initDocumentItemParentsByIds(
    db: Database.Database,
    ids: number[],
  ): void {
    let documentItems = this.getAllDocumentItems(db);
    // 过滤掉已经删除掉的
    documentItems = documentItems.filter(
      (documentItem) => !documentItem.isDelete,
    );

    const now = Date.now();
    for (const id of ids) {
      const parents = [];
      for (const documentItem of documentItems) {
        if (documentItem.children.includes(id)) {
          parents.push(documentItem.id);
        }
      }
      const stmt = db.prepare(
        `UPDATE document_items SET update_time = ?, parents = ? WHERE id = ?`,
      );
      stmt.run(now, JSON.stringify(parents), id);
      Operation.insertOperation(db, "document-item", "init-parents", id, now);
    }
  }

  static getDocumentItemAllParents(
    db: Database.Database,
    id: number,
  ): number[] {
    const documentItem = this.getDocumentItem(db, id);
    const parents = documentItem.parents;
    const parentsSet = new Set(parents);
    if (parents.length > 0) {
      for (const parent of parents) {
        const parentParents = this.getDocumentItemAllParents(db, parent);
        for (const parentParent of parentParents) {
          parentsSet.add(parentParent);
        }
      }
    }

    return Array.from(parentsSet);
  }

  static getRootDocumentsByDocumentItemId(
    db: Database.Database,
    id: number,
  ): IDocument[] {
    const parents = this.getDocumentItemAllParents(db, id);
    // 获取所有的 documents
    const documents = this.getAllDocuments(db);
    // 判断 document.children 中是否存在 parents
    return documents.filter((document) => {
      return document.children.some((childId) => parents.includes(childId));
    });
  }
}
