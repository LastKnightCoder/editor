import Database from "better-sqlite3";
import { getContentLength } from "@/utils/helper.ts";
import { ICreateCard, IUpdateCard, ICard } from "@/types";
import Operation from "./operation";
import { BrowserWindow } from "electron";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";
import log from "electron-log";
export default class CardTable {
  static getListenEvents() {
    return {
      "create-card": this.createCard.bind(this),
      "create-card-from-project-item":
        this.createCardFromProjectItem.bind(this),
      "update-card": this.updateCard.bind(this),
      "delete-card": this.deleteCard.bind(this),
      "get-tags-by-card-id": this.getTagsByCardId.bind(this),
      "get-cards-group-by-tag": this.getCardsGroupByTag.bind(this),
      "get-all-cards": this.getAllCards.bind(this),
      "get-card-by-id": this.getCardById.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        links TEXT,
        content_id INTEGER,
        category TEXT DEFAULT 'permanent',
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    const stmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cards'",
    );
    const tableInfo = (stmt.get() as { sql: string }).sql;

    if (!tableInfo.includes("category")) {
      const alertStmt = db.prepare(
        "ALTER TABLE cards ADD COLUMN category TEXT DEFAULT 'permanent'",
      );
      alertStmt.run();
    }

    // 如果不包含content_id字段，则添加
    if (!tableInfo.includes("content_id")) {
      log.info("add content_id column to cards table");
      // 1. 添加content_id列
      const addColumnStmt = db.prepare(
        "ALTER TABLE cards ADD COLUMN content_id INTEGER",
      );
      addColumnStmt.run();

      // 2. 获取所有卡片
      const getAllCardsStmt = db.prepare("SELECT * FROM cards");
      const cards = getAllCardsStmt.all();

      // 3. 为每个卡片创建内容表记录，并关联
      for (const card of cards as any[]) {
        // 创建content记录
        const content = JSON.parse(card.content as string);
        const count = card.count || getContentLength(content);

        const contentId = ContentTable.createContent(db, {
          content: content,
          count: count,
        });

        // 更新卡片的content_id字段
        const updateCardStmt = db.prepare(
          "UPDATE cards SET content_id = ? WHERE id = ?",
        );
        updateCardStmt.run(contentId, card.id);
      }

      // 把 content 和 count 字段从 cards 表中移除
      const dropContentColumnStmt = db.prepare(
        "ALTER TABLE cards DROP COLUMN content",
      );
      dropContentColumnStmt.run();

      const dropCountColumnStmt = db.prepare(
        "ALTER TABLE cards DROP COLUMN count",
      );
      dropCountColumnStmt.run();
    }
  }

