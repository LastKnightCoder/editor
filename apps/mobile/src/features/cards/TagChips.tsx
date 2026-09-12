// 标签 chip 行：# 号用品牌色提亮，列表项与详情页共用同一套样式。
// variant="elevated" 为详情页浮起胶囊（surface 底 + 微投影，方案 A 定稿）；
// trailing 为行尾附加节点（如「＋ 标签」），与 chips 同容器排布。
// 传 onRemove 时 chip 尾随 × 删除按钮，传原始 tag 串（含 # 前缀）。

import type { ReactNode } from "react";
import { X } from "lucide-react";

type TagChipsProps = {
  tags: string[];
  className?: string;
  variant?: "flat" | "elevated";
  trailing?: ReactNode;
  onRemove?: (tag: string) => void;
};

const FLAT_CHIP_CLASS =
  "inline-flex items-center gap-[3px] rounded-full bg-input px-2.5 py-[3.5px] text-[11.5px] font-medium text-meta-ink";
const ELEVATED_CHIP_CLASS =
  "inline-flex items-center gap-[3px] rounded-full bg-surface px-2.5 py-[4px] text-[12px] font-medium text-meta-ink shadow-card";

export function TagChips({ tags, className, variant, trailing, onRemove }: TagChipsProps) {
  if (tags.length === 0 && !trailing) {
    return null;
  }
  const chipClass = variant === "elevated" ? ELEVATED_CHIP_CLASS : FLAT_CHIP_CLASS;
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {tags.map(tag => {
        const label = tag.startsWith("#") ? tag.slice(1) : tag;
        if (!label) {
          return null;
        }
        return (
          <span key={tag} className={chipClass}>
            <span className="text-accent text-[11px] font-bold" aria-hidden>
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
                className="text-ink-3 active:bg-press -mr-1 inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full"
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
