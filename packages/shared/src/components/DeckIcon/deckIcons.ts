import {
  BookOpen,
  Brain,
  Lightbulb,
  Map as MapIcon,
  Microscope,
  NotebookPen,
  Puzzle,
  Rocket,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** 卡组封面图标集：deck.emoji 字段存这里的 key，桌面端与移动端共用 */
export const deckIcons: Record<string, LucideIcon> = {
  brain: Brain,
  book: BookOpen,
  zap: Zap,
  target: Target,
  puzzle: Puzzle,
  microscope: Microscope,
  star: Star,
  rocket: Rocket,
  lightbulb: Lightbulb,
  notes: NotebookPen,
  map: MapIcon,
};

export const deckIconKeys = Object.keys(deckIcons);

/** 旧版 emoji 预设 → 图标 key：存量数据与数据库默认值无需迁移即可显示图标，编辑保存时写回 key */
const legacyEmojiToIconKey: Record<string, string> = {
  "🧠": "brain",
  "📚": "book",
  "📖": "book",
  "⚡": "zap",
  "🎯": "target",
  "🧩": "puzzle",
  "🔬": "microscope",
  "🌟": "star",
  "🚀": "rocket",
  "💡": "lightbulb",
  "📝": "notes",
  "🗺️": "map",
  "🗺": "map",
};

/** 把 deck.emoji 归一为图标 key；未识别的自定义值返回 undefined */
export function toDeckIconKey(emoji?: string | null): string | undefined {
  if (!emoji) return undefined;
  const key = legacyEmojiToIconKey[emoji] ?? emoji;
  return Object.hasOwn(deckIcons, key) ? key : undefined;
}
