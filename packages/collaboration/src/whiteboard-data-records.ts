import type * as Y from "yjs";
import { assertWhiteboardJson, WHITEBOARD_RECORD_PREFIX } from "./whiteboard-contract";
import { sharedValueEquals } from "./shared-values";
import type { WhiteboardData } from "./whiteboard-types";
import type { WhiteboardJson } from "./whiteboard-contract";

type DataRecord = Record<string, WhiteboardJson> & { id: string };
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const recordKey = (path: string[]) => WHITEBOARD_RECORD_PREFIX + JSON.stringify(path);

function records(value: unknown): DataRecord[] {
  if (!Array.isArray(value)) throw new Error("记录字段必须是数组");
  assertWhiteboardJson(value);
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || Array.isArray(entry) || !identifier(entry.id) || ids.has(entry.id))
      throw new Error("记录身份无效或重复");
    ids.add(entry.id);
  }
  return value;
}

/** 初始数组不回写；差异落在已有 data 根，旧文档首次并发编辑也不会竞争新建共享根。 */
export function patchWhiteboardRecords(
  data: Y.Map<unknown>,
  field: string,
  before: readonly WhiteboardData[],
  after: readonly WhiteboardData[],
  deletionId: string
): void {
  if (!identifier(field) || !identifier(deletionId)) throw new Error("记录字段或删除身份无效");
  const previous = new Map(records(before).map(entry => [entry.id, entry]));
  const next = new Map(records(after).map(entry => [entry.id, entry]));
  for (const key of previous.keys())
    if (!next.has(key)) data.set(recordKey([field, key, "delete", deletionId]), true);
  for (const [id, entry] of next) {
    const old = previous.get(id);
    if (!old) data.set(recordKey([field, id]), true);
    for (const property of new Set([...Object.keys(old ?? {}), ...Object.keys(entry)])) {
      if (property === "id" || sharedValueEquals(old?.[property], entry[property])) continue;
      data.set(
        recordKey([field, id, property]),
        Object.hasOwn(entry, property) ? [structuredClone(entry[property])] : []
      );
    }
  }
}

export function hasWhiteboardRecords(data: Y.Map<unknown>, field: string): boolean {
  const prefix = WHITEBOARD_RECORD_PREFIX + JSON.stringify([field]).slice(0, -1) + ",";
  return [...data.keys()].some(key => key.startsWith(prefix));
}

/** 只有显式记录命令具有字段级合并语义，其他嵌套 JSON 仍按顶层属性竞争。 */
export function readWhiteboardData(
  data: Y.Map<unknown>,
  validateField?: (field: string) => void
): Record<string, WhiteboardJson> {
  const result: Record<string, WhiteboardJson> = {};
  const fields = new Map<string, Array<{ path: string[]; value: unknown }>>();
  for (const [key, value] of data) {
    if (!key.startsWith(WHITEBOARD_RECORD_PREFIX)) {
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      continue;
    }
    const path: unknown = JSON.parse(key.slice(WHITEBOARD_RECORD_PREFIX.length));
    if (
      !Array.isArray(path) ||
      ![2, 3, 4].includes(path.length) ||
      !identifier(path[0]) ||
      !identifier(path[1]) ||
      (path.length === 3 && (typeof path[2] !== "string" || path[2] === "id")) ||
      (path.length === 4 && (path[2] !== "delete" || !identifier(path[3]))) ||
      recordKey(path) !== key
    )
      throw new Error("记录差异路径无效");
    assertWhiteboardJson({ [path[0]]: null });
    const entries = fields.get(path[0]) ?? [];
    entries.push({ path, value });
    fields.set(path[0], entries);
  }
  for (const [field, entries] of fields) {
    validateField?.(field);
    const initial = records(Object.hasOwn(result, field) ? result[field] : []);
    const byId = new Map(initial.map(entry => [entry.id, { ...entry }]));
    const present = new Map<string, boolean>();
    const deleted = new Set<string>();
    for (const { path, value } of entries) {
      if (path.length === 4) {
        if (value !== true) throw new Error("记录删除标记无效");
        deleted.add(path[1]);
      }
      if (path.length !== 2) continue;
      if (typeof value !== "boolean") throw new Error("记录可见性无效");
      present.set(path[1], value);
      if (value && !byId.has(path[1])) byId.set(path[1], { id: path[1] });
    }
    for (const { path, value } of entries) {
      if (path.length !== 3) continue;
      assertWhiteboardJson({ [path[2]]: value });
      if (!Array.isArray(value) || value.length > 1) throw new Error("记录属性差异无效");
      const entry = byId.get(path[1]);
      // 新增撤销只隐藏成员，另一端的属性仍可保留，重做后重新合成。
      if (!entry) continue;
      if (value.length)
        Object.defineProperty(entry, path[2], {
          value: value[0],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      else delete entry[path[2]];
    }
    const baseIds = new Set(initial.map(entry => entry.id));
    const ids = [
      ...initial.map(entry => entry.id),
      ...[...byId.keys()].filter(id => !baseIds.has(id)).sort(),
    ];
    const values = ids
      .filter(id => present.get(id) !== false && !deleted.has(id))
      .map(id => {
        const entry = byId.get(id);
        if (!entry) throw new Error("记录身份缺少属性");
        return entry;
      });
    if (values.length) result[field] = values;
    else delete result[field];
  }
  return result;
}
