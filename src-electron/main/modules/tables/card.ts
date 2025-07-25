import Database from "better-sqlite3";
import { getMarkdown } from "@/utils/markdown.ts";
import { ICreateCard, IUpdateCard, ICard, ECardCategory } from "@/types";
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
      "get-random-permanent-cards": this.getRandomPermanentCards.bind(this),
      "get-recent-temp-lit-cards":
        this.getRecentTemporaryAndLiteratureCards.bind(this),
      "is-content-is-card": this.isContentIsCard.bind(this),
      "build-card-from-content": this.buildCardFromContent.bind(this),
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
        is_top INTEGER DEFAULT 0,
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    // 为所有卡片添加 FTS 索引
    log.info("开始为所有卡片添加 FTS 索引");
    const cards = this.getAllCards(db);
    const now = Date.now();
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    for (const card of cards) {
      if (!card.content || !card.content.length) continue;

      // 检查并删除过期的临时卡片
      if (
        card.category === ECardCategory.Temporary &&
        now - card.update_time > ONE_MONTH
      ) {
        log.info(`删除过期临时卡片: ${card.id}`);
        this.deleteCard(db, card.id);
      }

      // 检查是否已有索引或索引是否过期
      const indexInfo = FTSTable.checkIndexExists(db, card.id, "card");

      // 如果索引不存在或已过期，则添加/更新索引
      if (!indexInfo || indexInfo.updateTime < card.update_time) {
        FTSTable.indexContent(db, {
          id: card.id,
          content: getMarkdown(card.content),
          type: "card",
          updateTime: card.update_time,
        });
        log.info(`已为卡片 ${card.id} 添加/更新 FTS 索引`);
      }
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

    // 使用卡片和内容表中最大的更新时间
    const updateTime = card.content_update_time
      ? Math.max(card.update_time, card.content_update_time)
      : card.update_time;

    return {
      id: card.id,
      create_time: card.create_time,
      update_time: updateTime,
      tags: JSON.parse(card.tags),
      links: JSON.parse(card.links),
      content: content,
      category: card.category,
      count: count,
      contentId: card.content_id,
      isTop: !!card.is_top,
    };
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top,
             ct.content, ct.count, ct.update_time as content_update_time 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      ORDER BY c.is_top DESC, c.create_time DESC
    `);
    const cards = stmt.all();
    return cards.map((card) => this.parseCard(card));
  }

  static getCardById(
    db: Database.Database,
    cardId: number | bigint,
  ): ICard | null {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top,
             ct.content, ct.count, ct.update_time as content_update_time 
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
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top,
             ct.content, ct.count, ct.update_time as content_update_time 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      WHERE c.id IN (${placeholders})
    `);
    const cards = stmt.all(cardIds);
    return cards.map((card) => this.parseCard(card));
  }

  static createCard(db: Database.Database, card: ICreateCard): ICard {
    const { tags, links, content, category, count, isTop } = card;

    // 创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content,
      count: count,
    });

    // 创建card记录
    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, category, is_top) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(tags),
      JSON.stringify(links),
      contentId,
      category,
      isTop ? 1 : 0,
    );
    const createdCardId = res.lastInsertRowid;
    Operation.insertOperation(db, "card", "insert", createdCardId, now);

    return this.getCardById(db, createdCardId) as ICard;
  }

  static createCardFromProjectItem(
    db: Database.Database,
    projectItemId: number,
  ): ICard | null {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }
    const contentId = projectItem.contentId;

    ContentTable.incrementRefCount(db, contentId);

    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, category, is_top) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify([]),
      JSON.stringify([]),
      contentId,
      "permanent",
      0,
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
    const { tags, links, category, id, isTop } = card;

    // 更新card记录
    const stmt = db.prepare(
      "UPDATE cards SET update_time = ?, tags = ?, links = ?, category = ?, is_top = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(tags),
      JSON.stringify(links),
      category,
      isTop ? 1 : 0,
      id,
    );

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

    // 删除card记录
    const stmt = db.prepare("DELETE FROM cards WHERE id = ?");
    const changes = stmt.run(cardId).changes;

    if (changes > 0) {
      FTSTable.removeIndexByIdAndType(db, cardId, "card");
      VecDocumentTable.removeIndexByIdAndType(db, cardId, "card");
      Operation.insertOperation(db, "card", "delete", cardId, Date.now());

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

      if (cardInfo && cardInfo.contentId) {
        // 删除关联的content记录（减少引用计数）
        ContentTable.deleteContent(db, cardInfo.contentId);
      }
    }

    return changes;
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

  static getRandomPermanentCards(
    db: Database.Database,
    { seed = Date.now(), count = 5 }: { seed: number; count: number },
  ): ICard[] {
    // 获取所有永久卡片
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top,
             ct.content, ct.count, ct.update_time as content_update_time 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      WHERE c.category = 'permanent' AND ct.content IS NOT NULL
    `);

    const allPermanentCards = stmt.all().map((card) => this.parseCard(card));

    if (allPermanentCards.length === 0) {
      return [];
    }

    // 使用种子生成伪随机数，种子不变，随机数也不变
    const random = (max: number, index: number) => {
      const random = Math.abs(Math.sin(seed + index));
      return Math.floor(random * max);
    };

    // 随机选择卡片
    const result: ICard[] = [];
    const selectedIndices = new Set<number>();

    // 如果卡片数量不足，则返回所有卡片
    const targetCount = Math.min(count, allPermanentCards.length);

    let index = 0;
    while (result.length < targetCount) {
      const randomIndex = random(allPermanentCards.length, index);
      if (!selectedIndices.has(randomIndex)) {
        selectedIndices.add(randomIndex);
        result.push(allPermanentCards[randomIndex]);
      }
      index++;
    }

    return result;
  }

  static getRecentTemporaryAndLiteratureCards(
    db: Database.Database,
    count = 10,
  ): ICard[] {
    // 获取最新的闪念笔记和文献笔记
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top,
             ct.content, ct.count, ct.update_time as content_update_time 
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      WHERE (c.category = 'temporary' OR c.category = 'literature') AND ct.content IS NOT NULL
      ORDER BY c.update_time ASC
      LIMIT ?
    `);

    const cards = stmt.all(count);
    return cards.map((card) => this.parseCard(card));
  }

  static isContentIsCard(db: Database.Database, contentId: number): boolean {
    const stmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const result = stmt.get(contentId);
    return !!result;
  }

  static buildCardFromContent(db: Database.Database, contentId: number): ICard {
    const isContentIsCard = this.isContentIsCard(db, contentId);
    if (isContentIsCard) {
      return this.getCardById(db, contentId) as ICard;
    }
    const insertStmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, category, is_top) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = insertStmt.run(
      now,
      now,
      JSON.stringify([]),
      JSON.stringify([]),
      contentId,
      "permanent",
      0,
    );
    const cardId = res.lastInsertRowid;
    ContentTable.incrementRefCount(db, contentId);
    Operation.insertOperation(db, "card", "insert", cardId, now);
    return this.getCardById(db, cardId) as ICard;
  }
}
