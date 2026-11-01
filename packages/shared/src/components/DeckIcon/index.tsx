import { Brain } from "lucide-react";
import { deckIcons, toDeckIconKey } from "./deckIcons";

interface DeckIconProps {
  /** deck.emoji 字段：图标 key 或旧版 emoji；未识别的原样显示 */
  emoji?: string | null;
  className?: string;
}

/** 卡组封面图标 */
const DeckIcon = ({ emoji, className }: DeckIconProps) => {
  const key = toDeckIconKey(emoji);
  if (key) {
    const Icon = deckIcons[key];
    return <Icon className={className} strokeWidth={1.75} />;
  }
  if (emoji) {
    return <span className={className}>{emoji}</span>;
  }
  return <Brain className={className} strokeWidth={1.75} />;
};

export default DeckIcon;
