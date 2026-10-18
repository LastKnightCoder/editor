import type { JsonValue } from "./json";

/** 在边界复制 JSON，防止调用者在提交后继续修改宿主持有的数据。 */
export function copyJson(value: unknown, depth = 0): JsonValue {
  if (depth > 64) throw new Error("插件数据嵌套过深");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, item => copyJson(item, depth + 1));
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyJson(item, depth + 1)])
    );
  }
  throw new Error("插件数据必须是有限 JSON 值");
}

export { assertLocalId } from "./ids";
