/**
 * 主题与全局层的 AI 洞见、项目回顾（主库 knowledge_ai_insights）。
 *
 * 一行 = 一个子主题 / 主题 / 全局 / 项目回顾的生成结果。主题编号每次整体重算都会重排，不能当身份：
 * 行有自己的 id，并存一份成员快照 [[contentId, 元信息指纹]]，地图重算后按成员重合度对回旧行（KL-062）。
 * 只由主进程 topic-insights 写入；重新生成时继承已处理的状态，「不相关」的不再出现。
 */

import type Database from "better-sqlite3";
import type { InsightAsk, InsightStatus } from "@/types/content-insights";
import type {
  KnowledgeInsightResult,
  KnowledgeInsightScope,
  KnowledgeMark,
  KnowledgeOverview,
} from "@/types/knowledge-insights";

/** 成员快照：[contentId, 元信息指纹]；没有元信息的成员指纹为空串 */
export type MemberSnapshot = Array<[number, string]>;

export interface KnowledgeAiInsightsRow {
  id: number;
  scope: KnowledgeInsightScope;
  parentId: number | null;
  projectId: number | null;
  label: string;
  members: MemberSnapshot;
  overview: KnowledgeOverview;
  result: KnowledgeInsightResult;
  increments: number;
  model: string;
  createTime: number;
  updateTime: number;
}

export interface KnowledgeAiInsightsInput {
  scope: KnowledgeInsightScope;
  parentId: number | null;
  projectId: number | null;
  label: string;
  members: MemberSnapshot;
  overview: KnowledgeOverview;
  result: KnowledgeInsightResult;
  increments: number;
  model: string;
}

interface RawRow {
  id: number;
  scope: string;
  parent_id: number | null;
  project_id: number | null;
  label: string;
  members: string;
  overview: string;
  result: string;
  increments: number;
  model: string;
  create_time: number;
  update_time: number;
}

const STATUSES: ReadonlySet<string> = new Set(["open", "linked", "questioned", "dismissed"]);

export const emptyResult = (): KnowledgeInsightResult => ({
  lead: "",
  marks: [],
  asks: [],
  growth: [],
  candidates: 0,
  dismissed: [],
});

const parseJson = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

function parseResult(raw: string): KnowledgeInsightResult {
  const value = parseJson<Partial<KnowledgeInsightResult>>(raw, {});
  return {
    lead: typeof value.lead === "string" ? value.lead : "",
    marks: Array.isArray(value.marks) ? value.marks : [],
    asks: Array.isArray(value.asks) ? value.asks : [],
    growth: Array.isArray(value.growth) ? value.growth.map(Number) : [],
    candidates: Number(value.candidates) || 0,
    dismissed: Array.isArray(value.dismissed) ? value.dismissed.map(String) : [],
  };
}

function parseMembers(raw: string): MemberSnapshot {
  const value = parseJson<unknown[]>(raw, []);
  if (!Array.isArray(value)) return [];
  return value.flatMap(item =>
    Array.isArray(item) && Number.isSafeInteger(Number(item[0]))
      ? [[Number(item[0]), String(item[1] ?? "")] as [number, string]]
      : []
  );
}

function parseOverview(raw: string): KnowledgeOverview {
  const value = parseJson<Partial<KnowledgeOverview>>(raw, {});
  return {
    overview: typeof value.overview === "string" ? value.overview : "",
    shift: typeof value.shift === "string" ? value.shift : "",
  };
}

const toRow = (row: RawRow): KnowledgeAiInsightsRow => ({
  id: row.id,
  scope: row.scope as KnowledgeInsightScope,
  parentId: row.parent_id,
  projectId: row.project_id,
  label: row.label,
  members: parseMembers(row.members),
  overview: parseOverview(row.overview),
  result: parseResult(row.result),
  increments: row.increments,
  model: row.model,
  createTime: row.create_time,
  updateTime: row.update_time,
});

