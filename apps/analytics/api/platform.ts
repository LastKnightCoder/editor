import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
export interface Env {
  DB: D1Database;
  RELEASES: R2Bucket;
  ASSETS: { fetch(request: Request): Promise<Response> };
  ADMIN_TOKEN?: string;
  DOWNLOAD_HASH_KEY?: string;
  ALLOWED_ORIGINS: string;
  DOWNLOAD_ORIGIN: string;
  INGEST_LIMITER?: RateLimiter;
  LOGIN_LIMITER?: RateLimiter;
  DOWNLOAD_LIMITER?: RateLimiter;
}
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}
export function json<T>(data: T, meta?: unknown): Response {
  return Response.json({ data, ...(meta ? { meta } : {}) });
}
export async function readJson(request: Request, limit = 65536): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    fail(415, "CONTENT_TYPE", "请使用 application/json");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "INVALID_JSON", "缺少请求正文");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, "BODY_TOO_LARGE", "请求超过大小限制");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input;
  } catch {
    return fail(400, "INVALID_JSON", "请求必须是 JSON 对象");
  }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const shanghaiDay = (time = Date.now()) =>
  new Date(time + 8 * 3600000).toISOString().slice(0, 10);
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function enforceLimit(request: Request, limiter?: RateLimiter): Promise<void> {
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (limiter && !(await limiter.limit({ key })).success)
    fail(429, "RATE_LIMITED", "请求过于频繁，请稍后重试");
}
