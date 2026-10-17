/**
 * 摘录提供方的写入参数校验：插件经宿主发来的来源与条目。纯函数，主进程写库前调用。
 *
 * 参数来自渲染端，一律当不可信输入：字段类型、长度与条数有上限，超出整批拒绝；外链只收 http(s)。
 */

import { WEB_EXCERPT_SOURCE, type ExcerptAnchor, type ExcerptInput } from "./types";

export const PROVIDER_LIMITS = {
  items: 20000,
  idChars: 512,
  titleChars: 500,
  labelChars: 100,
  quoteChars: 20000,
  noteChars: 20000,
  locationChars: 500,
  urlChars: 4000,
  colorChars: 50,
  anchorChars: 8000,
} as const;

export interface ProviderSource {
  key: string;
  title: string;
  url: string | null;
}

export interface ProviderChange {
  upsert: ExcerptInput[];
  remove: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`摘录字段 ${field} 不能为空`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`摘录字段 ${field} 必须是字符串`);
  if (value.length > max) throw new Error(`摘录字段 ${field} 超过 ${max} 字`);
  if (required && !value.trim()) throw new Error(`摘录字段 ${field} 不能为空`);
  return value;
}

function httpUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const url = text(value, field, PROVIDER_LIMITS.urlChars);
  try {
    const { protocol } = new URL(url);
    if (protocol === "http:" || protocol === "https:") return url;
  } catch {
    // 落到下方统一报错
  }
  throw new Error(`摘录字段 ${field} 必须是 http(s) 地址`);
}

/** 按键名排序序列化，使字段顺序不同的同一定位比较相等 */
export function canonicalAnchor(anchor: ExcerptAnchor | null): string | null {
  if (!anchor) return null;
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sort(value[key])])
    );
  };
  return JSON.stringify(sort(anchor));
}

function anchorOf(value: unknown): ExcerptAnchor | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("摘录字段 anchor 必须是对象");
  const serialized = JSON.stringify(value);
  if (serialized.length > PROVIDER_LIMITS.anchorChars)
    throw new Error(`摘录字段 anchor 超过 ${PROVIDER_LIMITS.anchorChars} 字`);
  return JSON.parse(serialized) as ExcerptAnchor;
}

/** 插件 ID 即来源类型；内置提供方的名称保留 */
export function assertProviderSourceType(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value))
    throw new Error("摘录来源类型无效");
  if (value === WEB_EXCERPT_SOURCE) throw new Error("摘录来源类型为内置保留名");
}

export function parseProviderLabel(value: unknown): string {
  return text(value, "label", PROVIDER_LIMITS.labelChars, true).trim();
}

export function parseProviderSource(raw: unknown): ProviderSource {
  if (!isRecord(raw)) throw new Error("摘录来源必须是对象");
  return {
    key: text(raw.key, "source.key", PROVIDER_LIMITS.idChars, true),
    title: text(raw.title, "source.title", PROVIDER_LIMITS.titleChars),
    url: httpUrl(raw.url, "source.url"),
  };
}

function parseItem(raw: unknown, source: ProviderSource): ExcerptInput {
  if (!isRecord(raw)) throw new Error("摘录条目必须是对象");
  const time = raw.time;
  if (time !== undefined && time !== null && (typeof time !== "number" || !Number.isFinite(time)))
    throw new Error("摘录字段 time 必须是有限数字");
  return {
    externalId: text(raw.externalId, "externalId", PROVIDER_LIMITS.idChars, true),
    quote: text(raw.quote, "quote", PROVIDER_LIMITS.quoteChars, true).trim(),
    note: text(raw.note, "note", PROVIDER_LIMITS.noteChars).trim(),
    location: text(raw.location, "location", PROVIDER_LIMITS.locationChars).trim(),
    url: httpUrl(raw.url, "url") ?? source.url,
    anchor: anchorOf(raw.anchor),
    color:
      raw.color === undefined || raw.color === null
        ? null
        : text(raw.color, "color", PROVIDER_LIMITS.colorChars),
    sourceTime: typeof time === "number" ? Math.trunc(time) : null,
  };
}

function parseItems(raw: unknown, source: ProviderSource, field: string): ExcerptInput[] {
  if (!Array.isArray(raw)) throw new Error(`${field} 必须是数组`);
  if (raw.length > PROVIDER_LIMITS.items)
    throw new Error(`单次写入的摘录超过 ${PROVIDER_LIMITS.items} 条`);
  const seen = new Set<string>();
  return raw.map(item => {
    const input = parseItem(item, source);
    if (seen.has(input.externalId)) throw new Error(`摘录 externalId 重复：${input.externalId}`);
    seen.add(input.externalId);
    return input;
  });
}

export function parseProviderItems(raw: unknown, source: ProviderSource): ExcerptInput[] {
  return parseItems(raw, source, "items");
}

export function parseProviderChange(raw: unknown, source: ProviderSource): ProviderChange {
  if (!isRecord(raw)) throw new Error("摘录增量必须是对象");
  const upsert = raw.upsert === undefined ? [] : parseItems(raw.upsert, source, "upsert");
  const remove = raw.remove === undefined ? [] : raw.remove;
  if (!Array.isArray(remove)) throw new Error("remove 必须是数组");
  if (upsert.length + remove.length > PROVIDER_LIMITS.items)
    throw new Error(`单次写入的摘录超过 ${PROVIDER_LIMITS.items} 条`);
  const removed = remove.map(id => text(id, "remove", PROVIDER_LIMITS.idChars, true));
  if (removed.some(id => upsert.some(item => item.externalId === id)))
    throw new Error("同一条摘录不能同时写入与删除");
  return { upsert, remove: removed };
}
