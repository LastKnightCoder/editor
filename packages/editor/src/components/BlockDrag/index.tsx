import type { ComponentType, MouseEvent, ReactNode, Ref } from "react";
import { MdDragIndicator } from "react-icons/md";
import { cn } from "@tau/ui";

/**
 * 块的拖拽手柄与放置指示，所有块共用。
 *
 * 显示逻辑按块隔离：块的外层容器加 `BLOCK_DRAG_GROUP`，带 `data-block-reveal` 的元素（手柄、标题折叠箭头）
 * 只在**最内层**被悬停的块里出现，规则见 `theme/editor.css`。
 * 不用 Tailwind 命名 group：`group-hover/x` 匹配的是「任意同名祖先被悬停」，嵌套块会一起亮。
 */
export const BLOCK_DRAG_GROUP = "ed-block";

export interface DragHandleProps {
  /** useDragAndDrop 返回的 drag 连接器 */
  dragRef: Ref<HTMLDivElement> | ((node: HTMLDivElement | null) => void);
  canDrag: boolean;
  onClick?: (event: MouseEvent) => void;
  /** 位置微调（经 cn 合并，可覆盖 top / left / height） */
  className?: string;
  /** 手柄图标；传 null 渲染无图标的热区 */
  icon?: ComponentType<{ className?: string }> | null;
  iconClassName?: string;
}

export function DragHandle({
  dragRef,
  canDrag,
  onClick,
  className,
  icon: Icon = MdDragIndicator,
  iconClassName,
}: DragHandleProps) {
  return (
    <div
      contentEditable={false}
      suppressContentEditableWarning
      ref={dragRef}
      onClick={onClick}
      data-drag-handle
      data-block-reveal={canDrag || undefined}
      className={cn(
        "absolute -left-[1.25em] top-0 flex h-[1.8em] w-[1.25em] cursor-pointer select-none items-center justify-center opacity-0",
        // 热区向四周、尤其向右（内容区）扩大，鼠标从正文移向手柄时不会中途消失；不拦截事件，不影响选中文字
        "before:pointer-events-none before:absolute before:-bottom-[0.5em] before:-left-[0.5em] before:-right-[2em] before:-top-[0.5em] before:content-['']",
        canDrag && "hover:opacity-100",
        className
      )}
    >
      {Icon && <Icon className={cn("-translate-y-[2px]", iconClassName)} />}
    </div>
  );
}

export interface DropIndicatorProps {
  /** 当前是否有可放置的拖拽经过本块 */
  active: boolean;
  /** 插入到本块之前（上方）还是之后（下方） */
  before: boolean;
  /** 位置微调（经 cn 合并，可覆盖 top / bottom） */
  className?: string;
}

/** 拖拽经过时的 accent 插入线；父元素需 position: relative */
export function DropIndicator({ active, before, className }: DropIndicatorProps): ReactNode {
  if (!active) return null;
  return (
    <div
      contentEditable={false}
      aria-hidden
      data-drop-indicator={before ? "before" : "after"}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-[0.125em] bg-[var(--ed-accent-text)]",
        before ? "-top-[0.625em]" : "bottom-[0.375em]",
        className
      )}
    />
  );
}

/** 拖拽源 / 放置目标的半透明（原 .dragging / .drop 的 opacity: 0.5） */
export const dimWhileDragging = (dragging: boolean) => (dragging ? "opacity-50" : undefined);

/**
 * 同一条插入线的伪元素写法：给**承载 Slate attributes 的元素**用（段落、标题等）。
 * 在那里插入真实子节点会混进 Slate 的 DOM ↔ 节点映射，`<p>` 里也放不了 `<div>`，所以用 ::before / ::after。
 * 元素本身需 position: relative。偏移用 `before:-top-[…]` / `after:-bottom-[…]` 覆盖。
 */
export const dropLineClass = (active: boolean, before: boolean) =>
  active
    ? before
      ? "before:pointer-events-none before:absolute before:inset-x-0 before:-top-[0.625em] before:h-[0.125em] before:bg-[var(--ed-accent-text)] before:content-['']"
      : "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[0.375em] after:h-[0.125em] after:bg-[var(--ed-accent-text)] after:content-['']"
    : undefined;
