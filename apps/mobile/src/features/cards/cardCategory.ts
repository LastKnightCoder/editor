export type KnownCardCategory =
  | "temporary"
  | "permanent"
  | "theme"
  | "literature";

export const CARD_CATEGORY_OPTIONS: Array<{
  value: KnownCardCategory;
  label: string;
}> = [
  { value: "temporary", label: "闪念" },
  { value: "permanent", label: "永久" },
  { value: "theme", label: "主题" },
  { value: "literature", label: "文献" },
];

export function isKnownCardCategory(
  category: string,
): category is KnownCardCategory {
  return CARD_CATEGORY_OPTIONS.some((item) => item.value === category);
}
