import { AlignCenter, AlignLeft, AlignRight, Link2 } from "lucide-react";
import { cn } from "@tau/ui";

import { type VideoElement } from "../../../../types/index";

type Align = NonNullable<VideoElement["align"]>;

const ALIGNMENTS: { align: Align; label: string; Icon: typeof AlignLeft }[] = [
  { align: "left", label: "左对齐", Icon: AlignLeft },
  { align: "center", label: "居中", Icon: AlignCenter },
  { align: "right", label: "右对齐", Icon: AlignRight },
];

/** 宽度预设：占编辑区可用宽度的比例 */
export const WIDTH_PRESETS = [0.5, 0.75, 1] as const;

const BUTTON_CLASS =
  "grid h-[30px] min-w-[30px] shrink-0 cursor-pointer place-items-center rounded-tau-sm border-none bg-transparent px-1.5 text-tau-sm text-[var(--ed-text-secondary)] transition-colors hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]";
const ACTIVE_CLASS =
  "bg-[var(--ed-accent-soft)] text-[var(--ed-accent-text)] hover:bg-[var(--ed-accent-soft)] hover:text-[var(--ed-accent-text)]";

interface VideoSelectionToolbarProps {
  align: Align;
  /** 当前命中的宽度预设（不在预设上时为 null） */
  activePreset: number | null;
  onAlign: (align: Align) => void;
  onWidthPreset: (ratio: number) => void;
  onCopyLink: () => void;
}

/** 选中视频块时浮在上方的属性条：对齐 / 宽度预设 / 复制地址 */
const VideoSelectionToolbar = ({
  align,
  activePreset,
  onAlign,
  onWidthPreset,
  onCopyLink,
}: VideoSelectionToolbarProps) => (
  <div
    role="toolbar"
    aria-label="视频属性"
    className="rounded-tau-sm absolute bottom-full left-1/2 z-[3] mb-3 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap bg-[var(--ed-bg-surface)] p-1 shadow-[var(--ed-shadow-float)]"
    // 属性条交互不应让编辑器抢走焦点 / 选区
    onMouseDown={event => event.preventDefault()}
  >
    {ALIGNMENTS.map(({ align: value, label, Icon }) => (
      <button
        key={value}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={align === value}
        className={cn(BUTTON_CLASS, align === value && ACTIVE_CLASS)}
        onClick={() => onAlign(value)}
      >
        <Icon size={15} />
      </button>
    ))}
    <span className="w-2.5" />
    {WIDTH_PRESETS.map(ratio => (
      <button
        key={ratio}
        type="button"
        title={`宽度 ${ratio * 100}%`}
        aria-pressed={activePreset === ratio}
        className={cn(
          BUTTON_CLASS,
          "[font-family:var(--ed-font-mono)]",
          activePreset === ratio && ACTIVE_CLASS
        )}
        onClick={() => onWidthPreset(ratio)}
      >
        {ratio * 100}%
      </button>
    ))}
    <span className="w-2.5" />
    <button
      type="button"
      title="复制视频地址"
      aria-label="复制视频地址"
      className={BUTTON_CLASS}
      onClick={onCopyLink}
    >
      <Link2 size={15} />
    </button>
  </div>
);

export default VideoSelectionToolbar;
