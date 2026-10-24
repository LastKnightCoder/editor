// 标签 chip 行：# 号用品牌色提亮，列表项与详情页共用同一套样式。
// variant="soft" 为详情页轻标签（品牌淡底小方块、无投影）；
// trailing 为行尾附加节点（如「＋ 标签」），与 chips 同容器排布。
// 传 onRemove 时 chip 尾随 × 删除按钮，传原始 tag 串（含 # 前缀）。

import type { ReactNode } from "react";
import { X } from "lucide-react";

type TagChipsProps = {
  tags: string[];
  className?: string;
  variant?: "flat" | "soft";
  trailing?: ReactNode;
  onRemove?: (tag: string) => void;
};

const FLAT_CHIP_CLASS =
  "inline-flex items-center gap-[3px] rounded-full bg-page px-2.5 py-[3.5px] text-tau-micro font-medium text-ink-2";
const SOFT_CHIP_CLASS =
  "inline-flex items-center gap-[3px] rounded-[8px] bg-accent-soft px-2.5 py-[3.5px] text-tau-micro font-semibold text-accent-text";

export function TagChips({ tags, className, variant, trailing, onRemove }: TagChipsProps) {
  if (tags.length === 0 && !trailing) {
    return null;
  }
  const chipClass = variant === "soft" ? SOFT_CHIP_CLASS : FLAT_CHIP_CLASS;
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {tags.map(tag => {
        const label = tag.startsWith("#") ? tag.slice(1) : tag;
        if (!label) {
          return null;
        }
        return (
          <span key={tag} className={chipClass}>
            <span className="text-accent font-bold" aria-hidden>
              #
            </span>
            {label}
            {onRemove ? (
              <button
                type="button"
                aria-label={`删除标签 ${label}`}
                // 阻止 pointerdown 默认行为，避免内联输入框先失焦（失焦即提交并退出编辑态，× 会被卸载导致点击丢失）
                onPointerDown={event => event.preventDefault()}
                onClick={() => onRemove(tag)}
                className="text-ink-3 active:bg-hover -mr-1 inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full"
              >
                <X size={11} strokeWidth={3} />
              </button>
            ) : null}
          </span>
        );
      })}
      {trailing}
    </div>
  );
}

export default TagChips;
