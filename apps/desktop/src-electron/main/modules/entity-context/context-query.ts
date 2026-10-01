/**
 * 组装一个实体的脉络：引用了（解析自身正文）、共用正文的身份、被引用（索引库 entity_refs）、相关问题，
 * 以及来源、衍生、被使用（context-lineage）。
 *
 * 显式链接 cards.links 不在这里：卡片在浮层里有自己的「连接」分区（KL-014、KL-018）。
 */

import type Database from "better-sqlite3";
import {
  ENTITY_REF_PRIORITY,
  entityRefKey,
  isSameEntityRef,
  type EntityRef,
  type EntityRefKind,
} from "@/entity/ref";
import { extractInlineRefs, type InlineRefSnippet } from "@/entity/inline-refs";
import { normalizeDiaryDay } from "@/utils/diary-day";
import type { EntityKind } from "@/types/entity";
import type {
  ContextBacklink,
  ContextEntity,
  ContextOpenTarget,
  ContextQuestion,
  EntityContext,
} from "@/types/entity-context";
import type { QuestionLinkTargetType } from "@/types/question";
import EntitySearchTable from "../tables/entity-search";
import { derivedOf, notebookProjectionsOf, sourcesOf, usagesOf } from "./context-lineage";

/** 各分区最多返回的条数 */
export const CONTEXT_LIMIT = 50;
/** 每个来源最多带几段片段 */
const SNIPPETS_PER_SOURCE = 3;

const PICKER_KIND: Record<EntityRefKind, EntityKind> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  diary: "diary",
};

const QUESTION_TARGET: Partial<Record<EntityRefKind, QuestionLinkTargetType>> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
};

/** 实体对应的正文；日记有多段，全部算作它的正文 */
function contentIdsOf(db: Database.Database, ref: EntityRef): number[] {
  const one = (sql: string) =>
    (db.prepare(sql).get(ref.id) as { content_id: number | null } | undefined)?.content_id;
  let ids: Array<number | null | undefined>;
  switch (ref.kind) {
    case "card":
      ids = [one(`SELECT content_id FROM cards WHERE id = ?`)];
      break;
    case "article":
      ids = [one(`SELECT content_id FROM articles WHERE id = ? AND is_delete = 0`)];
      break;
    case "project-item":
      ids = [one(`SELECT content_id FROM project_item WHERE id = ?`)];
      break;
    case "diary":
      ids = (
        db
          .prepare(`SELECT content_id FROM diary_segments WHERE diary_id = ? ORDER BY id`)
          .all(ref.id) as Array<{ content_id: number | null }>
      ).map(row => row.content_id);
      break;
  }
  return ids.filter((id): id is number => typeof id === "number" && id > 0);
}

function toContextEntity(db: Database.Database, ref: EntityRef): ContextEntity | null {
  const candidate = EntitySearchTable.resolve(db, PICKER_KIND[ref.kind], ref.id, 0);
  if (!candidate) return null;
  // 搜索标题是「YYYY-MM-DD 日记」；浮层行尾已有类型名，标题只留日期
  if (ref.kind === "diary") {
    return {
      ref,
      title: candidate.title.replace(/\s*日记$/, ""),
      meta: candidate.meta ? `日记 · ${candidate.meta}` : "日记",
    };
  }
  return { ref, title: candidate.title, meta: candidate.meta };
}

/** 日记一天有多条（segment），按引用所在的正文定位到那一条 */
function diaryMomentTarget(db: Database.Database, contentId: number): ContextOpenTarget | undefined {
  const row = db
    .prepare(
      `SELECT s.id, s.create_time, e.date FROM diary_segments s
       JOIN diary_entries e ON e.id = s.diary_id WHERE s.content_id = ?`
    )
    .get(contentId) as { id: number; create_time: number; date: string } | undefined;
  return row
    ? { page: "diary", date: normalizeDiaryDay(row.date, row.create_time), momentId: row.id }
    : undefined;
}

