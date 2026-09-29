/**
 * 用量跨设备同步的分段打包（主进程侧，纯函数 + store，不碰网络）。
 *
 * 分段 = 某设备某个 UTC 月的全部事件：按 event_id 升序逐行 JSON（ndjson），gzip 后上传；
 * 哈希取未压缩内容的 sha256，本地 / 远端比对它决定要不要传。
 * 远端内容当作不可信输入：逐行校验字段类型、设备 id 与月份范围，不合格的行丢弃。
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  ModelUsageCostSource,
  ModelUsageEvent,
  ModelUsageKind,
  ModelUsageStatus,
  UsageSegmentInfo,
} from "@/types/model-usage";
import type { ModelUsageStore } from "./store";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** 单个分段解压后的上限：防止远端塞进超大文件把内存打满 */
const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;

export const monthOf = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function monthRange(month: string): { from: number; to: number } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error(`无效的月份：${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { from: Date.UTC(year, index, 1), to: Date.UTC(year, index + 1, 1) };
}

export const isValidMonth = (month: unknown): month is string =>
  typeof month === "string" && MONTH_PATTERN.test(month);

/** 设备 id 是本机生成的 ULID；远端给的 id 也按这个格式校验，避免拼进路径时越界 */
export const isValidDeviceId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);

/** 固定字段顺序序列化：同一批事件在任何设备上得到同一个哈希 */
const serializeEvent = (event: ModelUsageEvent) =>
  JSON.stringify({
    eventId: event.eventId,
    ts: event.ts,
    deviceId: event.deviceId,
    library: event.library,
    kind: event.kind,
    providerId: event.providerId,
    providerName: event.providerName,
    model: event.model,
    feature: event.feature,
    scope: event.scope,
    sessionId: event.sessionId,
    entityId: event.entityId,
    status: event.status,
    errorMessage: event.errorMessage,
    latencyMs: event.latencyMs,
    ttftMs: event.ttftMs,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheReadTokens: event.cacheReadTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    reasoningTokens: event.reasoningTokens,
    totalTokens: event.totalTokens,
    units: event.units,
    cost: event.cost,
    costSource: event.costSource,
  });

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function buildNdjson(store: ModelUsageStore, deviceId: string, month: string) {
  const { from, to } = monthRange(month);
  const lines: string[] = [];
  for (const event of store.iterateDevice(deviceId, from, to)) lines.push(serializeEvent(event));
  const text = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return { text, count: lines.length };
}

/** 本机各月分段的条数与哈希（只含有事件的月份） */
export function localSegments(store: ModelUsageStore, deviceId: string): UsageSegmentInfo[] {
  const months = new Set<string>();
  for (const event of store.iterateDevice(deviceId)) months.add(monthOf(event.ts));
  return [...months].sort().map(month => {
    const { text, count } = buildNdjson(store, deviceId, month);
    return { month, count, hash: sha256(text) };
  });
}

export function exportSegment(
  store: ModelUsageStore,
  deviceId: string,
  month: string
): { data: Uint8Array; info: UsageSegmentInfo } {
  const { text, count } = buildNdjson(store, deviceId, month);
  return {
    data: new Uint8Array(gzipSync(Buffer.from(text, "utf8"))),
    info: { month, count, hash: sha256(text) },
  };
}

const KINDS = new Set<ModelUsageKind>(["llm", "embedding", "tts", "image"]);
const STATUSES = new Set<ModelUsageStatus>(["ok", "error", "aborted"]);
const COST_SOURCES = new Set<ModelUsageCostSource>(["catalog", "custom", "none"]);

const str = (v: unknown, max = 512): string | null =>
  typeof v === "string" && v.length <= max ? v : null;
const optStr = (v: unknown, max = 512): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" && v.length <= max ? v : undefined;
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const optNum = (v: unknown): number | null | undefined =>
  v === null || v === undefined ? null : (count(v) ?? undefined);

/** 远端一行 → 事件；任何字段不合格返回 null（整行丢弃，不做部分修补） */
function parseEvent(
  raw: unknown,
  deviceId: string,
  from: number,
  to: number
): ModelUsageEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const eventId = str(r.eventId, 64);
  const ts = count(r.ts);
  const providerId = str(r.providerId);
  const model = str(r.model);
  const feature = str(r.feature, 128);
  if (!eventId || ts === null || !providerId || !model || !feature) return null;
  if (r.deviceId !== deviceId || ts < from || ts >= to) return null;
  if (!KINDS.has(r.kind as ModelUsageKind) || !STATUSES.has(r.status as ModelUsageStatus)) {
    return null;
  }
  if (!COST_SOURCES.has(r.costSource as ModelUsageCostSource)) return null;
  const library = optStr(r.library, 256);
  const providerName = optStr(r.providerName);
  const scope = optStr(r.scope, 128);
  const sessionId = optStr(r.sessionId, 128);
  const entityId = optStr(r.entityId, 128);
  const errorMessage = optStr(r.errorMessage, 4096);
  const latencyMs = optNum(r.latencyMs);
  const ttftMs = optNum(r.ttftMs);
  const units = optNum(r.units);
  const numbers = [
    r.inputTokens,
    r.outputTokens,
    r.cacheReadTokens,
    r.cacheWriteTokens,
    r.reasoningTokens,
    r.totalTokens,
    r.cost,
  ].map(count);
  if (
    [
      library,
      providerName,
      scope,
      sessionId,
      entityId,
      errorMessage,
      latencyMs,
      ttftMs,
      units,
    ].some(v => v === undefined) ||
    numbers.some(v => v === null)
  ) {
    return null;
  }
  const [
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
    cost,
  ] = numbers as number[];
  return {
    eventId,
    ts,
    deviceId,
    library: library ?? null,
    kind: r.kind as ModelUsageKind,
    providerId,
    providerName: providerName ?? null,
    model,
    feature,
    scope: scope ?? null,
    sessionId: sessionId ?? null,
    entityId: entityId ?? null,
    status: r.status as ModelUsageStatus,
    errorMessage: errorMessage ?? null,
    latencyMs: latencyMs ?? null,
    ttftMs: ttftMs ?? null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
    units: units ?? null,
    cost,
    costSource: r.costSource as ModelUsageCostSource,
  };
}

/**
 * 导入其它设备的一个分段：校验哈希后整体替换该设备该月的本地副本。
 * 哈希对不上直接拒绝（传输损坏或清单与分段不一致），下次同步再试。
 */
export function importSegment(
  store: ModelUsageStore,
  input: { deviceId: string; month: string; hash: string; data: Uint8Array },
  selfDeviceId: string
): { imported: number; skipped: number } {
  if (!isValidDeviceId(input.deviceId)) throw new Error("无效的设备 id");
  if (input.deviceId === selfDeviceId) throw new Error("不能导入本机自己的分段");
  const { from, to } = monthRange(input.month);
  const raw = gunzipSync(Buffer.from(input.data), { maxOutputLength: MAX_SEGMENT_BYTES });
  const text = raw.toString("utf8");
  if (sha256(text) !== input.hash) throw new Error(`分段 ${input.month} 哈希不一致`);
  const events: ModelUsageEvent[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    const event = parseEvent(parsed, input.deviceId, from, to);
    if (event) events.push(event);
    else skipped += 1;
  }
  store.replaceDeviceRange(input.deviceId, from, to, events);
  return { imported: events.length, skipped };
}
