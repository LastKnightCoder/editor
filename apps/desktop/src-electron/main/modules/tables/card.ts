import Database from "better-sqlite3";
import { getMarkdown } from "@/utils/markdown.ts";
import {
  ICreateCard,
  IUpdateCard,
  ICard,
  ECardCategory,
  WorkbenchExpiringCardsResponse,
} from "@/types";
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
      "get-all-global-tags": this.getAllGlobalTags.bind(this),
      "get-all-cards": this.getAllCards.bind(this),
      "get-card-by-id": this.getCardById.bind(this),
      "get-random-permanent-cards": this.getRandomPermanentCards.bind(this),
      "get-recent-temp-lit-cards":
        this.getRecentTemporaryAndLiteratureCards.bind(this),
      "is-content-is-card": this.isContentIsCard.bind(this),
      "get-card-by-content-id": this.getCardByContentId.bind(this),
      "build-card-from-content": this.buildCardFromContent.bind(this),
      "attach-podcast-to-card": this.attachPodcast.bind(this),
      "detach-podcast-from-card": this.detachPodcast.bind(this),
      "get-cards-by-dates": this.getCardsByDates.bind(this),
      "get-cards-by-date-range": this.getCardsByDateRange.bind(this),
      "get-cards-content-by-ids": this.getCardsContentByIds.bind(this),
      "workbench:list-expiring-temporary-cards":
        this.listExpiringTemporaryCards.bind(this),
    };
  }

  static upgradeTable(db: Database.Database) {
    // 检查 podcast_id 字段是否存在
    const tableInfo = db.prepare(`PRAGMA table_info(cards)`).all() as Array<{
      name: string;
    }>;
    const hasPodcastId = tableInfo.some(
      (column) => column.name === "podcast_id",
    );

    if (!hasPodcastId) {
      db.exec(`ALTER TABLE cards ADD COLUMN podcast_id INTEGER DEFAULT NULL;`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_cards_podcast_id ON cards(podcast_id);`,
      );
      log.info("已添加 podcast_id 字段到 cards 表");
    }

    // 清理过期临时卡片
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

    // 解析 podcast 数据
    let podcast = undefined;
    if (card.podcast_id && card.podcast_audio_url) {
      try {
        podcast = {
          id: card.podcast_id,
          name: card.podcast_name || undefined,
          audioUrl: card.podcast_audio_url,
          script: card.podcast_script || "",
          scriptLines: card.podcast_script_lines
            ? JSON.parse(card.podcast_script_lines)
            : [],
          duration: card.podcast_duration || 0,
          speakers: card.podcast_speakers
            ? JSON.parse(card.podcast_speakers)
            : [],
        };
      } catch (error) {
        console.error("Error parsing podcast data:", error);
      }
    }

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
      podcastId: card.podcast_id || undefined,
      podcast,
    };
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
             ct.content, ct.count, ct.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
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
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
             ct.content, ct.count, ct.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
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
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
             ct.content, ct.count, ct.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
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

  // 获取所有卡片的唯一标签列表
  static getAllGlobalTags(db: Database.Database): string[] {
    const stmt = db.prepare("SELECT tags FROM cards");
    const rows = stmt.all() as Array<{ tags: string }>;

    const tagSet = new Set<string>();
    for (const row of rows) {
      try {
        const tags = JSON.parse(row.tags) as string[];
        if (Array.isArray(tags)) {
          tags.forEach((tag) => {
            if (tag && typeof tag === "string") {
              tagSet.add(tag);
            }
          });
        }
      } catch {
        // 跳过无效的 JSON
      }
    }

    return Array.from(tagSet).sort();
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

  static listExpiringTemporaryCards(
    db: Database.Database,
    payload: { limit?: number; cursor?: number | null } = {},
  ): WorkbenchExpiringCardsResponse {
    const limit = Math.min(Math.max(payload.limit ?? 10, 1), 50);
    const offset = Math.max(payload.cursor ?? 0, 0);
    const now = Date.now();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) as total
         FROM cards c
         LEFT JOIN contents ct ON c.content_id = ct.id
         WHERE c.category = 'temporary' AND ct.content IS NOT NULL`,
      )
      .get() as { total: number };

    const rows = db
      .prepare(
        `SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
                ct.content, ct.count, ct.update_time as content_update_time,
                p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
         FROM cards c
         LEFT JOIN contents ct ON c.content_id = ct.id
         LEFT JOIN podcasts p ON c.podcast_id = p.id
         WHERE c.category = 'temporary'
           AND ct.content IS NOT NULL
         ORDER BY MAX(c.update_time, COALESCE(ct.update_time, c.update_time)) ASC, c.id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(limit + 1, offset) as any[];

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => {
      const card = this.parseCard(row);
      const expiresAt = card.update_time + oneMonth;
      return {
        card,
        expiresAt,
        remainingMs: expiresAt - now,
      };
    });

    return {
      items,
      nextCursor: rows.length > limit ? offset + limit : null,
      total: Number(totalRow.total || 0),
    };
  }

  static isContentIsCard(db: Database.Database, contentId: number): boolean {
    const stmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const result = stmt.get(contentId);
    return !!result;
  }

  static getCardByContentId(
    db: Database.Database,
    contentId: number,
  ): ICard | null {
    const stmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const result = stmt.get(contentId) as { id: number } | undefined;
    if (!result) {
      return null;
    }
    return this.getCardById(db, result.id);
  }

  static buildCardFromContent(db: Database.Database, contentId: number): ICard {
    const existingStmt = db.prepare(
      "SELECT id FROM cards WHERE content_id = ?",
    );
    const existing = existingStmt.get(contentId) as { id: number } | undefined;
    if (existing) {
      return this.getCardById(db, existing.id) as ICard;
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

  static attachPodcast(
    db: Database.Database,
    cardId: number,
    podcastId: number,
  ): ICard | null {
    const stmt = db.prepare(
      "UPDATE cards SET podcast_id = ?, update_time = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(podcastId, now, cardId);
    Operation.insertOperation(db, "card", "update", cardId, now);
    return this.getCardById(db, cardId);
  }

  static detachPodcast(db: Database.Database, cardId: number): ICard | null {
    const stmt = db.prepare(
      "UPDATE cards SET podcast_id = NULL, update_time = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(now, cardId);
    Operation.insertOperation(db, "card", "update", cardId, now);
    return this.getCardById(db, cardId);
  }

  // 批量日期查询
  static getCardsByDates(
    db: Database.Database,
    dates: string[],
  ): Record<string, ICard[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
             ct.content, ct.count, ct.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      WHERE date(c.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY c.update_time DESC
    `);

    const cards = stmt.all(...dates).map((card) => this.parseCard(card));
    const result: Record<string, ICard[]> = {};

    cards.forEach((card) => {
      const date = new Date(card.update_time).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(card);
    });

    return result;
  }

  // 日期范围查询
  static getCardsByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
  ): Record<string, ICard[]> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate + " 23:59:59").getTime();

    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.links, c.category, c.content_id, c.is_top, c.podcast_id,
             ct.content, ct.count, ct.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      WHERE c.update_time >= ? AND c.update_time <= ?
      ORDER BY c.update_time DESC
    `);

    const cards = stmt
      .all(startTimestamp, endTimestamp)
      .map((card) => this.parseCard(card));
    const result: Record<string, ICard[]> = {};

    cards.forEach((card) => {
      const date = new Date(card.update_time).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(card);
    });

    return result;
  }

  // 根据 IDs 获取卡片内容（转换为 Markdown）
  static getCardsContentByIds(
    db: Database.Database,
    ids: number[],
    maxLength?: number,
  ): Array<{
    id: number;
    markdown: string;
    truncated: boolean;
    originalLength: number;
    metadata: Record<string, any>;
  }> {
    if (ids.length === 0) return [];

    const cards = this.getCardByIds(db, ids);

    return cards.map((card) => {
      const markdown = card.content ? getMarkdown(card.content) : "";
      const originalLength = markdown.length;

      let finalMarkdown = markdown;
      let truncated = false;

      if (maxLength && markdown.length > maxLength) {
        // 在合理的位置截断
        let truncatedMd = markdown.substring(0, maxLength);
        const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
        let bestBreak = -1;

        for (const bp of breakPoints) {
          const idx = truncatedMd.lastIndexOf(bp);
          if (idx > maxLength * 0.8) {
            bestBreak = idx + bp.length;
            break;
          }
        }

        if (bestBreak > 0) {
          truncatedMd = truncatedMd.substring(0, bestBreak);
        }

        finalMarkdown = truncatedMd + "\n\n[内容已截断...]";
        truncated = true;
      }

      return {
        id: card.id,
        markdown: finalMarkdown,
        truncated,
        originalLength,
        metadata: {
          tags: card.tags,
          category: card.category,
          createTime: card.create_time,
          updateTime: card.update_time,
          wordCount: card.count,
        },
      };
    });
  }
}
