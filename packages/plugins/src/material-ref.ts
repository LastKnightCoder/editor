import type { PluginMaterialRef } from "./excerpts";

/** 数字编号仅是定位提示；外部身份在设备归并后仍代表同一个对象。 */
export function createExcerptMaterialRef(
  id: number,
  provider: string,
  externalId: string
): PluginMaterialRef {
  return { kind: "excerpt", id, identity: JSON.stringify(["excerpt", 1, provider, externalId]) };
}

export function parseExcerptMaterialRef(ref: PluginMaterialRef): {
  provider: string;
  externalId: string;
} {
  if (ref?.kind !== "excerpt" || !Number.isSafeInteger(ref.id) || ref.id <= 0)
    throw new Error("材料地址无效");
  if (typeof ref.identity !== "string" || ref.identity.length > 4096)
    throw new Error("材料引用缺少有效身份，请重新读取");
  let value: unknown;
  try {
    value = JSON.parse(ref.identity);
  } catch {
    throw new Error("材料引用身份无效");
  }
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value[0] !== "excerpt" ||
    value[1] !== 1 ||
    typeof value[2] !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value[2]) ||
    typeof value[3] !== "string" ||
    !value[3].trim() ||
    value[3].length > 512
  )
    throw new Error("材料引用身份无效");
  return { provider: value[2], externalId: value[3] };
}
