import { BookOpen, Infinity as InfinityIcon, Shapes, Zap, type LucideIcon } from "lucide-react";

export type KnownCardCategory = "temporary" | "permanent" | "theme" | "literature";

export const CARD_CATEGORY_OPTIONS: Array<{
  value: KnownCardCategory;
  label: string;
}> = [
  { value: "temporary", label: "闪念" },
  { value: "permanent", label: "永久" },
  { value: "theme", label: "主题" },
  { value: "literature", label: "文献" },
];

export function isKnownCardCategory(category: string): category is KnownCardCategory {
  return CARD_CATEGORY_OPTIONS.some(item => item.value === category);
}

// 分类标签的杏子配色（前景 + 粉彩底），未知分类回退杏色
export const CARD_CATEGORY_TAG_CLASS: Record<KnownCardCategory, string> = {
  temporary: "bg-apricot-soft text-apricot",
  permanent: "bg-sage-soft text-sage",
  theme: "bg-sky-soft text-sky",
  literature: "bg-lilac-soft text-lilac",
};

// 分类彩点（卡片详情头部只读标识），与标签配色同源
export const CARD_CATEGORY_DOT_CLASS: Record<KnownCardCategory, string> = {
  temporary: "bg-apricot",
  permanent: "bg-sage",
  theme: "bg-sky",
  literature: "bg-lilac",
};

// 分类名称的文字色（与彩点同源，用于「彩点 + 彩色名称」头部）
export const CARD_CATEGORY_TEXT_CLASS: Record<KnownCardCategory, string> = {
  temporary: "text-apricot",
  permanent: "text-sage",
  theme: "text-sky",
  literature: "text-lilac",
};

export function cardCategoryTagClass(category: string): string {
  return isKnownCardCategory(category)
    ? CARD_CATEGORY_TAG_CLASS[category]
    : CARD_CATEGORY_TAG_CLASS.temporary;
}

export function cardCategoryDotClass(category: string): string {
  return isKnownCardCategory(category)
    ? CARD_CATEGORY_DOT_CLASS[category]
    : CARD_CATEGORY_DOT_CLASS.temporary;
}

export function cardCategoryTextClass(category: string): string {
  return isKnownCardCategory(category)
    ? CARD_CATEGORY_TEXT_CLASS[category]
    : CARD_CATEGORY_TEXT_CLASS.temporary;
}

// 分类徽章图标（详情头徽章行：soft 底胶囊 + 图标 + 名称），未知分类回退闪念
export const CARD_CATEGORY_ICON: Record<KnownCardCategory, LucideIcon> = {
  temporary: Zap,
  permanent: InfinityIcon,
  theme: Shapes,
  literature: BookOpen,
};

export function cardCategoryIcon(category: string): LucideIcon {
  return isKnownCardCategory(category)
    ? CARD_CATEGORY_ICON[category]
    : CARD_CATEGORY_ICON.temporary;
}

export function cardCategoryLabel(category: string): string {
  return isKnownCardCategory(category)
    ? (CARD_CATEGORY_OPTIONS.find(item => item.value === category)?.label ?? category)
    : category;
}
