/**
 * 随机漫步（random-walk）：从既有内容里随机抽一条重温（非闪卡、无评分）。
 * 抽样池五种实体：卡片 / 文章 / 项目文档 / 日记碎碎念 / PDF 批注；
 * 候选只做轻量 SQL 取骨架，加权抽样在 random-walk-sampling 纯函数里完成，
 * 仅对选中项回查完整正文。walk_visits 与 walk_daily_decks 不做级联，
 * 读取时过滤失效实体即可。
 */

import Database from "better-sqlite3";
import dayjs from "dayjs";
import type {
  RandomWalkDailyAdvanceParams,
  RandomWalkDailyDeckParams,
  RandomWalkPickParams,
  RandomWalkSameTagParams,
  WalkBias,
  WalkDailyDeck,
  WalkItem,
  WalkNeighbor,
  WalkRef,
  WalkRefKind,
} from "@/types";
import { normalizeDiaryDay } from "@/utils/diary-day";
import { pdfAnnotationNote, pdfAnnotationQuote } from "@/entity/pdf-annotation-text";
import { contentBlockLines } from "@/entity/text-digest";
import {
  pickWalk,
  sampleWalk,
  walkStaleDays,
  type WalkCandidate,
  type WalkSample,
} from "../random-walk-sampling";
import { contentTitles } from "./content-ai-meta";
import ContentTable from "./content";

/** 牌堆张数；池不足时有多少取多少 */
const DECK_SIZE = 5;
/** 碎片下限：正文不足该字数的不进池 */
const MIN_WORDS = 30;
const TITLE_CHARS = 80;
/** same-tag 默认条数与上限 */
const SAME_TAG_DEFAULT_LIMIT = 3;
const SAME_TAG_MAX_LIMIT = 10;

const WALK_KINDS = new Set<string>([
  "card",
  "article",
  "project-item",
  "diary-moment",
  "pdf-annotation",
]);

const walkRefKey = (ref: { kind: string; id: number }) => `${ref.kind}:${ref.id}`;

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_CHARS ? `${flat.slice(0, TITLE_CHARS)}…` : flat;
};

const parseTags = (raw: unknown): string[] => {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
};

