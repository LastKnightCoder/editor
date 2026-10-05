/**
 * 项目回顾（KL-004 / KL-065）：读项目文档的 7a 元信息，产出连接与问题。
 *
 * - 生长回顾（未归档）：自上次回顾以来长了什么、新连上了哪里、哪一支还薄；项目外语义上属于某一支、
 *   却散在卡片库或文章里的笔记，提示「可能属于这里」（本地按分支向量查近邻给宽候选，模型判断）。
 * - 结项回顾（归档）：留下的核心观点、和已有体系连上了哪里、还没解决的问题、可以归进哪个进行中的项目。
 *
 * 一个项目一行（scope = project）；结项回顾覆盖生长回顾，已处理的状态照常继承。
 */

import type Database from "better-sqlite3";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import KnowledgeAiInsightsTable, {
  emptyResult,
  memberChange,
  type KnowledgeAiInsightsRow,
  type MemberSnapshot,
} from "./tables/knowledge-ai-insights";
import { meanVector, type MapEntity } from "./tables/knowledge-map";
import {
  NOTE_TYPES_SQL,
  cosine,
  loadNoteVectors,
  shortHash,
  toFloats,
} from "./topic-insights-candidates";
import {
  FINAL_REVIEW_SYSTEM_PROMPT,
  GROWTH_REVIEW_SYSTEM_PROMPT,
  buildProjectPrompt,
  fixRefsDeep,
  parseFinalReviewOutput,
  parseGrowthReviewOutput,
} from "./topic-insights-prompt";
import {
  callModel,
  endpoint,
  isLinked,
  modelName,
  promptNote,
  type InsightsContext,
  type TopicInsightsDeps,
} from "./topic-insights";
import type { LlmRef } from "./llm-usage-slot";

export const GROWTH_MIN_CHANGE = 0.3;
export const GROWTH_MIN_ADDED = 5;
export const GROWTH_MIN_INTERVAL_MS = 7 * 24 * 3600_000;
/** 归档后这么久之内才自动写结项回顾（功能刚开启时，不给很久以前归档的项目补写） */
export const FINAL_RECENT_MS = 30 * 24 * 3600_000;
const DOC_LIMIT = 80;
const MAX_DEPTH = 3;
const BELONG_CANDIDATES = 16;
const BRANCH_KNN_CHUNKS = 60;
const HOME_CANDIDATES = 3;
const OUTSIDE_TITLES = 12;
/** 进行中的项目至少有这么多份文档才可能是「体系项目」 */
const HOME_MIN_DOCS = 3;

const parseIds = (raw: unknown): number[] => {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(Number).filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
};

export interface TreeItem {
  id: number;
  depth: number;
  title: string;
  /** 顶层分支（自己是顶层时为自己） */
  root: number;
  contentId: number | null;
  /** 引用型条目指向的卡片 / 文章 */
  ref: { kind: "card" | "article"; id: number } | null;
  /** max(条目, 正文) 的更新时间 */
  updateTime: number;
}

/** 项目文档树（按项目里的顺序深度优先）；不存在的项目返回 null */
export function projectTree(
  mainDb: Database.Database,
  projectId: number
): { title: string; archived: boolean; updateTime: number; items: TreeItem[] } | null {
  const project = mainDb
    .prepare(`SELECT title, children, archived, update_time FROM project WHERE id = ?`)
    .get(projectId) as
    | { title: string; children: string | null; archived: number | null; update_time: number }
    | undefined;
  if (!project) return null;
  const rows = mainDb
    .prepare(
      `SELECT p.id, p.title, p.children, p.content_id, p.ref_type, p.ref_id,
              MAX(p.update_time, COALESCE(c.update_time, 0)) AS update_time
       FROM project_item p LEFT JOIN contents c ON c.id = p.content_id
       WHERE EXISTS (SELECT 1 FROM json_each(p.projects) WHERE value = ?)`
    )
    .all(projectId) as Array<{
    id: number;
    title: string;
    children: string | null;
    content_id: number | null;
    ref_type: string | null;
    ref_id: number | null;
    update_time: number;
  }>;
  const byId = new Map(rows.map(row => [row.id, row]));
  const items: TreeItem[] = [];
  const seen = new Set<number>();
  const walk = (id: number, depth: number, root: number) => {
    const row = byId.get(id);
    if (!row || seen.has(id)) return;
    seen.add(id);
    const ref =
      (row.ref_type === "card" || row.ref_type === "article") && row.ref_id
        ? { kind: row.ref_type as "card" | "article", id: row.ref_id }
        : null;
    items.push({
      id,
      depth,
      title: row.title,
      root,
      contentId: row.content_id,
      ref,
      updateTime: row.update_time,
    });
    for (const child of parseIds(row.children)) walk(child, depth + 1, root);
  };
  for (const id of parseIds(project.children)) walk(id, 0, id);
  return {
    title: project.title,
    archived: Boolean(project.archived),
    updateTime: project.update_time,
    items,
  };
}

