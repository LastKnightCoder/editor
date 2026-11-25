import { createHash } from "node:crypto";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** 未建立正文会话的旧正文同样按内容判冲突，不依赖毫秒时钟。 */
export function contentStateRevision(content: unknown, contracts?: unknown): string {
  return `h:${createHash("sha256").update(canonical({ content, contracts })).digest("hex")}`;
}
