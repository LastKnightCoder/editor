import { Brain, type LucideIcon } from "lucide-react";
import { flashcardDeckIcons } from "@/utils/flashcard";

/** 旧版 emoji 预设 → 图标 key：存量数据无需迁移即可显示图标，编辑保存时自然写回 key */
const legacyEmojiToIconKey: Record<string, string> = {
  "🧠": "brain",
  "📚": "book",
  "⚡": "zap",
  "🎯": "target",
  "🧩": "puzzle",
  "🔬": "microscope",
  "🌟": "star",
  "🚀": "rocket",
  "💡": "lightbulb",
  "📝": "notes",
};

interface DeckIconProps {
  /** deck.emoji 字段：新数据为 flashcardDeckIcons 的 key，存量 emoji 字符经映射兼容，未识别的原样显示 */
  emoji?: string | null;
  className?: string;
}

/** 卡组封面图标 */
const DeckIcon = ({ emoji, className }: DeckIconProps) => {
  const key = emoji ? (legacyEmojiToIconKey[emoji] ?? emoji) : undefined;
  const Icon: LucideIcon | undefined = key ? flashcardDeckIcons[key] : undefined;
  if (Icon) {
    return <Icon className={className} strokeWidth={1.75} />;
  }
  if (emoji) {
    return <span className={className}>{emoji}</span>;
  }
  return <Brain className={className} strokeWidth={1.75} />;
};

export default DeckIcon;