/** 树条目在地图实体里的键：文档自己，引用型条目取它指向的卡片 / 文章 */
const itemKey = (item: TreeItem) =>
  item.ref ? `${item.ref.kind}:${item.ref.id}` : `project-item:${item.id}`;

export function projectSnapshot(ctx: InsightsContext, items: TreeItem[]): MemberSnapshot {
  const ids = [
    ...new Set(items.map(item => item.contentId).filter((id): id is number => !!id)),
  ].sort((a, b) => a - b);
  return ids.map(id => {
    const meta = ctx.metas.get(id);
    return [id, meta ? shortHash(JSON.stringify(meta.meta)) : ""];
  });
}

/** 后台该写的回顾：最近归档、还没有结项回顾的；生长回顾过的项目变化够大且隔了 7 天的 */
export function projectsDue(
  ctx: InsightsContext,
  now: number
): Array<{ projectId: number; kind: "growth" | "final" }> {
  const projects = ctx.mainDb
    .prepare(`SELECT id, archived, update_time FROM project`)
    .all() as Array<{ id: number; archived: number | null; update_time: number }>;
  const rows = new Map(
    KnowledgeAiInsightsTable.list(ctx.mainDb, "project").map(row => [row.projectId, row])
  );
  const due: Array<{ projectId: number; kind: "growth" | "final" }> = [];
  for (const project of projects) {
    const row = rows.get(project.id);
    if (project.archived) {
      if (row?.overview.kind === "final") continue;
      if (now - project.update_time <= FINAL_RECENT_MS) {
        due.push({ projectId: project.id, kind: "final" });
      }
      continue;
    }
    // 生长回顾第一次只在用户点「回顾」时写
    if (!row || now - row.updateTime < GROWTH_MIN_INTERVAL_MS) continue;
    const tree = projectTree(ctx.mainDb, project.id);
    if (!tree) continue;
    const snapshot = projectSnapshot(ctx, tree.items);
    const before = new Set(row.members.map(([id]) => id));
    const added = snapshot.filter(([id]) => !before.has(id)).length;
    if (memberChange(row.members, snapshot) >= GROWTH_MIN_CHANGE || added >= GROWTH_MIN_ADDED) {
      due.push({ projectId: project.id, kind: "growth" });
    }
  }
  // 结项回顾先写：它是一次性的交付
  return due.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "final" ? -1 : 1));
}

const normalize = (vectors: Float32Array[]): Float32Array | null => {
  const mean = meanVector(vectors.map(vector => Buffer.from(vector.buffer)));
  return mean ? new Float32Array(toFloats(mean)) : null;
};

