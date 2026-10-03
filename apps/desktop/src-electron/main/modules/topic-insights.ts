/**
 * 主题与全局层 AI 洞见（KL-060 / KL-062 / KL-063）：顺着知识地图的「子主题 → 主题 → 全局」分层阅读。
 *
 * - 子主题读成员的 7a 元信息（不读原文）+ 组内相近的笔记对 → 概述、关注点变化、同一思路、缺一环、重复 / 矛盾；
 * - 主题读子主题概述、关键概念、生长数字与子主题的发现 → 概述、报告两三句、还缺、问题，并挑出要画的 ≤ 6 处；
 * - 全局读主题概述 + 跨主题的笔记对 + 问了但没写的提问组 → 报告两三句、呼应、问了没写。
 *
 * 主题编号每次整体重算都会重排：结果行按成员快照的重合度（≥ 0.7）对回当前主题，对不上的删掉、新出现的新建。
 * 变化量分三档：< 10% 不动；10%–40% 增量改写；≥ 40% 或已连续增量 3 次完整重写。子主题动了主题才重写，
 * 任一主题重写后全局最多每 6 小时重写一次（点按钮时不受这个限制）。
 */

import type Database from "better-sqlite3";
import log from "electron-log";
import type { Descendant } from "slate";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import { splitSections } from "@/entity/sections";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type {
  KnowledgeEndpoint,
  KnowledgeInsightResult,
  KnowledgeInsightsPayload,
  KnowledgeInsightsPhase,
  KnowledgeMark,
} from "@/types/knowledge-insights";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import { locateAnchor, promptSectionsOf } from "./content-insights-prompt";
import { ensureRelatedThreshold } from "./entity-context/context-related";
import type { LlmRef } from "./llm-usage-slot";
import ContentAiMetaTable, { type ContentAiMetaRow } from "./tables/content-ai-meta";
import ContentTable from "./tables/content";
import KnowledgeAiInsightsTable, {
  emptyResult,
  markKey,
  memberChange,
  memberOverlap,
  type KnowledgeAiInsightsRow,
  type MemberSnapshot,
} from "./tables/knowledge-ai-insights";
import KnowledgeMapTable, { type MapEntity } from "./tables/knowledge-map";
import {
  askedCandidates,
  bestSection,
  bridgeCandidates,
  growthSeries,
  loadNoteVectors,
  mapGroups,
  memberSnapshot,
  pairCandidates,
  recentCount,
  type MapGroup,
  type MapTopicGroups,
  type NoteVectors,
} from "./topic-insights-candidates";
import {
  GLOBAL_SYSTEM_PROMPT,
  SUBTOPIC_SYSTEM_PROMPT,
  TOPIC_SYSTEM_PROMPT,
  buildGlobalPrompt,
  buildSubtopicPrompt,
  buildTopicPrompt,
  parseGlobalOutput,
  parseSubtopicOutput,
  parseTopicOutput,
  fixRefsDeep,
  type PromptNote,
  type PromptPair,
} from "./topic-insights-prompt";

export const TOPIC_INSIGHTS_SLOT = "contentInsights";
export const KNOWLEDGE_INSIGHTS_CHANGED_EVENT = "knowledge-insights:changed";
/** 元信息覆盖率到这个比例才开始后台计算：概述读的是元信息，覆盖太低读出来是偏的 */
export const COVERAGE_GATE = 0.8;
export const IDENTITY_OVERLAP = 0.7;
export const TIER_KEEP_BELOW = 0.1;
export const TIER_FULL_FROM = 0.4;
export const MAX_INCREMENTS = 3;
export const GLOBAL_MIN_INTERVAL_MS = 6 * 3600_000;
const SUBTOPIC_NOTE_LIMIT = 80;
const SUBTOPIC_PAIR_LIMIT = 20;
const SUBTOPIC_MARK_LIMIT = 5;
/** 有元信息的成员少于这么多的组不单独调用（只计入主题的数量） */
const MIN_GROUP_NOTES = 3;
const TOPIC_CONCEPTS = 60;
const PARSE_ATTEMPTS = 2;
/** 后台一轮里连续这么多次调用失败（密钥失效、断网），停掉这一轮 */
const ABORT_AFTER_FAILURES = 3;
const KIND_LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
};

export interface TopicInsightsDeps {
  complete(
    request: Omit<PiSingleShotRequest, "requestId">,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; text: string; error?: string }>;
  now(): number;
}

/** 一次分析用到的库内数据：只读一遍，各层共用 */
export interface InsightsContext {
  mainDb: Database.Database;
  indexDb: Database.Database;
  map: KnowledgeMap;
  topics: MapTopicGroups[];
  byKey: Map<string, MapEntity>;
  metas: Map<number, ContentAiMetaRow>;
  titles: Map<string, string>;
  links: Map<string, Set<string>>;
  /** 当前库随机块对 p95；没有向量时为 null（不给需要相似度的候选） */
  threshold: number | null;
}

