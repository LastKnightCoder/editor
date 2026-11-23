import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { asynchronousDatabaseCommand } from "../database-command";
import { getMarkdownText, mapContentSnapshots } from "../../services/content-conversion";
import { ICreateCard, IUpdateCard, ICard } from "@/types";
import type { Descendant } from "slate";
import Operation from "./operation";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";
import { CardContentOwnership } from "../content-ownership/card-content";

import type { CardDatabaseScope, CardMetadataPatch } from "@/types/card";
import { parseContentAiMeta } from "./content-ai-meta";
import {
  countTags,
  removeTagFromList,
  renameTagInList,
  sameTags,
  type TagCount,
} from "@/utils/tags";
import type { SqliteRow } from "../../types/table";

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
      "cards:tag-counts-scoped": this.getScopedTagCounts.bind(this),
      "cards:rename-tag-scoped": this.renameScopedTag.bind(this),
      "cards:remove-tag-scoped": this.removeScopedTag.bind(this),
      "create-card": this.createCard.bind(this),
      "create-card-from-project-item": this.createCardFromProjectItem.bind(this),
      "update-card": this.updateCard.bind(this),
      "delete-card": (db: Database.Database, cardId: number) => this.deleteCard(db, cardId),
      "get-tags-by-card-id": this.getTagsByCardId.bind(this),
      "get-cards-group-by-tag": this.getCardsGroupByTag.bind(this),
      "get-all-global-tags": this.getAllGlobalTags.bind(this),
      "get-all-cards": this.getAllCards.bind(this),
      "get-card-by-id": this.getCardById.bind(this),
      "is-content-is-card": this.isContentIsCard.bind(this),
      "get-card-by-content-id": this.getCardByContentId.bind(this),
      "build-card-from-content": (db: Database.Database, contentId: number) =>
        this.buildCardFromContent(db, contentId),
      "get-cards-by-dates": this.getCardsByDates.bind(this),
      "get-cards-by-date-range": this.getCardsByDateRange.bind(this),
      "get-cards-content-by-ids": asynchronousDatabaseCommand(this.getCardsContentByIds.bind(this)),
    };
  }

  private static assertDatabase(db: Database.Database, scope: CardDatabaseScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, "")) {
      throw new Error("数据库已切换，请重新打开卡片");
    }
  }

  static getScopedCards(db: Database.Database, scope: CardDatabaseScope) {
    this.assertDatabase(db, scope);
    // 列表轻表：content 截为预览块，全量数据经 getScopedCard 按需单卡获取
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      ORDER BY c.is_top DESC, c.create_time DESC
    `);
    return (stmt.all() as SqliteRow[]).map(row => {
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

  /** 标签选择器数据源：完整标签串的使用次数与最近使用时间 */
  static getScopedTagCounts(db: Database.Database, scope: CardDatabaseScope): TagCount[] {
    this.assertDatabase(db, scope);
    const rows = db.prepare("SELECT tags, update_time FROM cards").all() as {
      tags: string;
      update_time: number;
    }[];
    return countTags(rows.map(row => ({ tags: parseTagList(row.tags), usedAt: row.update_time })));
  }

  /** 标签改名（含子标签）；目标名已存在即合并。返回受影响的卡片 */
  static renameScopedTag(
    db: Database.Database,
    request: CardDatabaseScope & { from: string; to: string },
    ctx: CommandContext = fallbackCommandContext
  ): ICard[] {
    this.assertDatabase(db, request);
    const to = request.to.trim();
    if (!to) throw new Error("标签名不能为空");
    return this.rewriteTags(
      db,
      tags => renameTagInList(tags, request.from, to, { hierarchical: true }),
      ctx
    );
  }

  /** 从所有卡片上摘掉标签（含子标签），卡片本身不动。返回受影响的卡片 */
  static removeScopedTag(
    db: Database.Database,
    request: CardDatabaseScope & { tag: string },
    ctx: CommandContext = fallbackCommandContext
  ): ICard[] {
    this.assertDatabase(db, request);
    return this.rewriteTags(
      db,
      tags => removeTagFromList(tags, request.tag, { hierarchical: true }),
      ctx
    );
  }

  private static rewriteTags(
    db: Database.Database,
    rewrite: (tags: string[]) => string[],
    ctx: CommandContext
  ): ICard[] {
    const rows = db.prepare("SELECT id, tags FROM cards").all() as { id: number; tags: string }[];
    const update = db.prepare("UPDATE cards SET update_time = ?, tags = ? WHERE id = ?");
    const changedIds = db.transaction(() => {
      const now = Date.now();
      const ids: number[] = [];
      for (const row of rows) {
        const tags = parseTagList(row.tags);
        const next = rewrite(tags);
        if (sameTags(tags, next)) continue;
        update.run(now, JSON.stringify(next), row.id);
        Operation.insertOperation(db, "card", "update", row.id, now);
        ids.push(row.id);
      }
      return ids;
    })();
    // 本窗口由调用方用返回值并入缓存并发总线事件，这里只通知其他窗口
    for (const cardId of changedIds) {
      ctx.broadcastOthers("card:updated", { databaseName: basename(db.name), cardId });
    }
    return changedIds.map(id => this.getCardById(db, id) as ICard);
  }
  static parseCard(card: SqliteRow): ICard {
    let content = [];
    let count = 0;

    // 直接使用JOIN查询结果中的内容
    if (card.content) {
      try {
        content = JSON.parse(card.content as string);
        count = (card.count as number) || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    // 使用卡片和内容表中最大的更新时间
    const updateTime = card.content_update_time
      ? Math.max(card.update_time as number, card.content_update_time as number)
      : (card.update_time as number);

    return {
      id: card.id as number,
      create_time: card.create_time as number,
      update_time: updateTime,
      tags: JSON.parse(card.tags as string),
      linkCount: Number(card.link_count ?? 0),
      content: content,
      count: count,
      contentId: card.content_id as number,
      isTop: !!card.is_top,
      aiTitle: parseContentAiMeta(card.ai_meta as string | null)?.title || undefined,
    };
  }

  /** 取头部预览块：凑满最小块数后按累计文本长度截断（Slate 块递归取 text 叶子） */
  private static selectListContent(content: Descendant[]): Descendant[] {
    const preview: Descendant[] = [];
    let chars = 0;
    for (const block of content) {
      preview.push(block);
      chars += this.blockTextLength(block);
      if (preview.length >= CARD_PREVIEW_BLOCK_CAP) break;
      if (preview.length >= CARD_PREVIEW_BLOCK_MIN && chars >= CARD_PREVIEW_TEXT_TARGET) break;
    }
    return preview;
  }

  private static blockTextLength(node: unknown): number {
    if (!node || typeof node !== "object") return 0;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.length;
    const children = (record.children ?? []) as unknown[];
    return children.reduce((sum: number, child) => sum + this.blockTextLength(child), 0);
  }

  static getAllCards(db: Database.Database) {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      ORDER BY c.is_top DESC, c.create_time DESC
    `);
    const cards = stmt.all() as SqliteRow[];
    return cards.map(card => this.parseCard(card));
  }

  static getCardById(db: Database.Database, cardId: number | bigint): ICard | null {
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      WHERE c.id = ?
    `);
    const card = stmt.get(cardId) as SqliteRow | undefined;
    if (!card) {
      return null;
    }
    return this.parseCard(card);
  }

  static getCardByIds(db: Database.Database, cardIds: number[]): ICard[] {
    if (cardIds.length === 0) return [];

    const placeholders = cardIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      WHERE c.id IN (${placeholders})
    `);
    const cards = stmt.all(cardIds) as SqliteRow[];
    return cards.map(card => this.parseCard(card));
  }

  static createCard(db: Database.Database, card: ICreateCard): ICard {
    return ContentTable.createOwnedContent(
      db,
      { content: card.content, contracts: card.contracts },
      contentId => {
        const { id, createdAt } = this.insertCardRow(db, contentId, card.tags, card.isTop);
        return this.recordCreatedCard(db, id, createdAt);
      }
    );
  }

  static createCardFromProjectItem(db: Database.Database, projectItemId: number): ICard | null {
    return this.contentOwnership(db).createFromProjectItem(projectItemId);
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

  /** deferContent：正文只延迟释放（7 天宽限内可恢复），供插件的可恢复删除使用 */
  static deleteCard(
    db: Database.Database,
    cardId: number,
    options: { deferContent?: boolean } = {}
  ): number {
    return this.contentOwnership(db).deleteOwner(
      cardId,
      options.deferContent ? "deferred" : "immediate"
    );
  }

  private static removeCardRow(db: Database.Database, cardId: number): number {
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

  /** 用已有正文建卡片（共用同一份正文）；这份正文已经是卡片时返回那张卡片 */
  static buildCardFromContent(
    db: Database.Database,
    contentId: number,
    fields: CardMetadataPatch = {}
  ): ICard {
    return this.contentOwnership(db).buildFromExisting(contentId, fields);
  }

  private static contentOwnership(db: Database.Database): CardContentOwnership {
    return new CardContentOwnership({
      transaction: apply => db.transaction(apply)(),
      findOwnerForContent: contentId => this.getCardByContentId(db, contentId),
      readProjectItem: projectItemId => ProjectTable.getProjectItem(db, projectItemId),
      insertOwner: (contentId, fields) =>
        this.insertCardRow(db, contentId, fields.tags ?? [], fields.isTop),
      recordCreation: ({ id, createdAt }) => this.recordCreatedCard(db, id, createdAt),
      readOwner: cardId => this.getCardById(db, cardId),
      removeOwner: cardId => this.removeCardRow(db, cardId),
      addReference: contentId => ContentTable.incrementRefCount(db, contentId),
      releaseReference: (contentId, mode) => {
        if (mode === "deferred") ContentTable.releaseDeferred(db, contentId);
        else ContentTable.deleteContent(db, contentId);
      },
    });
  }

  private static insertCardRow(
    db: Database.Database,
    contentId: number,
    tags: string[],
    isTop?: boolean
  ) {
    const insertStmt = db.prepare(
      "INSERT INTO cards (create_time, update_time, tags, content_id, is_top) VALUES (?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const res = insertStmt.run(now, now, JSON.stringify(tags), contentId, isTop ? 1 : 0);
    return { id: res.lastInsertRowid, createdAt: now };
  }

  private static recordCreatedCard(db: Database.Database, id: number | bigint, createdAt: number) {
    Operation.insertOperation(db, "card", "insert", id, createdAt);
    return this.getCardById(db, id) as ICard;
  }

  // 批量日期查询
  static getCardsByDates(db: Database.Database, dates: string[]): Record<string, ICard[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      WHERE date(c.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY c.update_time DESC
    `);

    const cards = (stmt.all(...dates) as SqliteRow[]).map(card => this.parseCard(card));
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
      SELECT c.id, c.create_time, c.update_time, c.tags, c.content_id, c.is_top,
             (SELECT COUNT(*) FROM content_links cl WHERE cl.content_id = c.content_id OR cl.target_content_id = c.content_id) AS link_count,
             ct.content, ct.count, ct.update_time as content_update_time, m.meta AS ai_meta
      FROM cards c
      LEFT JOIN content_snapshots ct ON c.content_id = ct.id
      LEFT JOIN content_ai_meta m ON m.content_id = c.content_id
      WHERE c.update_time >= ? AND c.update_time <= ?
      ORDER BY c.update_time DESC
    `);

    const cards = (stmt.all(startTimestamp, endTimestamp) as SqliteRow[]).map(card =>
      this.parseCard(card)
    );
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
  static async getCardsContentByIds(
    db: Database.Database,
    ids: number[],
    maxLength?: number
  ): Promise<
    Array<{
      id: number;
      markdown: string;
      truncated: boolean;
      originalLength: number;
      metadata: Record<string, unknown>;
    }>
  > {
    if (ids.length === 0) return [];

    const cards = this.getCardByIds(db, ids);

    return mapContentSnapshots(cards, async card => {
      const snapshot = ContentTable.getContentById(db, card.contentId);
      const markdown = snapshot ? await getMarkdownText(snapshot.content, snapshot.contracts) : "";
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

function parseTagList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}
