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
import { getContentLength } from "@/utils/helper";
import { getMarkdown } from "@/utils/markdown.ts";
import { BrowserWindow } from "electron";
import { basename } from "node:path";
import log from "electron-log";

import Operation from "./operation";
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
        children TEXT,
        content TEXT,
        is_top INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS document_items (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        tags TEXT,
        children TEXT,
        is_article INTEGER DEFAULT 0,
        article_id INTEGER DEFAULT 0,
        is_card INTEGER DEFAULT 0,
        card_id INTEGER DEFAULT 0,
        content_id INTEGER,
        parents TEXT DEFAULT '[]',
        documents TEXT DEFAULT '[]',
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const documentItemTableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_items'",
    );
    const documentItemTableInfo = documentItemTableInfoStmt.get() as {
      sql: string;
    };

    const documentTableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'documents'",
    );
    const documentTableInfo = documentTableInfoStmt.get() as { sql: string };

    // 删除 authors tags links banner_bg icon is_delete 字段
    if (!documentTableInfo.sql.includes("authors TEXT")) {
      db.exec(`ALTER TABLE documents DROP COLUMN authors`);
      log.info("已为 documents 表删除 authors 字段");
    }

    if (!documentTableInfo.sql.includes("tags TEXT")) {
      db.exec(`ALTER TABLE documents DROP COLUMN tags`);
      log.info("已为 documents 表删除 tags 字段");
    }

    if (!documentTableInfo.sql.includes("links TEXT")) {
      db.exec(`ALTER TABLE documents DROP COLUMN links`);
      log.info("已为 documents 表删除 links 字段");
    }

    if (!documentTableInfo.sql.includes("banner_bg TEXT")) {
      db.exec(`ALTER TABLE documents DROP COLUMN banner_bg`);
      log.info("已为 documents 表删除 banner_bg 字段");
    }

    if (!documentTableInfo.sql.includes("icon TEXT")) {
      db.exec(`ALTER TABLE documents DROP COLUMN icon`);
      log.info("已为 documents 表删除 icon 字段");
    }

    if (!documentTableInfo.sql.includes("is_delete INTEGER")) {
      db.exec(`ALTER TABLE documents DROP COLUMN is_delete`);
      log.info("已为 documents 表删除 is_delete 字段");
    }

    // Add documents field if it doesn't exist
    if (!documentItemTableInfo.sql.includes("documents TEXT")) {
      db.exec(
        `ALTER TABLE document_items ADD COLUMN documents TEXT DEFAULT '[]'`,
      );
      log.info("已为 document_items 表添加 documents 字段");

      // 初始化所有文档条目的 documents 字段
      this.initAllDocumentItemsDocuments(db);
    }

    if (documentItemTableInfo.sql.includes("banner_bg TEXT")) {
      // 删除 banner_bg 字段
      db.exec(`ALTER TABLE document_items DROP COLUMN banner_bg`);
      log.info("已为 document_items 表删除 banner_bg 字段");
    }

    // 删除 isDirectory 字段
    if (documentItemTableInfo.sql.includes("is_directory INTEGER")) {
      db.exec(`ALTER TABLE document_items DROP COLUMN is_directory`);
      log.info("已为 document_items 表删除 is_directory 字段");
    }

    // 删除 isDelete 字段
    if (documentItemTableInfo.sql.includes("is_delete INTEGER")) {
      db.exec(`ALTER TABLE document_items DROP COLUMN is_delete`);
      log.info("已为 document_items 表删除 is_delete 字段");
    }

    // 删除 icon 字段
    if (documentItemTableInfo.sql.includes("icon TEXT")) {
      db.exec(`ALTER TABLE document_items DROP COLUMN icon`);
      log.info("已为 document_items 表删除 icon 字段");
    }

    // 删除 authors
    if (documentItemTableInfo.sql.includes("authors TEXT")) {
      db.exec(`ALTER TABLE document_items DROP COLUMN authors`);
      log.info("已为 document_items 表删除 authors 字段");
    }

    // 为所有文档条目添加 FTS 索引
    log.info("开始为所有文档条目添加 FTS 索引");
    const documentItems = this.getAllDocumentItems(db);
    for (const item of documentItems) {
      if (!item.content || !item.content.length) continue;

      // 检查是否已有索引或索引是否过期
      const indexInfo = FTSTable.checkIndexExists(db, item.id, "document-item");

      // 如果索引不存在或已过期，则添加/更新索引
      if (!indexInfo || indexInfo.updateTime < item.updateTime) {
        FTSTable.indexContent(db, {
          id: item.id,
          content: getMarkdown(item.content),
          type: "document-item",
          updateTime: item.updateTime,
        });
        log.info(`已为文档条目 ${item.id} 添加/更新 FTS 索引`);
      }
    }
  }

  static initAllDocumentItemsDocuments(db: Database.Database): void {
    log.info("开始初始化所有文档条目的 documents 字段");
    // 获取所有文档和文档条目
    const documents = this.getAllDocuments(db);
    const documentItems = this.getAllDocumentItems(db);

    // 为所有条目创建id到对象的映射，便于快速查找
    const itemMap = new Map<number, IDocumentItem>();
    documentItems.forEach((item) => {
      itemMap.set(item.id, item);
    });

    // 首先初始化所有根文档条目的 documents 字段
    for (const document of documents) {
      // 获取文档的根级条目
      const rootItems = document.children;

      // 更新根条目的 documents 字段
      for (const itemId of rootItems) {
        const item = itemMap.get(itemId);
        if (!item) continue;

        // 获取当前的 documents 数组，避免覆盖已有的关联
        const currentDocuments = new Set(item.documents || []);
        currentDocuments.add(document.id);

        // 更新文档条目的 documents 字段
        const stmt = db.prepare(
          `UPDATE document_items SET documents = ? WHERE id = ?`,
        );
        const documentsArray = Array.from(currentDocuments);
        stmt.run(JSON.stringify(documentsArray), itemId);

        // 更新内存中的对象
        item.documents = documentsArray;

        log.info(
          `已为根文档条目 ${itemId} 设置所属文档 ${JSON.stringify(documentsArray)}`,
        );

        // 递归处理这个根文档的所有子项
        if (item.children && item.children.length > 0) {
          this.updateChildrenDocumentsField(item, itemMap, db);
        }
      }
    }

    log.info("所有文档条目的 documents 字段初始化完成");
  }

  static updateChildrenDocumentsField(
    parentItem: IDocumentItem,
    itemMap: Map<number, IDocumentItem>,
    db: Database.Database,
  ): void {
    // 获取父条目的 documents 列表
    const parentDocuments = parentItem.documents || [];

    // 处理每个子条目
    for (const childId of parentItem.children) {
      const childItem = itemMap.get(childId);
      if (!childItem) continue;

      // 合并父条目和子条目的 documents（去重）
      const childDocuments = new Set([
        ...(childItem.documents || []),
        ...parentDocuments,
      ]);
      const documentsArray = Array.from(childDocuments);

      // 只有当 documents 发生变化时才更新数据库
      if (
        JSON.stringify(childItem.documents) !== JSON.stringify(documentsArray)
      ) {
        // 更新子条目的 documents 字段
        const stmt = db.prepare(
          `UPDATE document_items SET documents = ? WHERE id = ?`,
        );
        stmt.run(JSON.stringify(documentsArray), childId);

        // 更新内存中的对象
        childItem.documents = documentsArray;

        log.info(
          `已为子文档条目 ${childId} 设置所属文档 ${JSON.stringify(documentsArray)}`,
        );
      }

      // 递归处理子条目的子条目
      if (childItem.children && childItem.children.length > 0) {
        this.updateChildrenDocumentsField(childItem, itemMap, db);
      }
    }
  }

  static getListenEvents() {
    return {
      "create-document": this.createDocument.bind(this),
      "update-document": this.updateDocument.bind(this),
      "delete-document": this.deleteDocument.bind(this),
      "get-document": this.getDocument.bind(this),
      "get-all-documents": this.getAllDocuments.bind(this),
      "add-root-document-item": this.addRootDocumentItem.bind(this),
      "add-child-document-item": this.addChildDocumentItem.bind(this),
      "add-ref-root-document-item": this.addRefRootDocumentItem.bind(this),
      "add-ref-child-document-item": this.addRefChildDocumentItem.bind(this),
      "remove-root-document-item": this.removeRootDocumentItem.bind(this),
      "remove-child-document-item": this.removeChildDocumentItem.bind(this),
      "update-document-item": this.updateDocumentItem.bind(this),
      "delete-document-item": this.deleteDocumentItem.bind(this),
      "get-document-item": this.getDocumentItem.bind(this),
      "get-document-items-by-ids": this.getDocumentItemsByIds.bind(this),
      "get-document-items-by-document-id":
        this.getDocumentItemsByDocumentId.bind(this),
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
      content: JSON.parse(document.content),
      children: JSON.parse(document.children || "[]"),
      createTime: document.create_time,
      updateTime: document.update_time,
      isTop: Boolean(document.is_top),
    };

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

    // 使用文档条目和内容表中最大的更新时间
    const updateTime = item.content_update_time
      ? Math.max(item.update_time, item.content_update_time)
      : item.update_time;

    const res = {
      ...item,
      tags: JSON.parse(item.tags || "[]"),
      content: content,
      children: JSON.parse(item.children || "[]"),
      parents: JSON.parse(item.parents || "[]"),
      documents: JSON.parse(item.documents || "[]"),
      createTime: item.create_time,
      updateTime: updateTime,
      isArticle: item.is_article,
      isCard: item.is_card,
      articleId: item.article_id,
      cardId: item.card_id,
      count: count,
      contentId: contentId,
    };

    delete res.create_time;
    delete res.update_time;
    delete res.is_article;
    delete res.is_card;
    delete res.article_id;
    delete res.card_id;
    delete res.content_id;

    return res;
  }

  static getContentId(
    db: Database.Database,
    documentItem: ICreateDocumentItem,
  ): number {
    let contentId = 0;
    if (documentItem.isCard && documentItem.cardId) {
      const card = CardTable.getCardById(db, documentItem.cardId);
      if (card) {
        contentId = card.contentId;
        ContentTable.incrementRefCount(db, contentId);
      }
    } else if (documentItem.isArticle && documentItem.articleId) {
      const article = ArticleTable.getArticleById(db, documentItem.articleId);
      if (article) {
        contentId = article.contentId;
        ContentTable.incrementRefCount(db, contentId);
      }
    }

    if (!contentId) {
      contentId = ContentTable.createContent(db, {
        content: documentItem.content,
        count: documentItem.count || getContentLength(documentItem.content),
      });
    }

    return contentId;
  }

  static addRootDocumentItem(
    db: Database.Database,
    documentId: number,
    documentItem: ICreateDocumentItem,
  ): [IDocument, IDocumentItem | null] {
    const stmt = db.prepare(`
      INSERT INTO document_items (create_time, update_time, title, tags, children, is_article, article_id, is_card, card_id, content_id, parents, documents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const contentId = this.getContentId(db, documentItem);

    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      documentItem.title,
      JSON.stringify(documentItem.tags),
      JSON.stringify(documentItem.children),
      Number(documentItem.isArticle),
      documentItem.articleId,
      Number(documentItem.isCard),
      documentItem.cardId,
      contentId,
      JSON.stringify(documentItem.parents),
      JSON.stringify([documentId]),
    );

    const document = this.getDocument(db, documentId);
    document.children.push(Number(res.lastInsertRowid));
    this.updateDocument(db, document);

    Operation.insertOperation(
      db,
      "document-item",
      "insert",
      Number(res.lastInsertRowid),
      Date.now(),
    );

    return [document, this.getDocumentItem(db, Number(res.lastInsertRowid))];
  }

  static addChildDocumentItem(
    db: Database.Database,
    parentDocumentItemId: number,
    documentItem: ICreateDocumentItem,
  ): [IDocumentItem | null, IDocumentItem | null] | null {
    const parentDocumentItem = this.getDocumentItem(db, parentDocumentItemId);
    if (!parentDocumentItem) {
      return null;
    }

    const now = Date.now();

    const contentId = this.getContentId(db, documentItem);

    const currentDocuments = new Set(parentDocumentItem.documents || []);

    const stmt = db.prepare(`
      INSERT INTO document_items (create_time, update_time, title, tags, children, is_article, article_id, is_card, card_id, content_id, parents, documents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      documentItem.title,
      JSON.stringify(documentItem.tags),
      JSON.stringify(documentItem.children),
      Number(documentItem.isArticle),
      documentItem.articleId,
      Number(documentItem.isCard),
      documentItem.cardId,
      contentId,
      JSON.stringify([parentDocumentItemId]),
      JSON.stringify(Array.from(currentDocuments)),
    );

    const currentChildren = new Set(parentDocumentItem.children || []);
    currentChildren.add(Number(res.lastInsertRowid));
    parentDocumentItem.children = Array.from(currentChildren);
    this.updateDocumentItem(db, parentDocumentItem);

    Operation.insertOperation(
      db,
      "document-item",
      "insert",
      Number(res.lastInsertRowid),
      Date.now(),
    );

    return [
      parentDocumentItem,
      this.getDocumentItem(db, Number(res.lastInsertRowid)),
    ];
  }

  static addRefRootDocumentItem(
    db: Database.Database,
    documentId: number,
    documentItemId: number,
  ): [IDocument, IDocumentItem | null] | null {
    const document = this.getDocument(db, documentId);
    document.children.push(documentItemId);
    this.updateDocument(db, document);

    // 更新 documents
    const documentItem = this.getDocumentItem(db, documentItemId);
    if (!documentItem) return null;

    const currentDocuments = new Set(documentItem.documents || []);
    currentDocuments.add(documentId);
    documentItem.documents = Array.from(currentDocuments);
    this.updateDocumentItem(db, documentItem);

    Operation.insertOperation(
      db,
      "document-item",
      "insert",
      documentItemId,
      Date.now(),
    );

    return [document, documentItem];
  }

  static addRefChildDocumentItem(
    db: Database.Database,
    parentDocumentItemId: number,
    documentItemId: number,
  ): [IDocumentItem | null, IDocumentItem | null] | null {
    const parentDocumentItem = this.getDocumentItem(db, parentDocumentItemId);
    if (!parentDocumentItem) {
      return null;
    }

    // 更新 parentDocumentItem 的 children
    const currentChildren = new Set(parentDocumentItem.children || []);
    currentChildren.add(documentItemId);
    parentDocumentItem.children = Array.from(currentChildren);
    this.updateDocumentItem(db, parentDocumentItem);

    const documentItem = this.getDocumentItem(db, documentItemId);
    if (!documentItem) return null;
    const currentDocuments = new Set(documentItem.documents || []);
    currentDocuments.add(parentDocumentItemId);
    documentItem.documents = Array.from(currentDocuments);
    // 更新 parents
    const currentParents = new Set(documentItem.parents || []);
    currentParents.add(parentDocumentItemId);
    documentItem.parents = Array.from(currentParents);

    this.updateDocumentItem(db, documentItem);

    Operation.insertOperation(
      db,
      "document-item",
      "insert",
      documentItemId,
      Date.now(),
    );

    return [parentDocumentItem, documentItem];
  }

  static removeRootDocumentItem(
    db: Database.Database,
    documentId: number,
    documentItemId: number,
    notDelete?: boolean,
  ): [IDocument, IDocumentItem | null] | null {
    const document = this.getDocument(db, documentId);
    document.children = document.children.filter((id) => id !== documentItemId);
    this.updateDocument(db, document);

    const documentItem = this.getDocumentItem(db, documentItemId);
    if (!documentItem) return null;

    if (notDelete) {
      return [document, documentItem];
    }

    documentItem.documents = documentItem.documents.filter(
      (id) => id !== documentId,
    );
    this.updateDocumentItem(db, documentItem);

    for (const childId of documentItem.children) {
      this.removeChildDocumentItem(db, documentId, documentItemId, childId);
    }
    if (documentItem.documents.length === 0) {
      this.deleteDocumentItem(db, documentItemId);
    }

    return [document, documentItem];
  }

  static removeChildDocumentItem(
    db: Database.Database,
    documentId: number,
    parentDocumentItemId: number,
    documentItemId: number,
    notDelete?: boolean,
  ): [IDocumentItem | null, IDocumentItem | null] | null {
    const parentDocumentItem = this.getDocumentItem(db, parentDocumentItemId);
    if (!parentDocumentItem) {
      return null;
    }

    const documentItem = this.getDocumentItem(db, documentItemId);
    if (!documentItem) return null;

    parentDocumentItem.children = parentDocumentItem.children.filter(
      (id) => id !== documentItemId,
    );
    this.updateDocumentItem(db, parentDocumentItem);

    if (notDelete) {
      return [parentDocumentItem, documentItem];
    }

    documentItem.documents = documentItem.documents.filter(
      (id) => id !== documentId,
    );
    documentItem.parents = documentItem.parents.filter(
      (id) => id !== parentDocumentItemId,
    );
    this.updateDocumentItem(db, documentItem);

    for (const childId of documentItem.children) {
      this.removeChildDocumentItem(
        db,
        documentId,
        documentItemId,
        childId,
        notDelete,
      );
    }
    log.info(`documentItem.documents.length: ${documentItem.documents.length}`);
    if (documentItem.documents.length === 0) {
      this.deleteDocumentItem(db, documentItemId);
    }

    return [parentDocumentItem, documentItem];
  }

  static createDocument(
    db: Database.Database,
    document: ICreateDocument,
  ): IDocument {
    const stmt = db.prepare(`
      INSERT INTO documents
      (title, desc, children, content, create_time, update_time, is_top)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      document.title,
      document.desc,
      JSON.stringify(document.children),
      JSON.stringify(document.content),
      now,
      now,
      Number(document.isTop),
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
        children = ?,
        content = ?,
        update_time = ?,
        is_top = ?
      WHERE id = ?
    `);

    const now = Date.now();

    stmt.run(
      document.title,
      document.desc,
      JSON.stringify(document.children),
      JSON.stringify(document.content),
      now,
      Number(document.isTop),
      document.id,
    );

    Operation.insertOperation(db, "document", "update", document.id, now);

    return this.getDocument(db, document.id);
  }

  static deleteDocument(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM documents WHERE id = ?");

    // 获取所有属于该文档的条目
    const documentItems = this.getDocumentItemsByDocumentId(db, id);

    for (const item of documentItems) {
      this.removeRootDocumentItem(db, id, item.id);
    }

    Operation.insertOperation(db, "document", "delete", id, Date.now());

    const changes = stmt.run(id).changes;

    return changes;
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

  static updateDocumentItem(
    db: Database.Database,
    item: IUpdateDocumentItem,
    ...res: any[]
  ): IDocumentItem | null {
    const win = res[res.length - 1];

    ContentTable.updateContent(db, item.contentId, {
      content: item.content,
      count: item.count || getContentLength(item.content),
    });

    const stmt = db.prepare(`
      UPDATE document_items SET
        update_time = ?,
        title = ?,
        tags = ?,
        children = ?,
        is_article = ?,
        article_id = ?,
        is_card = ?,
        card_id = ?,
        content_id = ?,
        parents = ?,
        documents = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      item.title,
      JSON.stringify(item.tags),
      JSON.stringify(item.children),
      Number(item.isArticle),
      item.articleId,
      Number(item.isCard),
      item.cardId,
      item.contentId,
      JSON.stringify(item.parents),
      JSON.stringify(item.documents),
      item.id,
    );

    Operation.insertOperation(db, "document-item", "update", item.id, now);

    // 更新 FTS 索引，跳过目录类型的条目
    if (item.content && item.content.length) {
      FTSTable.indexContent(db, {
        id: item.id,
        content: getMarkdown(item.content),
        type: "document-item",
        updateTime: now,
      });
    }

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
    if (!itemInfo) {
      log.error(`deleteDocumentItem: ${id} not found`);
      return 0;
    }
    const stmt = db.prepare("DELETE FROM document_items WHERE id = ?");
    const changes = stmt.run(id).changes;

    if (changes > 0) {
      // 删除全文搜索索引
      FTSTable.removeIndexByIdAndType(db, id, "document-item");
      // 删除向量文档索引
      VecDocumentTable.removeIndexByIdAndType(db, id, "document-item");

      Operation.insertOperation(db, "document-item", "delete", id, Date.now());

      if (itemInfo && itemInfo.contentId) {
        // 删除关联的content记录（减少引用计数）
        ContentTable.deleteContent(db, itemInfo.contentId);
      }
    }
    return changes;
  }

  static getDocumentItem(
    db: Database.Database,
    id: number,
  ): IDocumentItem | null {
    const stmt = db.prepare(`
      SELECT di.*, c.content, c.count, c.update_time as content_update_time
      FROM document_items di
      LEFT JOIN contents c ON di.content_id = c.id
      WHERE di.id = ?
    `);
    const item = stmt.get(id);
    if (!item) {
      log.error(`getDocumentItem: ${id} not found`);
      return null;
    }
    return this.parseDocumentItem(item);
  }

  static getDocumentItemsByIds(
    db: Database.Database,
    ids: number[],
  ): IDocumentItem[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT di.*, c.content, c.count, c.update_time as content_update_time
       FROM document_items di
       LEFT JOIN contents c ON di.content_id = c.id
       WHERE di.id IN (${placeholders})`,
    );
    const items = stmt.all(ids);
    return items.map((item) => this.parseDocumentItem(item));
  }

  static getAllDocumentItems(db: Database.Database): IDocumentItem[] {
    const stmt = db.prepare(`
      SELECT di.*, c.content, c.count, c.update_time as content_update_time
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
    if (!parentDocumentItem) return false;
    if (parentDocumentItem.children.includes(id)) {
      return true;
    }
    let children = parentDocumentItem.children;
    let count = 0;
    while (children.length > 0 && count < 10) {
      const newChildren = [];
      for (const childId of children) {
        const childDocumentItem = this.getDocumentItem(db, childId);
        if (!childDocumentItem) continue;
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
    const documentItems = this.getAllDocumentItems(db);

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
    const documentItems = this.getAllDocumentItems(db);

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
    if (!documentItem) return [];
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

  static getDocumentItemsByDocumentId(
    db: Database.Database,
    documentId: number,
  ): IDocumentItem[] {
    const stmt = db.prepare(`
      SELECT di.*, c.content, c.count, c.update_time as content_update_time
      FROM document_items di
      LEFT JOIN contents c ON di.content_id = c.id
      WHERE EXISTS (
        SELECT 1 FROM json_each(di.documents)
        WHERE value = ?
      )
    `);
    const items = stmt.all(documentId);
    return items.map((item) => this.parseDocumentItem(item));
  }
}
