/**
 * 卡组色：legacy 的 10 个 coverColor（utils/flashcard flashcardDeckColors，库里存 hex）收敛到 6 色设计板，
 * 全部走主题语义类（tag-1…5 / accent），浅深两主题自动跟随，不新增 token；只用于区分卡组。
 * 新建 / 编辑卡组时只提供这 6 个代表 hex。
 */

export type DeckTone = "green" | "blue" | "purple" | "yellow" | "rose" | "orange";

const TONE_OF_HEX: Record<string, DeckTone> = {
  "#2563eb": "blue",
  "#0ea5e9": "blue",
  "#10b981": "green",
  "#14b8a6": "green",
  "#f59e0b": "yellow",
  "#ec4899": "rose",
  "#ef4444": "rose",
  "#6366f1": "purple",
  "#8b5cf6": "purple",
  "#f97316": "orange",
};

/** 卡组图标底：软底 + 同色图标（Tailwind 需要完整类名字面量） */
export const TONE_MARK: Record<DeckTone, string> = {
  green: "bg-tag-1-soft text-tag-1",
  blue: "bg-tag-2-soft text-tag-2",
  purple: "bg-tag-3-soft text-tag-3",
  yellow: "bg-tag-4-soft text-tag-4",
  rose: "bg-tag-5-soft text-tag-5",
  orange: "bg-accent-soft text-accent-text",
};

export const TONE_SWATCH: Record<DeckTone, string> = {
  green: "bg-tag-1",
  blue: "bg-tag-2",
  purple: "bg-tag-3",
  yellow: "bg-tag-4",
  rose: "bg-tag-5",
  orange: "bg-accent",
};

export const TONE_OPTIONS: { tone: DeckTone; color: string; label: string }[] = [
  { tone: "blue", color: "#2563eb", label: "蓝" },
  { tone: "green", color: "#10b981", label: "绿" },
  { tone: "purple", color: "#8b5cf6", label: "紫" },
  { tone: "yellow", color: "#f59e0b", label: "黄" },
  { tone: "rose", color: "#ef4444", label: "红" },
  { tone: "orange", color: "#f97316", label: "橙" },
];

export function deckTone(color: string | null | undefined): DeckTone {
  return (color && TONE_OF_HEX[color.toLowerCase()]) || "blue";
}