/**
 * 地图上没起名的主题与子主题（命名来自 tag，成员 tag 太散时为空）：用成员元信息里最常见、
 * 和主题名不同、同一主题内没用过的概念起名；都没有时叫「其他」。
 */
export function nameUnlabeled(topics: MapTopicGroups[], metas: Map<number, ContentAiMetaRow>) {
  const conceptsOf = (members: MapEntity[], exclude: Set<string>) => {
    const counts = new Map<string, number>();
    for (const member of members) {
      for (const concept of metas.get(member.contentId)?.meta.concepts ?? []) {
        const name = concept.trim();
        if (name && !exclude.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  };
  for (const topic of topics) {
    if (!topic.label.trim()) topic.label = conceptsOf(topic.members, new Set())[0] ?? "其他";
    const used = new Set([
      topic.label,
      ...topic.groups.map(group => group.label.trim()).filter(Boolean),
    ]);
    for (const group of topic.groups) {
      if (group.label.trim()) continue;
      group.label = conceptsOf(group.members, used)[0] ?? "其他";
      used.add(group.label);
    }
  }
  return topics;
}

export function buildContext(
  mainDb: Database.Database,
  indexDb: Database.Database,
  map: KnowledgeMap
): InsightsContext {
  const entities = KnowledgeMapTable.listEntities(mainDb);
  const items = KnowledgeMapTable.listItems(mainDb, indexDb);
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!links.has(a)) links.set(a, new Set());
    links.get(a)!.add(b);
  };
  for (const item of items) {
    for (const target of item.links) {
      link(item.key, target);
      link(target, item.key);
    }
  }
  const metas = ContentAiMetaTable.getMany(
    mainDb,
    entities.map(entity => entity.contentId)
  );
  return {
    mainDb,
    indexDb,
    map,
    topics: nameUnlabeled(mapGroups(map, entities), metas),
    byKey: new Map(entities.map(entity => [entity.key, entity])),
    metas,
    titles: new Map(items.map(item => [item.key, item.title])),
    links,
    threshold: ensureRelatedThreshold(indexDb)?.value ?? null,
  };
}

/** 地图上（已归入主题的）笔记里有元信息的比例 */
export function metaCoverage(ctx: InsightsContext): number {
  const members = ctx.topics.flatMap(topic => topic.members);
  if (!members.length) return 0;
  return members.filter(member => ctx.metas.has(member.contentId)).length / members.length;
}

export const isLinked = (ctx: InsightsContext) => (a: string, b: string) =>
  ctx.links.get(a)?.has(b) ?? false;

// ───────────────────────── 计划：身份对应与三档 ─────────────────────────

export type Tier = "keep" | "incremental" | "full" | "skip";

export interface SubtopicPlan {
  group: MapGroup;
  snapshot: MemberSnapshot;
  row: KnowledgeAiInsightsRow | null;
  tier: Tier;
}

export interface TopicPlan {
  topic: MapTopicGroups;
  snapshot: MemberSnapshot;
  row: KnowledgeAiInsightsRow | null;
  subtopics: SubtopicPlan[];
}

export interface InsightsPlan {
  topics: TopicPlan[];
  /** 对不上任何当前主题的旧行（主题消失、拆分合并后的旧身份） */
  orphans: number[];
}

/** 按成员重合度一对一配对：重合度从高到低贪心，低于阈值的不配 */
export function matchRows<T>(
  rows: KnowledgeAiInsightsRow[],
  items: T[],
  snapshotOf: (item: T) => MemberSnapshot,
  minOverlap = IDENTITY_OVERLAP
): Map<T, KnowledgeAiInsightsRow> {
  const scored: Array<{ row: KnowledgeAiInsightsRow; item: T; overlap: number }> = [];
  for (const row of rows) {
    for (const item of items) {
      const overlap = memberOverlap(row.members, snapshotOf(item));
      if (overlap >= minOverlap) scored.push({ row, item, overlap });
    }
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  const result = new Map<T, KnowledgeAiInsightsRow>();
  const used = new Set<number>();
  for (const { row, item } of scored) {
    if (used.has(row.id) || result.has(item)) continue;
    used.add(row.id);
    result.set(item, row);
  }
  return result;
}

export function tierOf(row: KnowledgeAiInsightsRow | null, snapshot: MemberSnapshot): Tier {
  if (!row) return "full";
  const change = memberChange(row.members, snapshot);
  if (change < TIER_KEEP_BELOW) return "keep";
  if (change >= TIER_FULL_FROM || row.increments >= MAX_INCREMENTS) return "full";
  return "incremental";
}

export function planInsights(ctx: InsightsContext): InsightsPlan {
  const rows = KnowledgeAiInsightsTable.list(ctx.mainDb);
  const topicRows = rows.filter(row => row.scope === "topic");
  const subtopicRows = rows.filter(row => row.scope === "subtopic");
  const topicSnapshots = new Map(
    ctx.topics.map(topic => [topic, memberSnapshot(topic.members, ctx.metas)])
  );
  const groups = ctx.topics.flatMap(topic => topic.groups);
  const groupSnapshots = new Map(
    groups.map(group => [group, memberSnapshot(group.members, ctx.metas)])
  );
  const topicMatch = matchRows(topicRows, ctx.topics, topic => topicSnapshots.get(topic)!);
  const groupMatch = matchRows(subtopicRows, groups, group => groupSnapshots.get(group)!);
  const matched = new Set([
    ...[...topicMatch.values()].map(row => row.id),
    ...[...groupMatch.values()].map(row => row.id),
  ]);
  return {
    topics: ctx.topics.map(topic => ({
      topic,
      snapshot: topicSnapshots.get(topic)!,
      row: topicMatch.get(topic) ?? null,
      subtopics: topic.groups.map(group => {
        const snapshot = groupSnapshots.get(group)!;
        const row = groupMatch.get(group) ?? null;
        const withMeta = group.members.filter(member => ctx.metas.has(member.contentId)).length;
        return {
          group,
          snapshot,
          row,
          tier: withMeta < MIN_GROUP_NOTES ? "skip" : tierOf(row, snapshot),
        };
      }),
    })),
    orphans: rows
      .filter(row => (row.scope === "topic" || row.scope === "subtopic") && !matched.has(row.id))
      .map(row => row.id),
  };
}

/** 主题是否要重写：没有结果、子主题这轮动了、或成员本身变了（子主题重新划分） */
export function topicNeedsWork(plan: TopicPlan, changedSubtopics: boolean): boolean {
  return !plan.row || changedSubtopics || tierOf(plan.row, plan.snapshot) !== "keep";
}

// ───────────────────────── 笔记 → 提示词与端点 ─────────────────────────

const monthOf = (time: number) => {
  if (!time) return "";
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const isLongDoc = (entity: MapEntity) =>
  entity.kind === "article" || entity.kind === "project-item";

export function promptNote(ctx: InsightsContext, entity: MapEntity, no: number): PromptNote {
  const meta = ctx.metas.get(entity.contentId)?.meta;
  return {
    no,
    kindLabel: KIND_LABEL[entity.kind] ?? "笔记",
    title: ctx.titles.get(entity.key) || entity.title || meta?.title || "（无标题）",
    month: monthOf(entity.createdAt),
    summary: meta?.summary ?? "",
    claims: meta?.claims ?? [],
    concepts: meta?.concepts ?? [],
  };
}

/** 长文的原文片段：必须逐字落在命中节的某个顶层块里，返回块序号，对不上为 -1 */
export function verifyAnchor(
  mainDb: Database.Database,
  entity: MapEntity,
  blockStart: number,
  anchor: string
): number {
  const row = ContentTable.getContentById(mainDb, entity.contentId);
  if (!row) return -1;
  const content = row.content as Descendant[];
  const sections = promptSectionsOf(
    content,
    splitSections(content, entity.title, entity.kind === "card")
  );
  const section =
    sections.find(item => item.blockStart === blockStart) ??
    sections.find(item => item.blockStart <= blockStart && blockStart <= item.blockEnd);
  return section ? locateAnchor(content, section, anchor) : -1;
}

export interface SectionHit {
  heading: string;
  blockStart: number;
  text: string;
}

export function endpoint(
  ctx: InsightsContext,
  entity: MapEntity,
  topic: string,
  section?: SectionHit | null,
  anchor?: string
): KnowledgeEndpoint {
  const meta = ctx.metas.get(entity.contentId)?.meta;
  const ref = { kind: normalizeEntityRefKind(entity.kind)!, id: entity.id } as EntityRef;
  let block = section?.blockStart ?? 0;
  let verified: string | undefined;
  if (anchor && section && isLongDoc(entity)) {
    const found = verifyAnchor(ctx.mainDb, entity, section.blockStart, anchor);
    if (found >= 0) {
      block = found;
      verified = anchor;
    }
  }
  return {
    ref,
    contentId: entity.contentId,
    title: ctx.titles.get(entity.key) || entity.title || meta?.title || "（无标题）",
    topic,
    heading: section?.heading ?? "",
    block,
    excerpt: (meta?.summary || section?.text || "").replace(/\s+/g, " ").trim().slice(0, 160),
    ...(verified ? { anchor: verified } : {}),
  };
}

/** 一对笔记的提示词：长文一端带上和对方最接近的那一节原文 */
function buildPair(
  ctx: InsightsContext,
  no: number,
  left: { entity: MapEntity; no: number },
  right: { entity: MapEntity; no: number },
  vectors: Map<string, NoteVectors>
): { prompt: PromptPair; sections: Map<string, SectionHit> } {
  const sections = new Map<string, SectionHit>();
  const prompt: PromptPair = { no, left: left.no, right: right.no, sections: {} };
  for (const [self, other] of [
    [left, right],
    [right, left],
  ] as const) {
    if (!isLongDoc(self.entity)) continue;
    const own = vectors.get(self.entity.key);
    const target = vectors.get(other.entity.key);
    const hit = own && target ? bestSection(ctx.indexDb, own, target.mean) : null;
    if (!hit) continue;
    sections.set(self.entity.key, hit);
    prompt.sections[self.no] = { heading: hit.heading, text: hit.text };
  }
  return { prompt, sections };
}

export async function callModel<T>(
  deps: TopicInsightsDeps,
  slot: LlmRef,
  system: string,
  prompt: string,
  entityId: string,
  parse: (text: string) => T | null,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; attempt < PARSE_ATTEMPTS; attempt++) {
    const response = await deps.complete(
      {
        providerId: slot.providerId,
        modelId: slot.modelId,
        system,
        messages: [{ role: "user", content: prompt }],
        thinking: "off",
        source: { feature: TOPIC_INSIGHTS_SLOT, entityId },
      },
      signal
    );
    if (!response.ok || response.error) throw new Error(response.error || "模型请求失败");
    const parsed = parse(response.text);
    if (parsed) return parsed;
  }
  throw new Error("模型输出无法解析");
}

export const modelName = (slot: LlmRef) => `${slot.providerId}/${slot.modelId}`;

// ───────────────────────── 子主题 ─────────────────────────

function topicLabelOf(ctx: InsightsContext, group: MapGroup) {
  const topic = ctx.topics.find(item => item.topicId === group.topicId);
  return topic && group.label !== topic.label ? `${topic.label} › ${group.label}` : group.label;
}

function describeMark(mark: KnowledgeMark): string {
  const titles = mark.ends.map(end => `《${end.title.slice(0, 30)}》`);
  switch (mark.kind) {
    case "dup":
      return `[重复] ${titles.join(" ↔ ")}：${mark.why}`;
    case "conflict":
      return `[矛盾] ${titles.join(" ↔ ")}：${mark.why}`;
    case "pattern":
      return `[同一思路：${mark.text ?? ""}] ${titles.join("")}：${mark.why}`;
    case "chain":
      return `[缺一环：${mark.missing?.text ?? ""}] ${titles.join(" → ")}：${mark.why}`;
    default:
      return `[${mark.kind}] ${mark.text ?? titles.join("")}：${mark.why}`;
  }
}

/** 给成员排优先级：有主张的、链接多的、最近写的先进提示词 */
function prioritize(ctx: InsightsContext, members: MapEntity[], limit: number): MapEntity[] {
  const score = (entity: MapEntity) =>
    (ctx.metas.get(entity.contentId)?.meta.claims.length ? 2 : 0) +
    Math.min(3, ctx.links.get(entity.key)?.size ?? 0) +
    entity.createdAt / 1e13;
  return [...members]
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function runSubtopic(
  deps: TopicInsightsDeps,
  ctx: InsightsContext,
  plan: SubtopicPlan,
  slot: LlmRef,
  signal?: AbortSignal
): Promise<KnowledgeAiInsightsRow> {
  const { group, snapshot, row } = plan;
  const incremental = plan.tier === "incremental" && row;
  const topicLabel = topicLabelOf(ctx, group);
  const before = new Map(row?.members ?? []);
  const after = new Map(snapshot);
  const changed = new Set(
    group.members
      .filter(member => before.get(member.contentId) !== after.get(member.contentId))
      .map(member => member.key)
  );
  const memberKeys = new Set(group.members.map(member => member.key));
  const previousOpen = incremental
    ? row.result.marks.filter(
        mark =>
          mark.status === "open" &&
          mark.ends.every(end => {
            const key = `${end.ref.kind}:${end.ref.id}`;
            return memberKeys.has(key) && !changed.has(key);
          })
      )
    : [];

  let chosen = incremental
    ? group.members.filter(member => changed.has(member.key))
    : prioritize(ctx, group.members, SUBTOPIC_NOTE_LIMIT);
  const vectors =
    ctx.threshold != null
      ? loadNoteVectors(
          ctx.indexDb,
          group.members.map(member => member.key)
        )
      : new Map<string, NoteVectors>();
  const pairs =
    ctx.threshold != null
      ? pairCandidates(
          [...vectors.values()],
          isLinked(ctx),
          ctx.threshold,
          SUBTOPIC_PAIR_LIMIT,
          incremental ? changed : undefined
        )
      : [];
  // 笔记对里的笔记都要在提示词里
  const chosenKeys = new Set(chosen.map(member => member.key));
  for (const pair of pairs) {
    for (const key of [pair.left, pair.right]) {
      if (chosenKeys.has(key)) continue;
      const entity = ctx.byKey.get(key);
      if (!entity) continue;
      chosenKeys.add(key);
      chosen = [...chosen, entity];
    }
  }
  chosen.sort((a, b) => a.createdAt - b.createdAt);
  const noOf = new Map(chosen.map((entity, index) => [entity.key, index + 1]));
  const byNo = new Map(chosen.map((entity, index) => [index + 1, entity]));
  const pairPrompts: PromptPair[] = [];
  const pairInfo = new Map<
    number,
    { left: MapEntity; right: MapEntity; sections: Map<string, SectionHit> }
  >();
  pairs.forEach((pair, index) => {
    const left = ctx.byKey.get(pair.left)!;
    const right = ctx.byKey.get(pair.right)!;
    const built = buildPair(
      ctx,
      index + 1,
      { entity: left, no: noOf.get(left.key)! },
      { entity: right, no: noOf.get(right.key)! },
      vectors
    );
    pairPrompts.push(built.prompt);
    pairInfo.set(index + 1, { left, right, sections: built.sections });
  });

  const prompt = buildSubtopicPrompt({
    topic: topicLabel.split(" › ")[0],
    subtopic: group.label,
    total: group.members.length,
    notes: chosen.map(entity => promptNote(ctx, entity, noOf.get(entity.key)!)),
    pairs: pairPrompts,
    ...(incremental
      ? {
          previous: {
            overview: row.overview.overview,
            shift: row.overview.shift,
            // 移除的成员可能已经删了，只能取元信息里的标题
            removed: row.members
              .filter(([id]) => !after.has(id))
              .map(([id]) => ctx.metas.get(id)?.meta.title ?? "")
              .filter(Boolean),
            marks: previousOpen.map(describeMark),
          },
        }
      : {}),
  });
  const parsed = await callModel(
    deps,
    slot,
    SUBTOPIC_SYSTEM_PROMPT,
    prompt,
    `subtopic:${group.key}`,
    text => parseSubtopicOutput(text, new Set(byNo.keys()), new Set(pairInfo.keys())),
    signal
  ).then(value => {
    const noteTitle = (entity: MapEntity | undefined) =>
      entity ? promptNote(ctx, entity, 0).title : null;
    return fixRefsDeep(
      value,
      (prefix, no) => {
        if (!prefix) return noteTitle(byNo.get(no));
        const pair = pairInfo.get(no);
        return pair ? `《${noteTitle(pair.left)}》与《${noteTitle(pair.right)}》` : null;
      },
      "P"
    );
  });

  const marks: KnowledgeMark[] = [];
  const ends = (nos: number[]) =>
    nos.flatMap(no => {
      const entity = byNo.get(no);
      return entity ? [endpoint(ctx, entity, topicLabel)] : [];
    });
  for (const pair of parsed.pairs) {
    const info = pairInfo.get(pair.pair)!;
    marks.push({
      id: "",
      kind: pair.type,
      why: pair.why,
      ends: [info.left, info.right].map(entity =>
        endpoint(
          ctx,
          entity,
          topicLabel,
          info.sections.get(entity.key),
          pair.anchors[noOf.get(entity.key)!]
        )
      ),
      ...(pair.claims ? { claims: pair.claims } : {}),
      status: "open",
    });
  }
  if (parsed.chain) {
    const chainEnds = ends(parsed.chain.notes);
    const index = parsed.chain.notes.indexOf(parsed.chain.missingBefore);
    if (chainEnds.length >= 2 && index >= 0) {
      marks.push({
        id: "",
        kind: "chain",
        why: parsed.chain.why,
        ends: chainEnds,
        missing: { index, text: parsed.chain.missingText },
        status: "open",
      });
    }
  }
  if (parsed.pattern) {
    const patternEnds = ends(parsed.pattern.notes);
    if (patternEnds.length >= 2) {
      marks.push({
        id: "",
        kind: "pattern",
        why: parsed.pattern.why,
        ends: patternEnds,
        text: parsed.pattern.text,
        status: "open",
      });
    }
  }
  const seen = new Set<string>();
  const merged = [...previousOpen, ...marks]
    .filter(mark => {
      const key = markKey(mark);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUBTOPIC_MARK_LIMIT)
    .map((mark, index) => ({ ...mark, id: `s${index + 1}` }));

  const result: KnowledgeInsightResult = {
    ...emptyResult(),
    marks: merged,
    candidates: pairs.length,
  };
  return KnowledgeAiInsightsTable.save(
    ctx.mainDb,
    {
      scope: "subtopic",
      parentId: row?.parentId ?? null,
      projectId: null,
      label: group.label,
      members: snapshot,
      overview: { overview: parsed.overview, shift: parsed.shift },
      result,
      increments: incremental ? row.increments + 1 : 0,
      model: modelName(slot),
    },
    row?.id ?? null,
    deps.now()
  );
}

// ───────────────────────── 主题 ─────────────────────────

export async function runTopic(
  deps: TopicInsightsDeps,
  ctx: InsightsContext,
  plan: TopicPlan,
  subtopicRows: Array<{ group: MapGroup; row: KnowledgeAiInsightsRow | null }>,
  slot: LlmRef,
  signal?: AbortSignal
): Promise<KnowledgeAiInsightsRow> {
  const { topic } = plan;
  const candidates: Array<{ no: number; mark: KnowledgeMark }> = [];
  for (const { row } of subtopicRows) {
    for (const mark of row?.result.marks ?? []) {
      if (mark.status !== "open") continue;
      candidates.push({ no: candidates.length + 1, mark });
    }
  }
  const conceptCounts = new Map<string, number>();
  for (const member of topic.members) {
    for (const concept of ctx.metas.get(member.contentId)?.meta.concepts ?? []) {
      conceptCounts.set(concept, (conceptCounts.get(concept) ?? 0) + 1);
    }
  }
  const growth = growthSeries(
    topic.members.map(member => member.createdAt),
    deps.now()
  );
  const prompt = buildTopicPrompt({
    topic: topic.label,
    total: topic.members.length,
    inProjects: topic.members.filter(member => member.projectId != null).length,
    growth,
    rank: {
      position: ctx.topics.filter(other => other.members.length > topic.members.length).length + 1,
      of: ctx.topics.length,
    },
    subtopics: subtopicRows.map(({ group, row }) => ({
      label: group.label,
      total: group.members.length,
      overview: row?.overview.overview ?? "",
      shift: row?.overview.shift ?? "",
    })),
    concepts: [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOPIC_CONCEPTS)
      .map(([concept]) => concept),
    candidates: candidates.map(item => ({ no: item.no, line: describeMark(item.mark) })),
  });
  const parsed = await callModel(
    deps,
    slot,
    TOPIC_SYSTEM_PROMPT,
    prompt,
    `topic:${topic.topicId}`,
    text => parseTopicOutput(text, new Set(candidates.map(item => item.no))),
    signal
  ).then(value =>
    fixRefsDeep(
      value,
      (prefix, no) => {
        const mark = prefix === "M" ? candidates.find(item => item.no === no)?.mark : undefined;
        if (!mark) return null;
        return mark.ends.length
          ? mark.ends.map(end => `《${end.title}》`).join("与")
          : (mark.text ?? null);
      },
      "M"
    )
  );
  const byNo = new Map(candidates.map(item => [item.no, item.mark]));
  const marks: KnowledgeMark[] = [
    ...parsed.pick.flatMap(no => {
      const mark = byNo.get(no);
      return mark ? [{ ...mark }] : [];
    }),
    ...parsed.gaps.map(gap => ({
      id: "",
      kind: "gap" as const,
      why: gap.why,
      ends: [],
      text: gap.text,
      status: "open" as const,
    })),
  ].map((mark, index) => ({ ...mark, id: `t${index + 1}` }));
  const row = KnowledgeAiInsightsTable.save(
    ctx.mainDb,
    {
      scope: "topic",
      parentId: null,
      projectId: null,
      label: topic.label,
      members: plan.snapshot,
      overview: { overview: parsed.overview, shift: parsed.shift },
      result: {
        ...emptyResult(),
        lead: parsed.lead,
        marks,
        asks: parsed.asks.map((text, index) => ({ id: `q${index + 1}`, text, status: "open" })),
        growth: growth.map(item => item.count),
        candidates: candidates.length,
      },
      increments: 0,
      model: modelName(slot),
    },
    plan.row?.id ?? null,
    deps.now()
  );
  KnowledgeAiInsightsTable.setParent(
    ctx.mainDb,
    subtopicRows.flatMap(item => (item.row ? [item.row.id] : [])),
    row.id
  );
  return row;
}

// ───────────────────────── 全局 ─────────────────────────

function topicLabelOfKey(ctx: InsightsContext, key: string): string {
  const node = ctx.map.nodes.find(item => item.key === key);
  if (!node) return "";
  return ctx.map.topics.find(topic => topic.id === node.topic)?.label ?? "";
}

export async function runGlobal(
  deps: TopicInsightsDeps,
  ctx: InsightsContext,
  topicRows: Array<{ topic: MapTopicGroups; row: KnowledgeAiInsightsRow | null }>,
  slot: LlmRef,
  signal?: AbortSignal
): Promise<KnowledgeAiInsightsRow> {
  const now = deps.now();
  const linkCount = (key: string) => ctx.links.get(key)?.size ?? 0;
  const bridges =
    ctx.threshold != null
      ? await bridgeCandidates(ctx.indexDb, ctx.topics, isLinked(ctx), linkCount, ctx.threshold)
      : [];
  const asked = ctx.threshold != null ? await askedCandidates(ctx.indexDb, ctx.threshold) : [];

  const notes: MapEntity[] = [];
  const noOf = new Map<string, number>();
  const addNote = (entity: MapEntity) => {
    if (!noOf.has(entity.key)) {
      notes.push(entity);
      noOf.set(entity.key, notes.length);
    }
    return noOf.get(entity.key)!;
  };
  const vectors = loadNoteVectors(ctx.indexDb, [
    ...new Set(bridges.flatMap(pair => [pair.left, pair.right])),
  ]);
  const bridgeInfo = new Map<
    number,
    { left: MapEntity; right: MapEntity; sections: Map<string, SectionHit> }
  >();
  const bridgePrompts: PromptPair[] = [];
  for (const pair of bridges) {
    const left = ctx.byKey.get(pair.left);
    const right = ctx.byKey.get(pair.right);
    if (!left || !right) continue;
    const no = bridgePrompts.length + 1;
    const built = buildPair(
      ctx,
      no,
      { entity: left, no: addNote(left) },
      { entity: right, no: addNote(right) },
      vectors
    );
    bridgePrompts.push(built.prompt);
    bridgeInfo.set(no, { left, right, sections: built.sections });
  }
  const noteTopics: Record<number, string> = {};
  for (const entity of notes) noteTopics[noOf.get(entity.key)!] = topicLabelOfKey(ctx, entity.key);
  const day = (time: number) => {
    const date = new Date(time);
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  };
  const allMembers = ctx.topics.flatMap(topic => topic.members);
  const growth = growthSeries(
    allMembers.map(member => member.createdAt),
    now
  );
  const prompt = buildGlobalPrompt({
    totals: { notes: allMembers.length, topics: ctx.topics.length },
    growth,
    topics: topicRows.map(({ topic, row }) => ({
      label: topic.label,
      total: topic.members.length,
      recent: recentCount(
        topic.members.map(member => member.createdAt),
        now
      ),
      overview: row?.overview.overview ?? "",
      shift: row?.overview.shift ?? "",
    })),
    notes: notes.map(entity => promptNote(ctx, entity, noOf.get(entity.key)!)),
    bridges: bridgePrompts,
    noteTopics,
    asked: asked.map((group, index) => ({
      no: index + 1,
      times: group.times,
      last: day(group.last),
      prompts: group.prompts.map(prompt => prompt.text),
      near: topicLabelOfKey(ctx, group.prompts[0]?.nearestKey ?? ""),
    })),
  });
  const parsed = await callModel(
    deps,
    slot,
    GLOBAL_SYSTEM_PROMPT,
    prompt,
    "global",
    text =>
      parseGlobalOutput(
        text,
        new Set(bridgeInfo.keys()),
        new Set(asked.map((_, index) => index + 1))
      ),
    signal
  ).then(value =>
    fixRefsDeep(
      value,
      (prefix, no) => {
        const noteTitle = (entity: MapEntity) => promptNote(ctx, entity, 0).title;
        if (!prefix) {
          const entity = notes[no - 1];
          return entity ? noteTitle(entity) : null;
        }
        if (prefix === "B") {
          const info = bridgeInfo.get(no);
          return info ? `《${noteTitle(info.left)}》与《${noteTitle(info.right)}》` : null;
        }
        return prefix === "A" && asked[no - 1] ? "你问过的那几个问题" : null;
      },
      "AB"
    )
  );
  const marks: KnowledgeMark[] = [];
  for (const bridge of parsed.bridges) {
    const info = bridgeInfo.get(bridge.candidate)!;
    marks.push({
      id: "",
      kind: "bridge",
      why: bridge.why,
      ends: [info.left, info.right].map(entity =>
        endpoint(
          ctx,
          entity,
          topicLabelOfKey(ctx, entity.key),
          info.sections.get(entity.key),
          bridge.anchors[noOf.get(entity.key)!]
        )
      ),
      status: "open",
    });
  }
  for (const item of parsed.asked) {
    const group = asked[item.group - 1];
    marks.push({
      id: "",
      kind: "asked",
      why: item.why,
      ends: [],
      text: item.question,
      prompts: group.prompts.map(({ sessionId, messageId, text, time }) => ({
        sessionId,
        messageId,
        text,
        time,
      })),
      topicLabel: topicLabelOfKey(ctx, group.prompts[0]?.nearestKey ?? ""),
      status: "open",
    });
  }
  const existing = KnowledgeAiInsightsTable.list(ctx.mainDb, "global")[0] ?? null;
  return KnowledgeAiInsightsTable.save(
    ctx.mainDb,
    {
      scope: "global",
      parentId: null,
      projectId: null,
      label: "",
      members: [],
      overview: { overview: parsed.lead, shift: "" },
      result: {
        ...emptyResult(),
        lead: parsed.lead,
        marks: marks.map((mark, index) => ({ ...mark, id: `g${index + 1}` })),
        asks: parsed.asks.map((text, index) => ({ id: `q${index + 1}`, text, status: "open" })),
        growth: growth.map(item => item.count),
        candidates: bridges.length + asked.length,
      },
      increments: 0,
      model: modelName(slot),
    },
    existing?.id ?? null,
    now
  );
}

// ───────────────────────── 一轮分析 ─────────────────────────

export interface AnalyzeOptions {
  /** 用户点按钮：全局不受 6 小时限制，调用失败直接报错 */
  force: boolean;
  onPhase?: (phase: KnowledgeInsightsPhase) => void;
  signal?: AbortSignal;
  /** 后台每次调用前检查：切库、换槽后返回 true 停止 */
  stale?: () => boolean;
}

export interface AnalyzeOutcome {
  subtopics: number;
  topics: number;
  global: boolean;
  failures: number;
}

export async function analyzeKnowledge(
  deps: TopicInsightsDeps,
  ctx: InsightsContext,
  slot: LlmRef,
  options: AnalyzeOptions
): Promise<AnalyzeOutcome> {
  const plan = planInsights(ctx);
  for (const id of plan.orphans) KnowledgeAiInsightsTable.delete(ctx.mainDb, id);
  const staleTopics = plan.topics.filter(
    topic =>
      topic.subtopics.some(sub => sub.tier === "full" || sub.tier === "incremental") ||
      topicNeedsWork(topic, false)
  );
  options.onPhase?.({
    phase: "reading",
    topics: plan.topics.length,
    stale: staleTopics.length,
    notes: plan.topics.reduce((sum, topic) => sum + topic.topic.members.length, 0),
  });
  const outcome: AnalyzeOutcome = { subtopics: 0, topics: 0, global: false, failures: 0 };
  let consecutive = 0;
  const attempt = async <T>(run: () => Promise<T>): Promise<T | null> => {
    if (options.stale?.()) return null;
    try {
      const value = await run();
      consecutive = 0;
      return value;
    } catch (error) {
      if (options.force || options.signal?.aborted) throw error;
      outcome.failures++;
      consecutive++;
      log.warn(`[TopicInsights] 调用失败：${error instanceof Error ? error.message : error}`);
      return null;
    }
  };
  const topicResults: Array<{ topic: MapTopicGroups; row: KnowledgeAiInsightsRow | null }> = [];
  let thinkingSent = false;
  const thinking = () => {
    if (thinkingSent) return;
    thinkingSent = true;
    options.onPhase?.({ phase: "thinking" });
  };
  for (const topicPlan of plan.topics) {
    if (consecutive >= ABORT_AFTER_FAILURES || options.stale?.()) break;
    const subRows: Array<{ group: MapGroup; row: KnowledgeAiInsightsRow | null }> = [];
    let changed = false;
    for (const sub of topicPlan.subtopics) {
      if (sub.tier === "full" || sub.tier === "incremental") {
        thinking();
        const row = await attempt(() => runSubtopic(deps, ctx, sub, slot, options.signal));
        if (row) {
          outcome.subtopics++;
          changed = true;
          subRows.push({ group: sub.group, row });
          continue;
        }
      } else if (sub.row && sub.row.label !== sub.group.label) {
        KnowledgeAiInsightsTable.updateMembers(
          ctx.mainDb,
          sub.row.id,
          sub.row.members,
          sub.group.label,
          sub.row.parentId
        );
      }
      subRows.push({ group: sub.group, row: sub.row });
    }
    let topicRow = topicPlan.row;
    if (topicNeedsWork(topicPlan, changed) && consecutive < ABORT_AFTER_FAILURES) {
      thinking();
      const row = await attempt(() =>
        runTopic(deps, ctx, topicPlan, subRows, slot, options.signal)
      );
      if (row) {
        outcome.topics++;
        topicRow = row;
      }
    }
    topicResults.push({ topic: topicPlan.topic, row: topicRow });
  }
  const globalRow = KnowledgeAiInsightsTable.list(ctx.mainDb, "global")[0] ?? null;
  const due =
    !globalRow ||
    (outcome.topics > 0 &&
      (options.force || deps.now() - globalRow.updateTime >= GLOBAL_MIN_INTERVAL_MS));
  if (due && consecutive < ABORT_AFTER_FAILURES && !options.stale?.()) {
    thinking();
    const row = await attempt(() => runGlobal(deps, ctx, topicResults, slot, options.signal));
    outcome.global = !!row;
  }
  options.onPhase?.({ phase: "done" });
  return outcome;
}

// ───────────────────────── 读结果 ─────────────────────────

const toNode = (row: KnowledgeAiInsightsRow, topicId: number | null, label?: string) => ({
  id: row.id,
  scope: row.scope,
  parentId: row.parentId,
  projectId: row.projectId,
  label: label ?? row.label,
  topicId,
  result: row.result,
  model: row.model,
  updateTime: row.updateTime,
});

export function readKnowledgeInsights(
  ctx: InsightsContext | null,
  mainDb: Database.Database,
  state: { configured: boolean; running: boolean }
): KnowledgeInsightsPayload {
  const rows = KnowledgeAiInsightsTable.list(mainDb);
  const globalRow = rows.find(row => row.scope === "global") ?? null;
  if (!ctx) {
    return {
      ...state,
      coverage: 0,
      global: globalRow ? toNode(globalRow, null) : null,
      topics: [],
    };
  }
  const topicRows = rows.filter(row => row.scope === "topic");
  // 展示时宽一点对回当前主题：结果比地图旧时也能画到对应的位置
  const matched = matchRows(
    topicRows,
    ctx.topics,
    topic => topic.members.map(member => [member.contentId, ""] as [number, string]),
    0.5
  );
  return {
    ...state,
    coverage: metaCoverage(ctx),
    global: globalRow ? toNode(globalRow, null) : null,
    topics: [...matched.entries()].map(([topic, row]) => toNode(row, topic.topicId, topic.label)),
  };
}