/**
 * 同一条标记在两次生成之间的身份：类型 + 涉及的正文（排序后）；
 * 不涉及笔记的（问了没写、还缺、还薄）用文字，项目回顾带上落在哪一支。
 */
export function markKey(mark: Pick<KnowledgeMark, "kind" | "ends" | "text" | "under">): string {
  const contents = mark.ends.map(end => end.contentId).sort((a, b) => a - b);
  const tail = contents.length ? contents.join(",") : (mark.text ?? "").trim();
  return `${mark.kind}\u0000${mark.under ?? ""}\u0000${tail}`;
}

/**
 * 新结果继承旧结果里已处理的状态；不相关过的从新结果里拿掉，并把身份带下去，
 * 这样即使中间某一轮没再提出，以后再提出时也不会重新出现。
 */
export function mergeResults(
  previous: KnowledgeInsightResult | null,
  next: KnowledgeInsightResult
): KnowledgeInsightResult {
  const dismissed = new Set([...(previous?.dismissed ?? []), ...next.dismissed]);
  const statuses = new Map<string, InsightStatus>();
  for (const mark of previous?.marks ?? []) {
    const key = markKey(mark);
    if (mark.status === "dismissed") dismissed.add(key);
    else statuses.set(key, mark.status);
  }
  const askStatuses = new Map((previous?.asks ?? []).map(ask => [ask.text, ask.status]));
  return {
    ...next,
    marks: next.marks
      .filter(mark => !dismissed.has(markKey(mark)))
      .map(mark => ({ ...mark, status: statuses.get(markKey(mark)) ?? mark.status })),
    asks: next.asks.map(ask => ({ ...ask, status: askStatuses.get(ask.text) ?? ask.status })),
    dismissed: [...dismissed],
  };
}

/** 两份成员快照按正文的 Jaccard 重合度（主题身份对应用） */
export function memberOverlap(a: MemberSnapshot, b: MemberSnapshot): number {
  if (a.length === 0 && b.length === 0) return 1;
  const left = new Set(a.map(([id]) => id));
  const right = new Set(b.map(([id]) => id));
  let both = 0;
  for (const id of left) if (right.has(id)) both++;
  return both / (left.size + right.size - both);
}

/** 变化量：新增、移除与元信息重新生成过的成员数 / 原成员数（KL-062 的三档按它判断） */
export function memberChange(previous: MemberSnapshot, next: MemberSnapshot): number {
  if (previous.length === 0) return next.length ? Infinity : 0;
  const before = new Map(previous);
  const after = new Map(next);
  let changed = 0;
  for (const [id, digest] of after) {
    if (!before.has(id) || before.get(id) !== digest) changed++;
  }
  for (const id of before.keys()) if (!after.has(id)) changed++;
  return changed / previous.length;
}

export default class KnowledgeAiInsightsTable {
  static get(db: Database.Database, id: number): KnowledgeAiInsightsRow | null {
    const row = db.prepare(`SELECT * FROM knowledge_ai_insights WHERE id = ?`).get(id) as
      RawRow | undefined;
    return row ? toRow(row) : null;
  }

  static list(db: Database.Database, scope?: KnowledgeInsightScope): KnowledgeAiInsightsRow[] {
    const rows = (
      scope
        ? db.prepare(`SELECT * FROM knowledge_ai_insights WHERE scope = ? ORDER BY id`).all(scope)
        : db.prepare(`SELECT * FROM knowledge_ai_insights ORDER BY id`).all()
    ) as RawRow[];
    return rows.map(toRow);
  }

  static getProject(db: Database.Database, projectId: number): KnowledgeAiInsightsRow | null {
    const row = db
      .prepare(`SELECT * FROM knowledge_ai_insights WHERE scope = 'project' AND project_id = ?`)
      .get(projectId) as RawRow | undefined;
    return row ? toRow(row) : null;
  }