export async function reviewProject(
  deps: TopicInsightsDeps,
  ctx: InsightsContext,
  projectId: number,
  slot: LlmRef,
  signal?: AbortSignal
): Promise<KnowledgeAiInsightsRow | null> {
  const tree = projectTree(ctx.mainDb, projectId);
  if (!tree) return null;
  const kind = tree.archived ? "final" : "growth";
  const row = KnowledgeAiInsightsTable.getProject(ctx.mainDb, projectId);
  const docs = tree.items.filter(item => item.depth <= MAX_DEPTH).slice(0, DOC_LIMIT);
  const docNo = new Map(docs.map((item, index) => [item.id, index + 1]));
  const projectKeys = new Set(tree.items.map(itemKey));
  const outsideKeys = new Set<string>();
  for (const key of projectKeys) {
    for (const other of ctx.links.get(key) ?? []) {
      if (!projectKeys.has(other)) outsideKeys.add(other);
    }
  }
  const linked = isLinked(ctx);
  const day = (time: number) => {
    const date = new Date(time);
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  };

  // 分支向量：每个顶层分支下文档整体向量的均值
  const vectors = loadNoteVectors(ctx.indexDb, [...projectKeys]);
  const branchVectors = new Map<number, Float32Array>();
  for (const root of new Set(tree.items.map(item => item.root))) {
    const own = tree.items
      .filter(item => item.root === root)
      .flatMap(item => {
        const vector = vectors.get(itemKey(item));
        return vector ? [vector.mean] : [];
      });
    const mean = own.length ? normalize(own) : null;
    if (mean) branchVectors.set(root, mean);
  }

  const candidates: Array<{ entity: MapEntity; root: number; similarity: number }> = [];
  const homes: Array<{ projectId: number; title: string; similarity: number }> = [];
  if (kind === "growth" && ctx.threshold != null) {
    const knn = ctx.indexDb.prepare(
      `SELECT prefixed_id, distance FROM vec_documents
       WHERE vec_embedding MATCH ? AND k = ? AND type IN (${NOTE_TYPES_SQL})`
    );
    const best = new Map<string, { root: number; similarity: number }>();
    for (const [root, vector] of branchVectors) {
      const rows = knn.all(Buffer.from(vector.buffer), BRANCH_KNN_CHUNKS) as Array<{
        prefixed_id: string;
        distance: number;
      }>;
      for (const hit of rows) {
        const similarity = 1 - hit.distance;
        if (similarity <= ctx.threshold) break;
        const key = hit.prefixed_id;
        // 只提议散在外面的卡片与文章：别的项目里的文档不该被挪进来
        if (!key.startsWith("card:") && !key.startsWith("article:")) continue;
        if (projectKeys.has(key) || outsideKeys.has(key)) continue;
        if ([...projectKeys].some(own => linked(own, key))) continue;
        if ((best.get(key)?.similarity ?? -Infinity) >= similarity) continue;
        best.set(key, { root, similarity });
      }
    }
    for (const [key, hit] of [...best.entries()].sort(
      (a, b) => b[1].similarity - a[1].similarity
    )) {
      const entity = ctx.byKey.get(key);
      if (!entity) continue;
      candidates.push({ entity, ...hit });
      if (candidates.length >= BELONG_CANDIDATES) break;
    }
  }
  if (kind === "final" && branchVectors.size) {
    const own = normalize([...branchVectors.values()]);
    const others = ctx.mainDb
      .prepare(`SELECT id, title FROM project WHERE id != ? AND COALESCE(archived, 0) = 0`)
      .all(projectId) as Array<{ id: number; title: string }>;
    for (const other of others) {
      const otherTree = projectTree(ctx.mainDb, other.id);
      if (!otherTree || otherTree.items.length < HOME_MIN_DOCS || !own) continue;
      const otherVectors = loadNoteVectors(ctx.indexDb, otherTree.items.map(itemKey));
      const mean = otherVectors.size
        ? normalize([...otherVectors.values()].map(vector => vector.mean))
        : null;
      if (!mean) continue;
      const similarity = cosine(own, mean);
      // 项目整体向量是很多篇的均值，比单节之间的相似度低得多：不按块阈值卡，取最近的几个交给模型
      if (similarity > 0) homes.push({ projectId: other.id, title: other.title, similarity });
    }
    homes.sort((a, b) => b.similarity - a.similarity).splice(HOME_CANDIDATES);
  }

  const summaryOf = (item: TreeItem) =>
    item.contentId ? (ctx.metas.get(item.contentId)?.meta.summary ?? "") : "";
  const branchLabel = (root: number) => {
    const item = docs.find(doc => doc.id === root);
    return item ? `D${docNo.get(item.id)} ${item.title}` : "";
  };
  const prompt = buildProjectPrompt({
    title: tree.title,
    lastReview: row ? day(row.updateTime) : "",
    docs: docs.map(item => ({
      no: docNo.get(item.id)!,
      depth: item.depth,
      title: item.title,
      summary: summaryOf(item),
      fresh: !!row && item.updateTime > row.updateTime,
    })),
    outside: [...outsideKeys]
      .slice(0, OUTSIDE_TITLES)
      .map(key => ctx.titles.get(key) ?? "")
      .filter(Boolean),
    candidates: candidates.map((candidate, index) => ({
      note: promptNote(ctx, candidate.entity, index + 1),
      branch: branchLabel(candidate.root),
    })),
    homes: homes.map((home, index) => ({
      no: index + 1,
      title: home.title,
      similarity: home.similarity,
    })),
  });

  const topic = tree.title;
  const docEndpoint = (item: TreeItem): KnowledgeEndpoint | null => {
    const entity = ctx.byKey.get(itemKey(item));
    return entity ? endpoint(ctx, entity, topic) : null;
  };
  const byDocNo = new Map(docs.map(item => [docNo.get(item.id)!, item]));
  // D# → 文档，C# → 候选笔记，P# → 进行中的项目
  const resolveRef = (prefix: string, no: number): string | null => {
    if (prefix === "D") return byDocNo.get(no)?.title ?? null;
    if (prefix === "C") {
      const candidate = candidates[no - 1];
      return candidate ? promptNote(ctx, candidate.entity, 0).title : null;
    }
    if (prefix === "P") {
      const home = homes[no - 1];
      return home ? `「${home.title}」` : null;
    }
    return null;
  };
  let result = { ...emptyResult(), outside: outsideKeys.size };
  if (kind === "growth") {
    const parsed = await callModel(
      deps,
      slot,
      GROWTH_REVIEW_SYSTEM_PROMPT,
      prompt,
      `project:${projectId}`,
      text =>
        parseGrowthReviewOutput(
          text,
          new Set(candidates.map((_, index) => index + 1)),
          new Set(byDocNo.keys())
        ),
      signal
    ).then(value => fixRefsDeep(value, resolveRef, "CDP"));
    const marks: KnowledgeMark[] = [
      ...parsed.belong.map(item => ({
        id: "",
        kind: "belong" as const,
        why: item.why,
        ends: [endpoint(ctx, candidates[item.candidate - 1].entity, topic)],
        under: byDocNo.get(item.branch)!.id,
        status: "open" as const,
      })),
      ...parsed.thin.map(item => ({
        id: "",
        kind: "thin" as const,
        why: item.why,
        ends: [],
        text: item.text,
        under: byDocNo.get(item.branch)!.id,
        status: "open" as const,
      })),
    ].map((mark, index) => ({ ...mark, id: `p${index + 1}` }));
    result = {
      ...result,
      lead: parsed.lead,
      marks,
      asks: parsed.asks.map((text, index) => ({ id: `q${index + 1}`, text, status: "open" })),
      candidates: candidates.length,
    };
  } else {
    const parsed = await callModel(
      deps,
      slot,
      FINAL_REVIEW_SYSTEM_PROMPT,
      prompt,
      `project:${projectId}`,
      text =>
        parseFinalReviewOutput(
          text,
          new Set(byDocNo.keys()),
          new Set(homes.map((_, index) => index + 1))
        ),
      signal
    ).then(value => fixRefsDeep(value, resolveRef, "CDP"));
    const home = parsed.home ? homes[parsed.home - 1] : null;
    result = {
      ...result,
      lead: parsed.lead,
      asks: parsed.asks.map((text, index) => ({ id: `q${index + 1}`, text, status: "open" })),
      refs: parsed.core.flatMap(no => {
        const item = byDocNo.get(no);
        const end = item ? docEndpoint(item) : null;
        return end ? [end] : [];
      }),
      ...(home ? { home: { projectId: home.projectId, title: home.title } } : {}),
      candidates: homes.length,
    };
  }
  return KnowledgeAiInsightsTable.save(
    ctx.mainDb,
    {
      scope: "project",
      parentId: null,
      projectId,
      label: tree.title,
      members: projectSnapshot(ctx, tree.items),
      overview: { overview: result.lead, shift: "", kind },
      result,
      increments: 0,
      model: modelName(slot),
    },
    row?.id ?? null,
    deps.now()
  );
}