/** 实体是日记时，打开位置定位到 contentId 所在的那一条 */
function withDiaryMoment(
  db: Database.Database,
  entity: ContextEntity,
  contentId: number | null
): ContextEntity {
  if (entity.ref.kind !== "diary" || contentId == null) return entity;
  const open = diaryMomentTarget(db, contentId);
  return open ? { ...entity, open } : entity;
}

interface RefRow {
  src_content_id: number;
  snippet_before: string;
  snippet_label: string;
  snippet_after: string;
}

function backlinksOf(
  mainDb: Database.Database,
  indexDb: Database.Database,
  self: EntityRef,
  selfContentIds: number[]
): { backlinks: ContextBacklink[]; total: number; unresolved: number[] } {
  const marks = selfContentIds.map(() => "?").join(",");
  const byContent = selfContentIds.length ? `dst_content_id IN (${marks}) OR ` : "";
  // 老节点可能缺 contentId，再按类型与 id 兜底
  const rows = indexDb
    .prepare(
      `SELECT src_content_id, snippet_before, snippet_label, snippet_after FROM entity_refs
       WHERE ${byContent}(dst_kind = ? AND dst_id = ?) ORDER BY rowid`
    )
    .all(...selfContentIds, self.kind, self.id) as RefRow[];
  const selfContents = new Set(selfContentIds);
  const external = rows.filter(row => !selfContents.has(row.src_content_id));
  if (external.length === 0) return { backlinks: [], total: 0, unresolved: [] };

  const srcIds = [...new Set(external.map(row => row.src_content_id))];
  const located = EntitySearchTable.locateAll(mainDb, srcIds);
  const marksSrc = srcIds.map(() => "?").join(",");
  const updateTimes = new Map(
    (
      mainDb
        .prepare(`SELECT id, update_time FROM contents WHERE id IN (${marksSrc})`)
        .all(...srcIds) as Array<{ id: number; update_time: number }>
    ).map(row => [row.id, row.update_time])
  );

  // 一份来源正文被多个实体共用时，以优先级最高的身份展示
  // contentId：第一处引用所在的来源正文，用于打开到具体位置
  const groups = new Map<
    string,
    { ref: EntityRef; time: number; contentId: number; snippets: InlineRefSnippet[] }
  >();
  // 解析不到身份的来源正文（白板文本块、思维导图节点的正文），交给「被使用 · 白板」归属
  const unresolved = new Set<number>();
  for (const row of external) {
    const ref = located.get(row.src_content_id)?.[0];
    if (!ref) unresolved.add(row.src_content_id);
    if (!ref || isSameEntityRef(ref, self)) continue;
    const key = entityRefKey(ref);
    const group = groups.get(key) ?? {
      ref,
      time: updateTimes.get(row.src_content_id) ?? 0,
      contentId: row.src_content_id,
      snippets: [],
    };
    if (group.snippets.length < SNIPPETS_PER_SOURCE) {
      group.snippets.push({
        before: row.snippet_before,
        label: row.snippet_label,
        after: row.snippet_after,
      });
    }
    groups.set(key, group);
  }

  const sorted = [...groups.values()].sort(
    (a, b) => b.time - a.time || ENTITY_REF_PRIORITY[a.ref.kind] - ENTITY_REF_PRIORITY[b.ref.kind]
  );
  const backlinks: ContextBacklink[] = [];
  for (const group of sorted) {
    if (backlinks.length >= CONTEXT_LIMIT) break;
    const source = toContextEntity(mainDb, group.ref);
    if (!source) continue;
    backlinks.push({ source: withDiaryMoment(mainDb, source, group.contentId), snippets: group.snippets });
  }
  return { backlinks, total: groups.size, unresolved: [...unresolved] };
}