  /**
   * 写入一次生成：给了 id 就覆盖那一行（继承已处理的状态，create_time 不变），否则新建。
   */
  static save(
    db: Database.Database,
    input: KnowledgeAiInsightsInput,
    id: number | null = null,
    now = Date.now()
  ): KnowledgeAiInsightsRow {
    const previous = id != null ? this.get(db, id) : null;
    const result = mergeResults(previous?.result ?? null, input.result);
    const values = [
      input.scope,
      input.parentId,
      input.projectId,
      input.label,
      JSON.stringify(input.members),
      JSON.stringify(input.overview),
      JSON.stringify(result),
      input.increments,
      input.model,
    ];
    if (previous) {
      db.prepare(
        `UPDATE knowledge_ai_insights SET scope = ?, parent_id = ?, project_id = ?, label = ?,
           members = ?, overview = ?, result = ?, increments = ?, model = ?, update_time = ?
         WHERE id = ?`
      ).run(...values, now, previous.id);
      return this.get(db, previous.id)!;
    }
    const info = db
      .prepare(
        `INSERT INTO knowledge_ai_insights
           (scope, parent_id, project_id, label, members, overview, result, increments, model, create_time, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...values, now, now);
    return this.get(db, Number(info.lastInsertRowid))!;
  }

  /** 只换成员快照与主题名（变化很小时保留原结果，只记下现在的成员） */
  static updateMembers(
    db: Database.Database,
    id: number,
    members: MemberSnapshot,
    label: string,
    parentId: number | null
  ): void {
    db.prepare(
      `UPDATE knowledge_ai_insights SET members = ?, label = ?, parent_id = ? WHERE id = ?`
    ).run(JSON.stringify(members), label, parentId, id);
  }

  /** 子主题行挂到所属主题行下（主题行可能晚于子主题生成） */
  static setParent(db: Database.Database, ids: number[], parentId: number): void {
    const update = db.prepare(`UPDATE knowledge_ai_insights SET parent_id = ? WHERE id = ?`);
    for (const id of ids) update.run(parentId, id);
  }

  /** 改一条标记或问题的处理状态；找不到返回 false（结果已被重新生成替换） */
  static setStatus(
    db: Database.Database,
    id: number,
    itemId: string,
    status: InsightStatus
  ): boolean {
    if (!STATUSES.has(status)) throw new Error(`未知的处理状态：${status}`);
    return db.transaction(() => {
      const row = this.get(db, id);
      if (!row) return false;
      let found = false;
      const dismissed = new Set(row.result.dismissed);
      const marks = row.result.marks.map(mark => {
        if (mark.id !== itemId) return mark;
        found = true;
        if (status === "dismissed") dismissed.add(markKey(mark));
        return { ...mark, status };
      });
      const asks = row.result.asks.map((ask: InsightAsk) => {
        if (ask.id !== itemId) return ask;
        found = true;
        return { ...ask, status };
      });
      if (!found) return false;
      // 只改状态，不动 update_time：它表示生成时间
      db.prepare(`UPDATE knowledge_ai_insights SET result = ? WHERE id = ?`).run(
        JSON.stringify({ ...row.result, marks, asks, dismissed: [...dismissed] }),
        id
      );
      return true;
    })();
  }

  static delete(db: Database.Database, id: number): void {
    db.prepare(`DELETE FROM knowledge_ai_insights WHERE id = ? OR parent_id = ?`).run(id, id);
  }

  /** 项目已删除的回顾、成员全部已不存在的主题行 */
  static removeOrphans(db: Database.Database): number {
    let removed = db
      .prepare(
        `DELETE FROM knowledge_ai_insights WHERE scope = 'project'
           AND NOT EXISTS (SELECT 1 FROM project p WHERE p.id = knowledge_ai_insights.project_id)`
      )
      .run().changes;
    const exists = db.prepare(`SELECT 1 FROM contents WHERE id = ?`);
    for (const row of this.list(db)) {
      if (row.scope !== "subtopic" && row.scope !== "topic") continue;
      if (row.members.length === 0) continue;
      if (row.members.some(([contentId]) => exists.get(contentId))) continue;
      this.delete(db, row.id);
      removed++;
    }
    return removed;
  }
}
