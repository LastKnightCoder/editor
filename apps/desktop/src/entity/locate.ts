/** 打开正文到某个顶层块（页面参数 at 的序列化形式）；非法值降级为文首 */
export type EntityLocation = { block: number };

export function parseEntityLocation(value: string | undefined): EntityLocation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number.isSafeInteger(parsed.block) && parsed.block >= 0) return { block: parsed.block };
  } catch {
    /* 非法地址降级为文首。 */
  }
  return null;
}

export const serializeEntityLocation = (location: EntityLocation): string =>
  JSON.stringify(location);
