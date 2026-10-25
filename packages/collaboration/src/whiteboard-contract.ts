import type { WhiteboardElementContract } from "@tau/db-schema/content-contracts";
import { WHITEBOARD_LIMITS } from "./model-limits";

export type { DataJson as WhiteboardJson } from "@tau/db-schema/content-contracts";
import type { DataJson as WhiteboardJson } from "@tau/db-schema/content-contracts";

const unsafe = new Set(["__proto__", "constructor", "prototype"]);

export function assertWhiteboardJson(value: unknown, depth = 0): void {
  if (depth > WHITEBOARD_LIMITS.payloadDepth) throw new Error("白板数据层级超过预算");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1)
      throw new Error("白板数组必须连续且无额外属性");
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) throw new Error("白板数组属性无效");
      assertWhiteboardJson(descriptor.value, depth + 1);
    }
    return;
  }
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || unsafe.has(key) || !descriptor || !("value" in descriptor))
        throw new Error("白板数据属性无效");
      assertWhiteboardJson(descriptor.value, depth + 1);
    }
    return;
  }
  throw new Error("白板数据必须是有限 JSON");
}

/** 只验证首期普通属性补丁，不提交文档，也不代替资源授权或模型版本检查。 */
export function assertWhiteboardDataPatch(
  contract: WhiteboardElementContract,
  patch: unknown,
  unset: readonly string[] = []
): asserts patch is Readonly<Record<string, WhiteboardJson>> {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    contract.domain !== "whiteboard-element"
  )
    throw new Error("白板属性补丁无效");
  assertWhiteboardJson(patch);
  if (
    !Array.isArray(unset) ||
    unset.some(key => typeof key !== "string") ||
    new Set(unset).size !== unset.length
  )
    throw new Error("删除属性列表无效");
  const keys = [...Object.keys(patch), ...unset];
  if (
    keys.some(key => unsafe.has(key) || contract.textFields.includes(key)) ||
    unset.some(key => Object.hasOwn(patch, key))
  )
    throw new Error("补丁覆盖受保护字段或存在冲突");
  if (
    new TextEncoder().encode(JSON.stringify({ patch, unset })).length > WHITEBOARD_LIMITS.patchBytes
  )
    throw new Error("白板属性补丁超过预算");
}