function questionsOf(
  db: Database.Database,
  refs: EntityRef[],
  contentIds: number[]
): ContextQuestion[] {
  const seen = new Map<number, ContextQuestion>();
  const add = (rows: Array<{ id: number; question_content: string; status: string }>) => {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.set(row.id, {
          id: row.id,
          title: row.question_content,
          status: row.status as ContextQuestion["status"],
        });
      }
    }
  };
  const byTarget = db.prepare(
    `SELECT q.id, q.question_content, q.status FROM question_link l JOIN questions q ON q.id = l.question_id
     WHERE l.target_type = ? AND l.target_id = ? ORDER BY q.update_time DESC`
  );
  for (const ref of refs) {
    const targetType = QUESTION_TARGET[ref.kind];
    if (targetType) add(byTarget.all(targetType, ref.id) as never);
  }
  // 问题的答案正文被投影成卡片等实体时，材料仍记为 answer:contentId
  if (contentIds.length) {
    const marks = contentIds.map(() => "?").join(",");
    add(
      db
        .prepare(
          `SELECT q.id, q.question_content, q.status FROM question_link l JOIN questions q ON q.id = l.question_id
           WHERE l.target_type = 'answer' AND l.target_id IN (${marks}) ORDER BY q.update_time DESC`
        )
        .all(...contentIds) as never
    );
  }
  return [...seen.values()].slice(0, CONTEXT_LIMIT);
}

/** 自身正文里引用的实体；exclude 为自身与共用正文的身份，目标已不存在的丢弃 */
function outlinksOf(
  db: Database.Database,
  contentIds: number[],
  exclude: Set<string>
): ContextEntity[] {
  if (contentIds.length === 0) return [];
  const marks = contentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT content FROM contents WHERE id IN (${marks}) AND instr(content, '"content-link"') > 0`
    )
    .all(...contentIds) as Array<{ content: string }>;
  const seen = new Set(exclude);
  const outlinks: ContextEntity[] = [];
  for (const row of rows) {
    let content: unknown;
    try {
      content = JSON.parse(row.content);
    } catch {
      continue;
    }
    for (const { dst, dstContentId } of extractInlineRefs(content)) {
      const key = entityRefKey(dst);
      if (seen.has(key)) continue;
      seen.add(key);
      const entity = toContextEntity(db, dst);
      if (entity) outlinks.push(withDiaryMoment(db, entity, dstContentId));
      if (outlinks.length >= CONTEXT_LIMIT) return outlinks;
    }
  }
  return outlinks;
}

/** 实体不存在时返回 null */
export function getEntityContext(
  mainDb: Database.Database,
  indexDb: Database.Database,
  ref: EntityRef
): EntityContext | null {
  const self = toContextEntity(mainDb, ref);
  if (!self) return null;
  const contentIds = contentIdsOf(mainDb, ref);
  const located = EntitySearchTable.locateAll(mainDb, contentIds);
  const projectionRefs: EntityRef[] = [];
  const seen = new Set([entityRefKey(ref)]);
  for (const id of contentIds) {
    for (const other of located.get(id) ?? []) {
      const key = entityRefKey(other);
      if (seen.has(key)) continue;
      seen.add(key);
      projectionRefs.push(other);
    }
  }
  const projections = projectionRefs
    .map(other => toContextEntity(mainDb, other))
    .filter((entity): entity is ContextEntity => entity !== null)
    .slice(0, CONTEXT_LIMIT);
  const { backlinks, total, unresolved } = backlinksOf(mainDb, indexDb, ref, contentIds);
  const identities = [ref, ...projectionRefs];
  const toEntity = (other: EntityRef) => toContextEntity(mainDb, other);
  return {
    self,
    outlinks: outlinksOf(mainDb, contentIds, seen),
    projections,
    backlinks,
    backlinkTotal: total,
    questions: questionsOf(mainDb, identities, contentIds),
    sources: sourcesOf(mainDb, identities, toEntity),
    derived: derivedOf(mainDb, identities, contentIds, toEntity),
    notebookProjections: notebookProjectionsOf(mainDb, contentIds, toEntity),
    usages: usagesOf(mainDb, indexDb, identities, contentIds, unresolved, toEntity),
  };
}
