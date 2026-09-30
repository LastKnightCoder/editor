import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, cn } from "@tau/ui";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

/** 媒体块的三种水平对齐（属性条按钮用） */
export const MEDIA_ALIGNMENTS = [
  { align: "left", label: "左对齐", Icon: AlignLeft },
  { align: "center", label: "居中", Icon: AlignCenter },
  { align: "right", label: "右对齐", Icon: AlignRight },
] as const;

/** 最近的纵向滚动容器的可视顶边（视口坐标）；没有就是视口顶 */
const scrollViewportTop = (el: HTMLElement) => {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node.getBoundingClientRect().top;
    }
  }
  return 0;
};

/**
 * 媒体块（图片 / 视频）选中后浮出的属性条：默认在块上方居中，
 * 上方放不下（如文档顶部第一张图）时翻到下方。按下不抢编辑器焦点与选区。
 */
export function MediaToolbar({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** 无障碍名称（如「图片属性」） */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      setBelow(el.getBoundingClientRect().top < scrollViewportTop(el) + 8);
    }
  }, []);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      className={cn(
        "rounded-tau-sm absolute left-1/2 z-[3] flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap bg-[var(--ed-bg-surface)] p-1 shadow-[var(--ed-shadow-float)]",
        below ? "top-full mt-3" : "bottom-full mb-3",
        className
      )}
      onMouseDown={event => event.preventDefault()}
    >
      {children}
    </div>
  );
}

const BUTTON_CLASS =
  "text-tau-sm rounded-tau-sm inline-flex h-[30px] min-w-[30px] shrink-0 cursor-pointer items-center justify-center gap-1.5 border-none bg-transparent px-1.5 text-[var(--ed-text-secondary)] transition-colors hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]";
const ACTIVE_CLASS =
  "bg-[var(--ed-accent-soft)] text-[var(--ed-accent-text)] hover:bg-[var(--ed-accent-soft)] hover:text-[var(--ed-accent-text)]";

/**
 * 属性条按钮：带文字的主操作（label）直接可读；纯图标按钮悬停给出名称与快捷键。
 */
export function ToolbarButton({
  title,
  shortcut,
  label,
  icon,
  active = false,
  mono = false,
  onClick,
}: {
  /** 按钮名称：图标按钮的提示 / 无障碍名称 */
  title: string;
  shortcut?: string;
  /** 显示在图标旁的文字（主操作用） */
  label?: string;
  icon?: ReactNode;
  active?: boolean;
  /** 等宽数字（如宽度百分比） */
  mono?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const button = (
    <button
      type="button"
      aria-label={label ? undefined : title}
      aria-pressed={active || undefined}
      className={cn(
        BUTTON_CLASS,
        mono && "[font-family:var(--ed-font-mono)]",
        label && "px-2",
        active && ACTIVE_CLASS
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
  if (label && !shortcut) {
    return button;
  }
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-2">
          {title}
          {shortcut && <kbd className="font-tau-mono opacity-70">{shortcut}</kbd>}
        </span>
      }
      delay={300}
    >
      {button}
    </Tooltip>
  );
}

/** 属性条内的分组间距（不用分隔线） */
export const ToolbarGap = () => <span aria-hidden className="w-2 shrink-0" />;
