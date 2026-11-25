import { PluginSyncResetRequiredError } from "./errors";

export const DATA_CHANGE_DOMAINS = ["todo", "todo-list", "event", "calendar"] as const;
export type PluginChangeDomain = (typeof DATA_CHANGE_DOMAINS)[number];
export interface PluginChangesQuery {
  domains: PluginChangeDomain[];
  /** 缺省只读独立待办；all 包含正文待办。 */
  todoSource?: "todo" | "document" | "all";
  cursor?: string;
  limit?: number;
}
export interface PluginDataChange {
  domain: PluginChangeDomain;
  id: string;
  operation: "upsert" | "delete";
}
export interface PluginChangesPage {
  mode: "snapshot" | "changes";
  items: PluginDataChange[];
  cursor: string;
  hasMore: boolean;
  /** 只在本轮完整结束时提供；插件处理成功后才能保存。 */
  checkpoint?: string;
}

/** 宿主数据层原语；每次调用在一个短事务内返回水位与分页结果。 */
export interface DataChangesReadRequest {
  todoSource?: "todo" | "document" | "all";
  phase: "snapshot" | "changes";
  domains: PluginChangeDomain[];
  afterDomain: string;
  afterKey: number;
  afterSeq: number;
  through?: number;
  limit: number;
}
export interface DataChangesReadPage {
  todoSource?: "todo" | "document" | "all";
  scope: string;
  protocol: number;
  head: number;
  floor: number;
  through: number;
  items: (PluginDataChange & { key?: number; seq?: number })[];
  hasMore: boolean;
}
interface Cursor {
  version: 1;
  binding: string;
  scope: string;
  phase: "snapshot" | "catchup" | "changes" | "checkpoint";
  baseline: number;
  afterDomain: string;
  afterKey: number;
  afterSeq: number;
  through?: number;
}

const position = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

export function normalizeChangesQuery(
  query: PluginChangesQuery
): PluginChangesQuery & { limit: number } {
  if (!query || !Array.isArray(query.domains) || !query.domains.length || query.domains.length > 4)
    throw new Error("请指定待办、日程或目录的业务域");
  if (query.domains.some(domain => !DATA_CHANGE_DOMAINS.includes(domain)))
    throw new Error("不支持的业务变更域");
  if (query.todoSource !== undefined && !["todo", "document", "all"].includes(query.todoSource))
    throw new Error("待办来源无效");
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("每页须为 1–100 条");
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== "string" || query.cursor.length > 8192)
  )
    throw new PluginSyncResetRequiredError("invalid-cursor");
  return {
    domains: [...new Set(query.domains)].sort(),
    todoSource: query.todoSource ?? "todo",
    limit,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  };
}

function decode(raw: string, binding: string, domains: readonly string[]): Cursor {
  let value: Cursor;
  try {
    value = JSON.parse(raw) as Cursor;
    if (
      !value ||
      value.version !== 1 ||
      !["snapshot", "catchup", "changes", "checkpoint"].includes(value.phase) ||
      typeof value.scope !== "string" ||
      !value.scope ||
      !position(value.baseline) ||
      !position(value.afterSeq) ||
      !position(value.afterKey) ||
      !["", ...domains].includes(value.afterDomain) ||
      (value.through !== undefined && (!position(value.through) || value.afterSeq > value.through))
    )
      throw new Error();
  } catch {
    throw new PluginSyncResetRequiredError("invalid-cursor");
  }
  if (value.binding !== binding) throw new PluginSyncResetRequiredError("query-changed");
  return value;
}

/** 两端共用状态机；SQL、连接、清理和本机代次由各自数据层负责。 */
export async function queryDataChanges(
  query: PluginChangesQuery,
  ownerBinding: string,
  read: (request: DataChangesReadRequest) => Promise<DataChangesReadPage>
): Promise<PluginChangesPage> {
  const input = normalizeChangesQuery(query);
  const binding = JSON.stringify([ownerBinding, input.domains, input.todoSource]);
  let cursor =
    input.cursor === undefined ? undefined : decode(input.cursor, binding, input.domains);
  if (cursor?.phase === "checkpoint") cursor = { ...cursor, phase: "changes", through: undefined };
  const snapshot = !cursor || cursor.phase === "snapshot";
  const raw = await read({
    phase: snapshot ? "snapshot" : "changes",
    todoSource: input.todoSource,
    domains: input.domains,
    limit: input.limit,
    afterDomain: cursor?.afterDomain ?? "",
    afterKey: cursor?.afterKey ?? 0,
    afterSeq: cursor?.afterSeq ?? 0,
    ...(cursor?.through === undefined ? {} : { through: cursor.through }),
  });
  if (input.todoSource !== "todo" && raw.todoSource !== input.todoSource)
    throw new Error("当前宿主未完整支持正文待办变化流");
  if (raw.protocol !== 1) throw new PluginSyncResetRequiredError("protocol-changed");
  if (![raw.head, raw.floor, raw.through].every(position) || raw.floor > raw.head || !raw.scope)
    throw new Error("宿主变更水位无效");
  if (cursor && cursor.scope !== raw.scope) throw new PluginSyncResetRequiredError("scope-changed");
  if (
    cursor &&
    (cursor.baseline > raw.head || cursor.afterSeq > raw.head || (cursor.through ?? 0) > raw.head)
  )
    throw new PluginSyncResetRequiredError("history-replaced");
  if (raw.through > raw.head) throw new Error("宿主变更上界无效");
  if (cursor && raw.floor > (snapshot ? cursor.baseline : cursor.afterSeq))
    throw new PluginSyncResetRequiredError("history-expired");
  const state: Cursor = cursor ?? {
    version: 1,
    binding,
    scope: raw.scope,
    phase: "snapshot",
    baseline: raw.head,
    afterDomain: "",
    afterKey: 0,
    afterSeq: raw.head,
  };
  const items = raw.items.map(({ domain, id, operation }) => ({ domain, id, operation }));
  const mode = state.phase === "changes" ? "changes" : "snapshot";
  const finish = (head: number): PluginChangesPage => {
    const checkpoint = JSON.stringify({
      ...state,
      phase: "checkpoint",
      baseline: head,
      afterSeq: head,
      afterDomain: "",
      afterKey: 0,
      through: undefined,
    });
    return { mode, items, cursor: checkpoint, checkpoint, hasMore: false };
  };
  if (snapshot) {
    const last = raw.items.at(-1);
    if (last) {
      if (!position(last.key)) throw new Error("宿主全量分页位置无效");
      state.afterDomain = last.domain;
      state.afterKey = last.key;
    }
    if (raw.hasMore) {
      if (!last) throw new Error("宿主返回了无法推进的分页");
      return { mode, items, cursor: JSON.stringify(state), hasMore: true };
    }
    if (raw.head === state.baseline) return finish(raw.head);
    return {
      mode,
      items,
      cursor: JSON.stringify({
        ...state,
        phase: "catchup",
        afterSeq: state.baseline,
        through: raw.head,
      }),
      hasMore: true,
    };
  }
  if (!raw.hasMore) return finish(raw.through);
  const last = raw.items.at(-1);
  if (!last || !position(last.seq) || last.seq <= state.afterSeq || last.seq > raw.through)
    throw new Error("宿主增量分页位置无效");
  return {
    mode,
    items,
    cursor: JSON.stringify({ ...state, afterSeq: last.seq, through: raw.through }),
    hasMore: true,
  };
}
