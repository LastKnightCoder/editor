export type EntityLocation = { block: number } | { quote: number };

export function parseEntityLocation(value: string | undefined): EntityLocation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    if (Number.isSafeInteger(parsed.block) && parsed.block >= 0) return { block: parsed.block };
    if (Number.isSafeInteger(parsed.quote) && parsed.quote > 0) return { quote: parsed.quote };
  } catch {
    /* 非法地址降级为文首。 */
  }
  return null;
}

export const serializeEntityLocation = (location: EntityLocation): string =>
  JSON.stringify(location);
