import Database from "better-sqlite3";
import { getContentLength } from "@/utils/helper.ts";
import { ICreateCard, IUpdateCard, ICard } from "@/types";
import Operation from "./operation";
import { BrowserWindow } from "electron";
import { basename } from "node:path";

export default class CardTable {
  static getListenEvents() {
    return {
      "create-card": this.createCard.bind(this),
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
        content TEXT,
        category TEXT DEFAULT 'permanent',
        count INTEGER DEFAULT 0
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
    if (!tableInfo.includes("count")) {
      const alertStmt = db.prepare(
        "ALTER TABLE cards ADD COLUMN count INTEGER DEFAULT 0",
      );
      alertStmt.run();
      // 更新所有卡片的 count
      const cards = this.getAllCards(db);
      for (const card of cards) {
        const contentLength = getContentLength(card.content);
        const stmt = db.prepare("UPDATE cards SET count = ? WHERE id = ?");
        stmt.run(contentLength, card.id);
      }
    }
  }

  static parseCard(card: any): ICard {
    return {
      id: card.id,
      create_time: card.create_time,
      update_time: card.update_time,
      tags: JSON.parse(card.tags),
      links: JSON.parse(card.links),
      content: JSON.parse(card.content),
      category: card.category,
      count: card.count,
    };
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare("SELECT * FROM cards ORDER BY create_time DESC");
    const cards = stmt.all();
    return cards.map((card) => this.parseCard(card));
  }

  static getCardById(db: Database.Database, cardId: number | bigint): ICard {
    const stmt = db.prepare("SELECT * FROM cards WHERE id = ?");
    return this.parseCard(stmt.get(cardId));
  }

  static getCardByIds(db: Database.Database, cardIds: number[]): ICard[] {
    const placeholders = cardIds.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM cards WHERE id IN (${placeholders})`,
    );
    const cards = stmt.all(cardIds);
    return cards.map((card) => this.parseCard(card));
  }

  static createCard(db: Database.Database, card: ICreateCard): ICard {
    const { tags, links, content, category, count } = card;

    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content, category, count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(tags),
      JSON.stringify(links),
      JSON.stringify(content),
      category,
      count,
    );
    const createdCardId = res.lastInsertRowid;
    Operation.insertOperation(db, "card", "insert", createdCardId, now);
    return this.getCardById(db, createdCardId);
  }

  static updateCard(
    db: Database.Database,
    card: IUpdateCard,
    ...res: any[]
  ): ICard {
    const win: BrowserWindow = res[res.length - 1];
    const { tags, links, content, category, id, count } = card;
    const stmt = db.prepare(
      "UPDATE cards SET update_time = ?, tags = ?, links = ?, content = ?, category = ?, count = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(tags),
      JSON.stringify(links),
      JSON.stringify(content),
      category,
      count,
      id,
    );

    // 如果有 document-item 是 isCard 并且 cardId 等于 id 的话，更新 document-item 的 content
    const updateDocumentItemStmt = db.prepare(
      "UPDATE document_items SET update_time = ?, content = ?, count = ? WHERE is_card = 1 AND card_id = ?",
    );
    updateDocumentItemStmt.run(now, JSON.stringify(content), count, id);

    // update project_item
    const updateProjectItemStmt = db.prepare(
      "UPDATE project_item SET update_time = ?, content = ?, count = ? WHERE ref_type = 'card' AND ref_id = ?",
    );
    updateProjectItemStmt.run(now, JSON.stringify(content), count, id);

    Operation.insertOperation(db, "card", "update", card.id, now);

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("card:updated", {
          databaseName: basename(db.name),
          cardId: id,
        });
      }
    });

    return this.getCardById(db, id);
  }

  static deleteCard(db: Database.Database, cardId: number): number {
    const stmt = db.prepare("DELETE FROM cards WHERE id = ?");
    // 设置 isCard 为 0
    const documentItemStmt = db.prepare(
      "UPDATE document_items SET is_card = 0 WHERE is_card = 1 AND card_id = ?",
    );
    documentItemStmt.run(cardId);

    // 设置 project_item ref_type 为 空字符串
    const projectItemStmt = db.prepare(
      `UPDATE project_item SET ref_type = '' WHERE ref_type = 'card' AND ref_id = ?`,
    );
    projectItemStmt.run(cardId);

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

  // 根据 tag 中的每个 tag 对卡片进行分组，忽略大小写，返回一个 对象，tag 为 key，对应的卡片数组为 value
  // 要查询所有的卡片才能获得 tags
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