  static parseCard(card: any): ICard {
    let content = [];
    let count = 0;

    // 直接使用JOIN查询结果中的内容
    if (card.content) {
      try {
        content = JSON.parse(card.content);
        count = card.count || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    return {
      id: card.id,
      create_time: card.create_time,
      update_time: card.update_time,
      tags: JSON.parse(card.tags),
      links: JSON.parse(card.links),
      content: content,
      category: card.category,
      count: count,
      contentId: card.content_id,
    };
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, 
             ct.content, ct.count 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      ORDER BY c.create_time DESC
    `);
    const cards = stmt.all();
    return cards.map((card) => this.parseCard(card));
  }

  static getCardById(
    db: Database.Database,
    cardId: number | bigint,
  ): ICard | null {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, 
             ct.content, ct.count 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      WHERE c.id = ?
    `);
    const card = stmt.get(cardId);
    if (!card) {
      return null;
    }
    return this.parseCard(card);
  }

  static getCardByIds(db: Database.Database, cardIds: number[]): ICard[] {
    if (cardIds.length === 0) return [];

    const placeholders = cardIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, 
             ct.content, ct.count 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      WHERE c.id IN (${placeholders})
    `);
    const cards = stmt.all(cardIds);
    return cards.map((card) => this.parseCard(card));
  }

  static createCard(db: Database.Database, card: ICreateCard): ICard {
    const { tags, links, content, category, count } = card;

    // 创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content,
      count: count,
    });

    // 创建card记录
    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, category) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(tags),
      JSON.stringify(links),
      contentId,
      category,
    );
    const createdCardId = res.lastInsertRowid;
    Operation.insertOperation(db, "card", "insert", createdCardId, now);
    return this.getCardById(db, createdCardId) as ICard;
  }

  static createCardFromProjectItem(
    db: Database.Database,
    projectItemId: number,
  ): ICard {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
    const contentId = projectItem.contentId;

    ContentTable.incrementRefCount(db, contentId);

    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, category) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify([]),
      JSON.stringify([]),
      contentId,
      "permanent",
    );
    const createdCardId = res.lastInsertRowid;

    Operation.insertOperation(db, "card", "insert", createdCardId, now);
    return this.getCardById(db, createdCardId) as ICard;
  }

  static updateCard(
    db: Database.Database,
    card: IUpdateCard,
    ...res: any[]
  ): ICard {
    const win: BrowserWindow = res[res.length - 1];
    const { tags, links, content, category, id, count, contentId } = card;

    // 更新content记录
    if (contentId) {
      ContentTable.updateContent(db, contentId, {
        content: content,
        count: count,
      });
    } else {
      // 如果没有contentId，创建一个新的
      const newContentId = ContentTable.createContent(db, {
        content: content,
        count: count,
      });

      // 更新卡片的contentId
      const updateContentIdStmt = db.prepare(
        "UPDATE cards SET content_id = ? WHERE id = ?",
      );
      updateContentIdStmt.run(newContentId, id);
    }

    // 更新card记录
    const stmt = db.prepare(
      "UPDATE cards SET update_time = ?, tags = ?, links = ?, category = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), JSON.stringify(links), category, id);

    Operation.insertOperation(db, "card", "update", card.id, now);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("card:updated", {
          databaseName: basename(db.name),
          cardId: id,
        });
      }
    });

    return this.getCardById(db, id) as ICard;
  }

  static deleteCard(db: Database.Database, cardId: number): number {
    // 获取卡片信息，以获取contentId
    const cardInfo = this.getCardById(db, cardId);

    if (cardInfo && cardInfo.contentId) {
      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, cardInfo.contentId);
    }

    // 删除card记录
    const stmt = db.prepare("DELETE FROM cards WHERE id = ?");

    // 设置isCard为0
    const documentItemStmt = db.prepare(
      "UPDATE document_items SET is_card = 0 WHERE is_card = 1 AND card_id = ?",
    );
    documentItemStmt.run(cardId);

    // 设置project_item ref_type为空字符串
    const projectItemStmt = db.prepare(
      `UPDATE project_item SET ref_type = '' WHERE ref_type = 'card' AND ref_id = ?`,
    );
    projectItemStmt.run(cardId);

    // 删除全文搜索索引
    FTSTable.removeIndexByIdAndType(db, cardId, "card");
    // 删除向量文档索引
    VecDocumentTable.removeIndexByIdAndType(db, cardId, "card");

    Operation.insertOperation(db, "card", "delete", cardId, Date.now());

    return stmt.run(cardId).changes;
  }

  static getTagsByCardId(db: Database.Database, cardId: number): string[] {
    const stmt = db.prepare("SELECT tags FROM cards WHERE id = ?");
    const result = stmt.get(cardId) as { tags: string };
    let tags = [];
    try {
      tags = JSON.parse(result.tags);
    } catch (error) {
      console.error("Error parsing tags:", error);
    }
    return tags;
  }

  // 根据tag中的每个tag对卡片进行分组，忽略大小写，返回一个对象，tag为key，对应的卡片数组为value
  static getCardsGroupByTag(db: Database.Database) {
    const tagsGroupByTag: Record<string, ICard[]> = {};
    const cards = this.getAllCards(db);
    for (const card of cards) {
      for (const tag of card.tags) {
        const lowerCaseTag = tag.toLowerCase();
        if (!tagsGroupByTag[lowerCaseTag]) {
          tagsGroupByTag[lowerCaseTag] = [];
        }
        tagsGroupByTag[lowerCaseTag].push(card);
      }
    }

    return tagsGroupByTag;
  }
}
