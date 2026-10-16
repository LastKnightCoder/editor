import type { ApiResult, ErrorCode } from "../contracts";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  PENDING: R2Bucket;
  WEB_ORIGIN: string;
  API_ORIGIN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  REVIEWER_GITHUB_IDS?: string;
}
export const isReviewer = (env: Env, id: string) =>
  (env.REVIEWER_GITHUB_IDS ?? "")
    .split(",")
    .map(value => value.trim())
    .includes(id);
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message);
  }
}
export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>
): never {
  throw new HttpError(status, code, message, fields);
}
export function json<T>(data: T, status = 200): Response {
  return Response.json({ data } satisfies ApiResult<T>, { status });
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readLimited(request, 100000);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    return fail(400, "INVALID_INPUT", "请求必须是 JSON 对象");
  }
}
export async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, "UPLOAD_TOO_LARGE", "请求超过大小限制");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export const randomToken = () => crypto.randomUUID() + crypto.randomUUID();
export function cookie(request: Request, name: string): string | null {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map(x => x.trim())
      .find(x => x.startsWith(name + "="))
      ?.slice(name.length + 1) ?? null
  );
}
export function setCookie(env: Env, name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${env.API_ORIGIN.startsWith("https:") ? "; Secure" : ""}`;
}