/** project_item.projects 是 id 数组（数字），取第一个 */
const parseFirstId = (raw: unknown): number | null => {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const id = Number(value[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function parseWalkRef(raw: unknown): WalkRef {
  const input = raw as Partial<WalkRef> | null;
  const kind = typeof input?.kind === "string" && WALK_KINDS.has(input.kind) ? input.kind : null;
  const id = Number(input?.id);
  if (!kind || !Number.isSafeInteger(id) || id <= 0) throw new Error("漫步实体地址无效");
  return { kind: kind as WalkRef["kind"], id };
}

function parseBias(raw: unknown): WalkBias | null {
  return raw === "random" || raw === "stale" || raw === "on-this-day" ? (raw as WalkBias) : null;
}

/** 抽样类型过滤：缺省 / 空数组 / 全部非法 = 不过滤 */
function parseKinds(raw: unknown): WalkRefKind[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (kind): kind is WalkRefKind => typeof kind === "string" && WALK_KINDS.has(kind)
  );
}

function parseDate(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

interface CandidateRow {
  kind: WalkRef["kind"];
  id: number;
  create_time: number;
  update_time: number;
  day: string | null;
  day_created: number;
  last_seen_time: number | null;
  quote_len?: number;
  notes?: string | null;
  /** 实体标签（PDF 批注为所属 pdfs.tags）；JSON 数组字符串或 null */
  tags: string | null;
}

export default class RandomWalkTable {
  static getListenEvents() {
    return {
      "random-walk:pick": this.pick.bind(this),
      "random-walk:get": this.get.bind(this),
      "random-walk:same-tag": this.sameTag.bind(this),
      "random-walk:mark-seen": this.markSeen.bind(this),
      "random-walk:mute": this.mute.bind(this),
      "random-walk:daily-deck": this.dailyDeck.bind(this),
      "random-walk:daily-advance": this.dailyAdvance.bind(this),
      "random-walk:daily-reroll": this.dailyReroll.bind(this),
    } as const;
  }

  /** 抽一条；池为空返回 null */
  static pick(db: Database.Database, rawParams: unknown): WalkItem | null {
    const params = rawParams as Partial<RandomWalkPickParams> | null;
    const bias = parseBias(params?.bias);
    if (!bias) throw new Error("漫步偏好无效");
    const exclude = (params?.exclude ?? []).map(parseWalkRef);
    const kinds = parseKinds(params?.kinds);
    const now = Date.now();
    const candidates = this.loadCandidates(db, kinds);
    // 并发删除会让选中项解析失败：排除后继续抽，直到成功或池尽
    const tried: WalkRef[] = [];
    for (;;) {
      const sample = pickWalk(candidates, {
        bias,
        now,
        today: dayjs(now).format("YYYY-MM-DD"),
        exclude: [...exclude, ...tried],
      });
      if (!sample) return null;
      const item = this.resolveItem(db, sample);
      if (item) return item;
      tried.push(sample.candidate);
    }
  }

  /** 取一条实体的完整漫步内容：不在池口径（已删 / muted / 碎片）返回 null，reason 按 stale 口径 */
  static get(db: Database.Database, rawRef: unknown): WalkItem | null {
    const ref = parseWalkRef(rawRef);
    const row = this.liveCandidateRows(db).find(row => row.kind === ref.kind && row.id === ref.id);
    if (!row) return null;
    const candidate = this.toCandidate(row);
    return this.resolveItem(db, {
      candidate,
      reason: { type: "stale", days: Math.floor(walkStaleDays(candidate, Date.now())) },
    });
  }

  /** 岔路·同标签：与 tags 有交集的其它池内实体，按交集标签数、stale 天数降序取 limit 条 */
  static sameTag(db: Database.Database, rawParams: unknown): WalkNeighbor[] {
    const params = rawParams as Partial<RandomWalkSameTagParams> | null;
    const rawTags = params?.tags;
    const tags = Array.isArray(rawTags)
      ? rawTags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
      : [];
    if (tags.length === 0) return [];
    const excluded = new Set(
      [parseWalkRef(params?.ref), ...(params?.exclude ?? []).map(parseWalkRef)].map(walkRefKey)
    );
    let limit = Number(params?.limit ?? SAME_TAG_DEFAULT_LIMIT);
    if (!Number.isSafeInteger(limit) || limit < 1) limit = SAME_TAG_DEFAULT_LIMIT;
    limit = Math.min(limit, SAME_TAG_MAX_LIMIT);

    const tagSet = new Set(tags);
    const now = Date.now();
    const matches = this.liveCandidateRows(db)
      .filter(row => !excluded.has(walkRefKey(row)))
      .map(row => ({ row, shared: parseTags(row.tags).filter(tag => tagSet.has(tag)) }))
      .filter(({ shared }) => shared.length > 0)
      .sort(
        (a, b) =>
          b.shared.length - a.shared.length ||
          walkStaleDays(this.toCandidate(b.row), now) - walkStaleDays(this.toCandidate(a.row), now)
      );

    return matches.slice(0, limit).flatMap(({ row, shared }) => {
      // 并发删除：标题解析失败即跳过该条
      const title = this.resolveTitle(db, row);
      return title == null
        ? []
        : [
            {
              ref: { kind: row.kind, id: row.id },
              title,
              relation: "tag" as const,
              sharedTag: shared[0],
            },
          ];
    });
  }

  /** 漫步到过：upsert 上次时间与次数 */
  static markSeen(db: Database.Database, rawRef: unknown): void {
    const ref = parseWalkRef(rawRef);
    const now = Date.now();
    db.prepare(
      `INSERT INTO walk_visits (kind, entity_id, last_seen_time, seen_count, muted, create_time, update_time)
       VALUES (?, ?, ?, 1, 0, ?, ?)
       ON CONFLICT(kind, entity_id) DO UPDATE SET
         last_seen_time = excluded.last_seen_time,
         seen_count = seen_count + 1,
         update_time = excluded.update_time`
    ).run(ref.kind, ref.id, now, now, now);
  }

  /** 屏蔽：不再进漫步池 */
  static mute(db: Database.Database, rawRef: unknown): void {
    const ref = parseWalkRef(rawRef);
    const now = Date.now();
    db.prepare(
      `INSERT INTO walk_visits (kind, entity_id, last_seen_time, seen_count, muted, create_time, update_time)
       VALUES (?, ?, ?, 0, 1, ?, ?)
       ON CONFLICT(kind, entity_id) DO UPDATE SET muted = 1, update_time = excluded.update_time`
    ).run(ref.kind, ref.id, 0, now, now);
  }

  /** 当天牌堆：已有则原样返回（过滤失效实体），否则用 stale 偏好抽一叠落库 */
  static dailyDeck(db: Database.Database, rawParams: unknown): WalkDailyDeck {
    const date = parseDate((rawParams as Partial<RandomWalkDailyDeckParams> | null)?.date);
    if (!date) throw new Error("漫步日期无效");
    const row = db
      .prepare(`SELECT items, cursor FROM walk_daily_decks WHERE date = ?`)
      .get(date) as { items: string; cursor: number } | undefined;
    if (row) {
      const items = this.parseDeckItems(db, row.items);
      return { date, items, cursor: Math.min(row.cursor, items.length) };
    }
    const deck = this.buildDeck(db, date, []);
    db.prepare(
      `INSERT INTO walk_daily_decks (date, items, cursor, create_time, update_time)
       VALUES (?, ?, 0, ?, ?)`
    ).run(date, JSON.stringify(deck.items), Date.now(), Date.now());
    return deck;
  }

  static dailyAdvance(db: Database.Database, rawParams: unknown): void {
    const params = rawParams as Partial<RandomWalkDailyAdvanceParams> | null;
    const date = parseDate(params?.date);
    const cursor = Number(params?.cursor);
    if (!date || !Number.isSafeInteger(cursor) || cursor < 0) throw new Error("漫步游标无效");
    db.prepare(`UPDATE walk_daily_decks SET cursor = ?, update_time = ? WHERE date = ?`).run(
      cursor,
      Date.now(),
      date
    );
  }

  /** 重新抽一叠：排除当天已出现过的，游标归零 */
  static dailyReroll(db: Database.Database, rawParams: unknown): WalkDailyDeck {
    const date = parseDate((rawParams as Partial<RandomWalkDailyDeckParams> | null)?.date);
    if (!date) throw new Error("漫步日期无效");
    const previous = db.prepare(`SELECT items FROM walk_daily_decks WHERE date = ?`).get(date) as
      { items: string } | undefined;
    const previousRefs = previous
      ? this.parseDeckItems(db, previous.items).map(item => item.ref)
      : [];
    const deck = this.buildDeck(db, date, previousRefs);
    db.prepare(
      `INSERT INTO walk_daily_decks (date, items, cursor, create_time, update_time)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(date) DO UPDATE SET items = excluded.items, cursor = 0, update_time = excluded.update_time`
    ).run(date, JSON.stringify(deck.items), Date.now(), Date.now());
    return deck;
  }

  /** 候选骨架 SQL 的统一口径（抽样与 same-tag 共用，改口径只改这里）；
   *  五种实体各一段，tags 供同标签岔路用 */
  private static candidateRows(db: Database.Database): CandidateRow[] {
    return db
      .prepare(
        `SELECT 'card' AS kind, c.id AS id, c.create_time AS create_time, c.update_time AS update_time,
                CAST(NULL AS TEXT) AS day, 0 AS day_created, v.last_seen_time AS last_seen_time,
                CAST(NULL AS INTEGER) AS quote_len, CAST(NULL AS TEXT) AS notes, c.tags AS tags
         FROM cards c JOIN contents ct ON ct.id = c.content_id
         LEFT JOIN walk_visits v ON v.kind = 'card' AND v.entity_id = c.id
         WHERE IFNULL(ct.count, 0) >= ${MIN_WORDS} AND IFNULL(v.muted, 0) = 0
         UNION ALL
         SELECT 'article', a.id, a.create_time, a.update_time, CAST(NULL AS TEXT), 0, v.last_seen_time,
                CAST(NULL AS INTEGER), CAST(NULL AS TEXT), a.tags
         FROM articles a JOIN contents ct ON ct.id = a.content_id
         LEFT JOIN walk_visits v ON v.kind = 'article' AND v.entity_id = a.id
         WHERE a.is_delete = 0 AND IFNULL(ct.count, 0) >= ${MIN_WORDS} AND IFNULL(v.muted, 0) = 0
         UNION ALL
         SELECT 'project-item', p.id, p.create_time, p.update_time, CAST(NULL AS TEXT), 0, v.last_seen_time,
                CAST(NULL AS INTEGER), CAST(NULL AS TEXT), p.tags
         FROM project_item p JOIN contents ct ON ct.id = p.content_id
         LEFT JOIN walk_visits v ON v.kind = 'project-item' AND v.entity_id = p.id
         WHERE p.project_item_type = 'document' AND IFNULL(ct.count, 0) >= ${MIN_WORDS}
           AND IFNULL(v.muted, 0) = 0
         UNION ALL
         SELECT 'diary-moment', s.id, s.create_time, s.update_time, d.date, d.create_time, v.last_seen_time,
                CAST(NULL AS INTEGER), CAST(NULL AS TEXT), s.tags
         FROM diary_segments s
         JOIN contents ct ON ct.id = s.content_id
         JOIN diary_entries d ON d.id = s.diary_id
         LEFT JOIN walk_visits v ON v.kind = 'diary-moment' AND v.entity_id = s.id
         WHERE IFNULL(ct.count, 0) >= ${MIN_WORDS} AND IFNULL(v.muted, 0) = 0
         UNION ALL
         SELECT 'pdf-annotation', a.id, a.create_time, a.update_time, CAST(NULL AS TEXT), 0, v.last_seen_time,
                CASE WHEN json_valid(a.annotation_payload)
                  THEN LENGTH(COALESCE(json_extract(a.annotation_payload, '$.custom.text'),
                                       json_extract(a.annotation_payload, '$.contents'), ''))
                  ELSE 0 END,
                a.notes, p.tags
         FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id
         LEFT JOIN walk_visits v ON v.kind = 'pdf-annotation' AND v.entity_id = a.id
         WHERE IFNULL(v.muted, 0) = 0`
      )
      .all() as CandidateRow[];
  }

  /** 池内有效候选：PDF 批注的字数下限在 SQL 里算不了，JS 里补 */
  private static liveCandidateRows(db: Database.Database): CandidateRow[] {
    return this.candidateRows(db).filter(
      row =>
        row.kind !== "pdf-annotation" ||
        (row.quote_len ?? 0) + pdfAnnotationNote(row.notes ?? null).length >= MIN_WORDS
    );
  }

  private static toCandidate(row: CandidateRow): WalkCandidate {
    return {
      kind: row.kind,
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      lastSeenTime: row.last_seen_time ?? null,
      dateKey:
        row.kind === "diary-moment" && row.day
          ? normalizeDiaryDay(row.day, row.day_created)
          : dayjs(row.create_time).format("YYYY-MM-DD"),
    };
  }

  private static loadCandidates(db: Database.Database, kinds: WalkRefKind[]): WalkCandidate[] {
    const allow = kinds.length > 0 ? new Set<string>(kinds) : null;
    return this.liveCandidateRows(db)
      .filter(row => !allow || allow.has(row.kind))
      .map(row => this.toCandidate(row));
  }

  /** 当天牌堆：那年今日优先占首位，其余 stale 偏好补足 */
  private static buildDeck(db: Database.Database, date: string, exclude: WalkRef[]): WalkDailyDeck {
    const now = Date.now();
    const candidates = this.loadCandidates(db, []);
    const today = sampleWalk(candidates, 1, { bias: "on-this-day", now, today: date, exclude });
    const rest = sampleWalk(candidates, today.length ? DECK_SIZE - 1 : DECK_SIZE, {
      bias: "stale",
      now,
      today: date,
      exclude: [...exclude, ...today.map(sample => sample.candidate)],
    });
    const items = [...today, ...rest]
      .map(sample => this.resolveItem(db, sample))
      .filter((item): item is WalkItem => item !== null);
    return { date, items, cursor: 0 };
  }

  /** 牌堆存档解析：标题按当前数据重算（改名、标题口径变化都跟上），失效实体直接跳过 */
  private static parseDeckItems(db: Database.Database, itemsJson: string): WalkItem[] {
    let raw: unknown;
    try {
      raw = JSON.parse(itemsJson);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    return raw.flatMap(entry => {
      const item = entry as WalkItem | null;
      if (!item?.ref) return [];
      const title = this.resolveTitle(db, item.ref);
      return title === null ? [] : [{ ...item, title }];
    });
  }

  /** 只算标题的轻量解析（same-tag 邻居与选中项共用，不回查完整数据）；实体失效返回 null */
  private static resolveTitle(db: Database.Database, ref: WalkRef): string | null {
    switch (ref.kind) {
      case "card": {
        const row = db.prepare(`SELECT content_id FROM cards WHERE id = ?`).get(ref.id) as
          { content_id: number | null } | undefined;
        if (!row?.content_id) return null;
        const aiTitle = contentTitles(db, [row.content_id], 0).get(row.content_id);
        return (
          aiTitle ||
          contentBlockLines(this.contentBlocks(db, row.content_id))[0]?.slice(0, TITLE_CHARS) ||
          "无标题卡片"
        );
      }
      case "article": {
        const row = db
          .prepare(`SELECT title FROM articles WHERE id = ? AND is_delete = 0`)
          .get(ref.id) as { title: string | null } | undefined;
        return row ? row.title || "无标题文章" : null;
      }
      case "project-item": {
        const row = db
          .prepare(
            `SELECT title, content_id FROM project_item WHERE id = ? AND project_item_type = 'document'`
          )
          .get(ref.id) as { title: string | null; content_id: number | null } | undefined;
        return row?.content_id ? row.title || "无标题文档" : null;
      }
      case "diary-moment": {
        // 日记以所属那天作标题（一天多条片段同名，靠正文区分）
        const row = db
          .prepare(
            `SELECT s.content_id, d.date, d.create_time FROM diary_segments s
             JOIN diary_entries d ON d.id = s.diary_id WHERE s.id = ?`
          )
          .get(ref.id) as
          { content_id: number | null; date: string; create_time: number } | undefined;
        if (!row?.content_id) return null;
        return dayjs(normalizeDiaryDay(row.date, row.create_time)).format("YYYY年M月D日");
      }
      // 漫步只从内置内容抽取，插件内容不进候选
      case "plugin-entity":
        return null;
      case "pdf-annotation": {
        const row = db
          .prepare(
            `SELECT page_num, annotation_payload, notes, type FROM pdf_annotations WHERE id = ?`
          )
          .get(ref.id) as
          | {
              page_num: number;
              annotation_payload: string;
              notes: string | null;
              type: string | null;
            }
          | undefined;
        if (!row) return null;
        return (
          clip(pdfAnnotationQuote(row.annotation_payload) || pdfAnnotationNote(row.notes)) ||
          `${row.type === "margin" ? "页边批注" : "区域截图"} · 第 ${row.page_num + 1} 页`
        );
      }
    }
  }

  private static contentBlocks(
    db: Database.Database,
    contentId: number | null | undefined
  ): unknown[] | null {
    if (contentId == null) return null;
    return ContentTable.getContentById(db, contentId)?.content ?? null;
  }

  /** 选中项的完整解析：标题推导复用 entity-search 的口径 */
  private static resolveItem(db: Database.Database, sample: WalkSample): WalkItem | null {
    const { candidate, reason } = sample;
    const ref = { kind: candidate.kind, id: candidate.id };
    const title = this.resolveTitle(db, ref);
    // 标题解析失败 = 实体已删或失去正文，按失效跳过
    if (title == null) return null;
    const lastSeenTime =
      (
        db
          .prepare(`SELECT last_seen_time FROM walk_visits WHERE kind = ? AND entity_id = ?`)
          .get(candidate.kind, candidate.id) as { last_seen_time: number } | undefined
      )?.last_seen_time ?? null;
    const base = {
      ref,
      title,
      createTime: candidate.createTime,
      updateTime: candidate.updateTime,
      lastSeenTime,
      reason,
    };
    const content = (contentId: number | null | undefined) => this.contentBlocks(db, contentId);

    switch (candidate.kind) {
      case "card": {
        const row = db
          .prepare(`SELECT content_id, tags FROM cards WHERE id = ?`)
          .get(candidate.id) as { content_id: number | null; tags: string | null } | undefined;
        if (!row?.content_id) return null;
        return {
          ...base,
          contentId: row.content_id,
          content: content(row.content_id),
          excerpt: null,
          note: null,
          source: null,
          tags: parseTags(row.tags),
        };
      }
      case "article": {
        const row = db
          .prepare(`SELECT title, content_id, tags FROM articles WHERE id = ? AND is_delete = 0`)
          .get(candidate.id) as
          { title: string | null; content_id: number | null; tags: string | null } | undefined;
        if (!row?.content_id) return null;
        return {
          ...base,
          contentId: row.content_id,
          content: content(row.content_id),
          excerpt: null,
          note: null,
          source: null,
          tags: parseTags(row.tags),
        };
      }
      case "project-item": {
        const row = db
          .prepare(`SELECT title, content_id, tags, projects FROM project_item WHERE id = ?`)
          .get(candidate.id) as
          | {
              title: string | null;
              content_id: number | null;
              tags: string | null;
              projects: string | null;
            }
          | undefined;
        if (!row?.content_id) return null;
        const projectId = parseFirstId(row.projects);
        const project =
          projectId != null
            ? (db.prepare(`SELECT title FROM project WHERE id = ?`).get(projectId) as
                { title: string | null } | undefined)
            : undefined;
        return {
          ...base,
          contentId: row.content_id,
          content: content(row.content_id),
          excerpt: null,
          note: null,
          source: project?.title || null,
          tags: parseTags(row.tags),
        };
      }
      case "plugin-entity":
        return null;
      case "diary-moment": {
        const row = db
          .prepare(`SELECT content_id, tags FROM diary_segments WHERE id = ?`)
          .get(candidate.id) as { content_id: number; tags: string | null } | undefined;
        if (!row) return null;
        return {
          ...base,
          contentId: row.content_id,
          content: content(row.content_id),
          excerpt: null,
          note: null,
          source: null,
          tags: parseTags(row.tags),
        };
      }
      case "pdf-annotation": {
        const row = db
          .prepare(
            `SELECT a.pdf_id, a.page_num, a.annotation_payload, a.notes, a.type, p.file_name, p.tags AS pdf_tags
             FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id WHERE a.id = ?`
          )
          .get(candidate.id) as
          | {
              pdf_id: number;
              page_num: number;
              annotation_payload: string;
              notes: string | null;
              type: string | null;
              file_name: string | null;
              pdf_tags: string | null;
            }
          | undefined;
        if (!row) return null;
        const quote = pdfAnnotationQuote(row.annotation_payload);
        const note = pdfAnnotationNote(row.notes);
        const page = row.page_num + 1;
        return {
          ...base,
          contentId: null,
          content: null,
          excerpt: quote || null,
          note: note || null,
          source: row.file_name ? `${row.file_name} · 第 ${page} 页` : `第 ${page} 页`,
          tags: parseTags(row.pdf_tags),
        };
      }
    }
  }
}
