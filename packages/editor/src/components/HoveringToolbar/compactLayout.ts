import type { IConfigItem } from "../../types";

export const COMPACT_TEXT_STYLE_GROUP_ID = "__compact-text-style__";
export const COMPACT_MORE_GROUP_ID = "__compact-more__";

export const MORE_GROUP_ORDER = Number.MAX_SAFE_INTEGER - 1;

export type CompactGroupItem = {
  kind: "group";
  id: typeof COMPACT_TEXT_STYLE_GROUP_ID | typeof COMPACT_MORE_GROUP_ID;
  order: number;
  items: IConfigItem[];
};

export type CompactNormalItem = {
  kind: "item";
  config: IConfigItem;
};

export type CompactLayoutItem = CompactGroupItem | CompactNormalItem;

function byOrder(a: CompactLayoutItem, b: CompactLayoutItem): number {
  const left = a.kind === "item" ? a.config.order : a.order;
  const right = b.kind === "item" ? b.config.order : b.order;
  return left - right;
}

export function buildCompactLayoutItems(sortedConfigs: IConfigItem[]): CompactLayoutItem[] {
  const textStyleConfigs = sortedConfigs.filter(config => config.compactGroup === "text-style");
  const moreConfigs = sortedConfigs.filter(config => config.compactGroup === "more");
  const baseConfigs = sortedConfigs.filter(config => {
    return config.compactGroup !== "text-style" && config.compactGroup !== "more";
  });

  const result: CompactLayoutItem[] = baseConfigs.map(config => ({
    kind: "item",
    config,
  }));

  if (textStyleConfigs.length > 0) {
    result.push({
      kind: "group",
      id: COMPACT_TEXT_STYLE_GROUP_ID,
      order: Math.min(...textStyleConfigs.map(config => config.order)),
      items: textStyleConfigs,
    });
  }

  if (moreConfigs.length > 0) {
    result.push({
      kind: "group",
      id: COMPACT_MORE_GROUP_ID,
      order: MORE_GROUP_ORDER,
      items: moreConfigs,
    });
  }

  return result.sort(byOrder);
}
