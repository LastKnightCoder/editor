import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { getMarkdown } from "@/utils/markdown.ts";
import { ICreateCard, IUpdateCard, ICard } from "@/types";
import Operation from "./operation";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";

import type { CardDatabaseScope, CardMetadataPatch } from "@/types/card";
import { parseContentAiMeta } from "./content-ai-meta";

/** 列表预览块口径：渲染取前 3 块、标题/拖拽取 ≤200 字文本，块数封顶防无文本块失控 */
const CARD_PREVIEW_BLOCK_MIN = 3;
const CARD_PREVIEW_BLOCK_CAP = 12;
const CARD_PREVIEW_TEXT_TARGET = 200;

export default class CardTable {
  static getListenEvents() {
    return {
      "cards:get-scoped": this.getScopedCards.bind(this),
      "cards:get-scoped-card": this.getScopedCard.bind(this),
      "cards:create-scoped": this.createScopedCard.bind(this),
      "cards:patch-scoped": this.patchScopedCard.bind(this),
      "cards:remove-scoped": this.removeScopedCard.bind(this),
      "create-card": this.createCard.bind(this),
      "create-card-from-project-item": this.createCardFromProjectItem.bind(this),
      "update-card": this.updateCard.bind(this),
      "delete-card": this.deleteCard.bind(this),
      "get-tags-by-card-id": this.getTagsByCardId.bind(this),
      "get-cards-group-by-tag": this.getCardsGroupByTag.bind(this),
      "get-all-global-tags": this.getAllGlobalTags.bind(this),
      "get-all-cards": this.getAllCards.bind(this),
      "get-card-by-id": this.getCardById.bind(this),
      "is-content-is-card": this.isContentIsCard.bind(this),
      "get-card-by-content-id": this.getCardByContentId.bind(this),
      "build-card-from-content": this.buildCardFromContent.bind(this),
      "attach-podcast-to-card": this.attachPodcast.bind(this),
      "detach-podcast-from-card": this.detachPodcast.bind(this),
      "get-cards-by-dates": this.getCardsByDates.bind(this),
      "get-cards-by-date-range": this.getCardsByDateRange.bind(this),
      "get-cards-content-by-ids": this.getCardsContentByIds.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, scope: CardDatabaseScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, "")) {
      throw new Error("数据库已切换，请重新打开卡片");
    }
  }

  static getScopedCards(db: Database.Database, scope: CardDatabaseScope) {
    this.assertDatabase(db, scope);
    // 列表轻表：不 JOIN podcasts、content 截为预览块，全量数据经 getScopedCard 按需单卡获取
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      ORDER BY c.is_top DESC, c.create_time DESC
    `);
    return (stmt.all() as any[]).map(row => {
      const card = this.parseCard(row);
      card.content = this.selectListContent(card.content);
      return card;
    });
  }

  static getScopedCard(db: Database.Database, request: CardDatabaseScope & { id: number }) {
    this.assertDatabase(db, request);
    const card = this.getCardById(db, request.id);
    if (!card) throw new Error("卡片不存在");
    return card;
  }

  static createScopedCard(
    db: Database.Database,
    request: CardDatabaseScope & { card: ICreateCard }
  ) {
    this.assertDatabase(db, request);
    return this.createCard(db, request.card);
  }

  static patchScopedCard(
    db: Database.Database,
    request: CardDatabaseScope & { id: number; patch: CardMetadataPatch },
    ctx: CommandContext = fallbackCommandContext
  ) {
    this.assertDatabase(db, request);
    const card = this.getCardById(db, request.id);
    if (!card) throw new Error("卡片不存在");
    const { tags, isTop } = request.patch;
    return this.updateCard(
      db,
      {
        ...card,
        tags: tags ?? card.tags,
        isTop: isTop ?? card.isTop,
      },
      ctx
    );
  }

  static removeScopedCard(db: Database.Database, request: CardDatabaseScope & { id: number }) {
    this.assertDatabase(db, request);
    return this.deleteCard(db, request.id);
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
          scriptLines: card.podcast_script_lines ? JSON.parse(card.podcast_script_lines) : [],
          duration: card.podcast_duration || 0,
          speakers: card.podcast_speakers ? JSON.parse(card.podcast_speakers) : [],
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
      linkCount: Number(card.link_count ?? 0),
      content: content,
      count: count,
      contentId: card.content_id,
      isTop: !!card.is_top,
      podcastId: card.podcast_id || undefined,
      podcast,
      aiTitle: parseContentAiMeta(card.ai_meta)?.title || undefined,
    };
  }

  /** 取头部预览块：凑满最小块数后按累计文本长度截断（Slate 块递归取 text 叶子） */
  private static selectListContent(content: any[]): any[] {
    const preview: any[] = [];
    let chars = 0;
    for (const block of content) {
      preview.push(block);
      chars += this.blockTextLength(block);
      if (preview.length >= CARD_PREVIEW_BLOCK_CAP) break;
      if (preview.length >= CARD_PREVIEW_BLOCK_MIN && chars >= CARD_PREVIEW_TEXT_TARGET) break;
    }
    return preview;
  }

  private static blockTextLength(node: any): number {
    if (!node || typeof node !== "object") return 0;
    if (typeof node.text === "string") return node.text.length;
    const children = (node.children ?? []) as any[];
    return children.reduce((sum, child) => sum + this.blockTextLength(child), 0);
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      ORDER BY c.is_top DESC, c.create_time DESC
    `);
    const cards = stmt.all();
    return cards.map(card => this.parseCard(card));
  }

  static getCardById(db: Database.Database, cardId: number | bigint): ICard | null {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
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
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      WHERE c.id IN (${placeholders})
    `);
    const cards = stmt.all(cardIds);
    return cards.map(card => this.parseCard(card));
  }

  static createCard(db: Database.Database, card: ICreateCard): ICard {
    const { tags, content, count, isTop } = card;

    // 创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content,
      count: count,
    });

    // 创建card记录
    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, is_top) VALUES (?, ?, ?, '[]', ?, ?)"
    );
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), contentId, isTop ? 1 : 0);
    const createdCardId = res.lastInsertRowid;
    Operation.insertOperation(db, "card", "insert", createdCardId, now);

    return this.getCardById(db, createdCardId) as ICard;
  }

  static createCardFromProjectItem(db: Database.Database, projectItemId: number): ICard | null {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }
    const contentId = projectItem.contentId;

    ContentTable.incrementRefCount(db, contentId);

    const stmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, is_top) VALUES (?, ?, '[]', '[]', ?, ?)"
    );
    const now = Date.now();
    const res = stmt.run(now, now, contentId, 0);
    const createdCardId = res.lastInsertRowid;

    Operation.insertOperation(db, "card", "insert", createdCardId, now);
    return this.getCardById(db, createdCardId) as ICard;
  }

  static updateCard(
    db: Database.Database,
    card: IUpdateCard,
    ctx: CommandContext = fallbackCommandContext
  ): ICard {
    const { tags, id, isTop } = card;

    // 更新card记录（显式连接在 content_links，不经此路径）
    const stmt = db.prepare("UPDATE cards SET update_time = ?, tags = ?, is_top = ? WHERE id = ?");
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), isTop ? 1 : 0, id);

    Operation.insertOperation(db, "card", "update", card.id, now);

    ctx.broadcastOthers("card:updated", { databaseName: basename(db.name), cardId: id });

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

      // 设置project_item ref_type为空字符串
      const projectItemStmt = db.prepare(
        `UPDATE project_item SET ref_type = '' WHERE ref_type = 'card' AND ref_id = ?`
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
          tags.forEach(tag => {
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

  static isContentIsCard(db: Database.Database, contentId: number): boolean {
    const stmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const result = stmt.get(contentId);
    return !!result;
  }

  static getCardByContentId(db: Database.Database, contentId: number): ICard | null {
    const stmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const result = stmt.get(contentId) as { id: number } | undefined;
    if (!result) {
      return null;
    }
    return this.getCardById(db, result.id);
  }

  static buildCardFromContent(db: Database.Database, contentId: number): ICard {
    const existingStmt = db.prepare("SELECT id FROM cards WHERE content_id = ?");
    const existing = existingStmt.get(contentId) as { id: number } | undefined;
    if (existing) {
      return this.getCardById(db, existing.id) as ICard;
    }
    const insertStmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, links, content_id, is_top) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const res = insertStmt.run(now, now, JSON.stringify([]), JSON.stringify([]), contentId, 0);
    const cardId = res.lastInsertRowid;
    ContentTable.incrementRefCount(db, contentId);
    Operation.insertOperation(db, "card", "insert", cardId, now);
    return this.getCardById(db, cardId) as ICard;
  }

  static attachPodcast(db: Database.Database, cardId: number, podcastId: number): ICard | null {
    const stmt = db.prepare("UPDATE cards SET podcast_id = ?, update_time = ? WHERE id = ?");
    const now = Date.now();
    stmt.run(podcastId, now, cardId);
    Operation.insertOperation(db, "card", "update", cardId, now);
    return this.getCardById(db, cardId);
  }

  static detachPodcast(db: Database.Database, cardId: number): ICard | null {
    const stmt = db.prepare("UPDATE cards SET podcast_id = NULL, update_time = ? WHERE id = ?");
    const now = Date.now();
    stmt.run(now, cardId);
    Operation.insertOperation(db, "card", "update", cardId, now);
    return this.getCardById(db, cardId);
  }

  // 批量日期查询
  static getCardsByDates(db: Database.Database, dates: string[]): Record<string, ICard[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      WHERE date(c.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY c.update_time DESC
    `);

    const cards = stmt.all(...dates).map(card => this.parseCard(card));
    const result: Record<string, ICard[]> = {};

    cards.forEach(card => {
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
    endDate: string
  ): Record<string, ICard[]> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate + " 23:59:59").getTime();

    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top, c.podcast_id,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM cards c
      LEFT JOIN contents ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      LEFT JOIN podcasts p ON c.podcast_id = p.id
      WHERE c.update_time >= ? AND c.update_time <= ?
      ORDER BY c.update_time DESC
    `);

    const cards = stmt.all(startTimestamp, endTimestamp).map(card => this.parseCard(card));
    const result: Record<string, ICard[]> = {};

    cards.forEach(card => {
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
    maxLength?: number
  ): Array<{
    id: number;
    markdown: string;
    truncated: boolean;
    originalLength: number;
    metadata: Record<string, any>;
  }> {
    if (ids.length === 0) return [];

    const cards = this.getCardByIds(db, ids);

    return cards.map(card => {
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
          createTime: card.create_time,
          updateTime: card.update_time,
          wordCount: card.count,
        },
      };
    });
  }
}
