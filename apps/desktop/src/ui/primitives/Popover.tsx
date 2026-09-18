/**
 * Popover 基础件 —— 锚定式可交互内容浮层（D-014）。
 *
 * 家族分工：Tooltip 瞬态说明（hover/focus、不可交互）、Menu 命令面板、Select 表单值
 * 选择、Dialog 模态决策、Toast 回执；Popover 收「点击触发、内容可继续操作」的
 * 非模态浮层——说明卡 / 过滤器组 / 色板 / 成员卡 / 卡片预览。antd 存量 Popover 的
 * trigger="hover" 用法迁 Tooltip、placement 12 向同名直映（D-014 迁移口径）。
 *
 * 形制：无标题栏内容卡（surface + line-1 + radius-lg + shadow-float）；
 * 头行随需（icon 圆底 + 标题 + ghost ×），无内容不空转；footer 随需（hairline 之上
 * 按钮右对齐）；8px 菱形箭头与 Tooltip 同几何（FloatingArrow surface 档）；进场
 * translateY(4px) + scale(0.98) 160ms，方向随 flip 的 side。
 *
 * 行为内建（不做成 props）：
 *  - click toggle（hover 说明归 Tooltip，不设 trigger props；右键归 ContextMenu）
 *  - 定位 D-004 引擎全 placement 12 向 + flip/shift，gap 8；宽随内容（180–340），
 *    matchTriggerWidth 无此概念（那是下拉的事，归 Select）
 *  - scroll(capture)/resize/内容尺寸 rAF 合并重定位（useAnchoredPosition）
 *  - 外点关闭 + 嵌套链共存 + 顶层互斥（useLayerDismiss：浮层内开的 Menu/Select/
 *    二级 Popover 不算外点）
 *  - Esc 仅 open 态消费（焦点链 LIFO，同 Select/Menu/Dialog 口径，不进 D-003
 *    注册表——ui 不反向依赖 page/）；Esc/Tab 关闭还焦触发器
 *  - 打开落初始焦点：卡片内 [data-autofocus] 优先（表单放首输入框），否则卡片自身
 *  - Tab 移出即关（非模态不圈闭）
 *  - aria：卡片 role=dialog（非模态，无 aria-modal）+ aria-labelledby 头行；
 *    触发器 aria-haspopup=dialog + aria-expanded
 *  - 受控 open / onOpenChange（§5.3 浮层 open 契约；样板间常显标本用它）
 */

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/ui/cn";
import { useEdgeFade } from "@/hooks/useEdgeFade";
import { applyArrowPosition, type AnchoredPlacement } from "./anchoredPosition";
import { FloatingArrow } from "./FloatingArrow";
import { mergeRefs } from "./mergeRefs";
import { useAnchoredPosition } from "./useAnchoredPosition";
import { useLayerDismiss } from "./useLayerDismiss";

/* ───────── 上下文 ───────── */

interface PopoverRootContextValue {
  close: (refocus?: boolean) => void;
  headerId: string;
  /** Body 顶部间距按此分流：有头行收敛（头行自带 pb）、无头行自足 */
  hasHeader: boolean;
}
const PopoverRootContext = createContext<PopoverRootContextValue | null>(null);
const usePopoverRoot = (): PopoverRootContextValue => {
  const v = useContext(PopoverRootContext);
  if (!v) throw new Error("Popover 子组件必须渲染在 <Popover> 内");
  return v;
};

/* ───────── 根组件 ───────── */

export interface PopoverProps {
  /**
   * 触发器（单一元素，克隆注入开合事件 / aria / ref）。协议同 Tooltip/Menu：元素
   * 必须透传 props 与 ref——原生元素或 {...rest} 透传的组件；不透传的包装组件会
   * 吞掉注入，点击无反应。
   */
  trigger: ReactElement;
  /** 内容：Popover.Header / Body / Footer 复合声明（裸内容无内边距，自查排版） */
  children: ReactNode;
  /** 12 向全表（引擎 flip/shift 兜底），默认 top */
  placement?: AnchoredPlacement;
  /** 浮层受控（§5.3 契约；样板间常显标本用它） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 箭头（默认开；8px 菱形，随 flip 自动换边） */
  arrow?: boolean;
  /** 透传浮层卡片（宽度控制如 w-[360px]，覆盖 min/max 约束） */
  className?: string;
}

export function Popover({
  trigger,
  children,
  placement = "top",
  open: openProp,
  onOpenChange,
  arrow = true,
  className,
}: PopoverProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const headerId = useId();

  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };
  /** refocus：Esc/Tab/× 等键盘流关闭还焦触发器；外点与应用完成不还（指针流各回各家） */
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayerDismiss({
    open,
    layerRef: cardRef,
    close: () => close(false),
    isAnchor: target => triggerRef.current?.contains(target) ?? false,
    getAnchorEl: () => triggerRef.current,
  });

  useAnchoredPosition({
    open,
    getAnchor: () => triggerRef.current?.getBoundingClientRect() ?? null,
    popRef: cardRef,
    placement,
    onPlace: (pos, pop) => {
      pop.dataset.side = pos.side;
      if (arrow) applyArrowPosition(pos, pop);
    },
  });

  // 打开落初始焦点：[data-autofocus] 优先（表单首输入框），否则卡片自身（Esc 可达）
  useLayoutEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const target = card.querySelector<HTMLElement>("[data-autofocus]") ?? card;
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* jsdom 部分元素无 focus */
    }
  }, [open]);

  const hasHeader = Children.toArray(children).some(
    c => isValidElement(c) && c.type === PopoverHeader
  );

  const triggerEl = Children.only(trigger) as ReactElement<Record<string, unknown>>;
  const injected: Record<string, unknown> = {
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    ref: mergeRefs((triggerEl.props as { ref?: Ref<HTMLElement> }).ref, el => {
      triggerRef.current = el;
    }),
    onClick: (e: ReactMouseEvent) => {
      (triggerEl.props as { onClick?: (e: ReactMouseEvent) => void }).onClick?.(e);
      if (!e.defaultPrevented) setOpen(!open);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      (triggerEl.props as { onKeyDown?: (e: ReactKeyboardEvent) => void }).onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
        e.preventDefault();
        setOpen(true);
      } else if ((e.key === "Enter" || e.key === " ") && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
  };

  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：Esc 只关本层，不冒泡成页面后退
      close(true);
    } else if (e.key === "Tab") {
      close(true); // 非模态不圈闭：还焦触发器后由浏览器继续移动焦点
    }
  };

  return (
    <>
      {cloneElement(triggerEl, injected)}
      {createPortal(
        <div
          ref={cardRef}
          role="dialog"
          tabIndex={-1}
          aria-hidden={!open}
          aria-labelledby={hasHeader ? headerId : undefined}
          data-open={open}
          onKeyDown={onCardKeyDown}
          className={cn(
            "bg-surface border-line-1 shadow-float group/float",
            "rounded-tau-lg fixed left-0 top-0 z-[250] w-max min-w-[180px] max-w-[340px] border",
            "ease-tau-out outline-none transition-[opacity,transform,visibility] duration-[160ms]",
            open ? "opacity-100" : "invisible translate-y-[4px] scale-[0.98] opacity-0",
            !open && "data-[side=top]:-translate-y-[4px]",
            !open && "data-[side=left]:-translate-x-[4px]",
            !open && "data-[side=right]:translate-x-[4px]",
            className
          )}
        >
          {arrow && <FloatingArrow tone="surface" />}
          <PopoverRootContext.Provider value={{ close, headerId, hasHeader }}>
            {children}
          </PopoverRootContext.Provider>
        </div>,
        document.body
      )}
    </>
  );
}

/* ───────── 子组件（纯声明，关闭语义经上下文接线） ───────── */

export interface PopoverHeaderProps {
  /** 16px lucide 图标（圆底 accent-soft） */
  icon?: ReactNode;
  children: ReactNode;
}

/** 头行：随需出现——说明卡/过滤器用它，色板/成员卡可省（零框架税） */
function PopoverHeader({ icon, children }: PopoverHeaderProps) {
  const root = usePopoverRoot();
  return (
    <div className="flex items-center gap-2.5 px-4 pb-1 pt-3.5">
      {icon && (
        <span className="bg-accent-soft text-accent-text flex size-[26px] shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      <h4 id={root.headerId} className="text-ink-1 flex-1 truncate text-[13.5px] font-[600]">
        {children}
      </h4>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => root.close(true)}
        className="text-ink-3 hover:bg-hover hover:text-ink-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-[8px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      >
        <X className="size-[13px]" strokeWidth={2} />
      </button>
    </div>
  );
}

export interface PopoverBodyProps {
  children: ReactNode;
  className?: string;
}

/** 正文：独立滚动（上限 min(60vh, 420px)）+ 边缘渐隐（edge fade 三件套，Dialog 同构）。
 *  顶部间距按有无头行分流：无头行自足 14px，有头行收敛 10px（头行自带 pb-1）。
 *  滚动条距右缘 4px = 透明右边框挤位（D-012 手法，浮层滚动区通用口径）；
 *  thumb 形制仍走全局 4px 细墨条——Dialog 的 track 间距/圆角专属形制勿外推 */
function PopoverBody({ children, className }: PopoverBodyProps) {
  const root = useContext(PopoverRootContext);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  return (
    <div
      ref={setScrollEl}
      className={cn(
        "text-ink-2 text-tau-body edge-fade-scroll",
        "max-h-[min(60vh,420px)] overflow-y-auto border-r-4 border-r-transparent px-4 pb-3.5 leading-[1.65]",
        root?.hasHeader ? "pt-2.5" : "pt-3.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface PopoverFooterProps {
  children: ReactNode;
  className?: string;
}

/** 应答区：随需——无操作即无 footer；按钮右对齐（主按钮恒在最右） */
function PopoverFooter({ children, className }: PopoverFooterProps) {
  return (
    <div
      className={cn(
        "border-line-2 mt-1 flex items-center justify-end gap-2 border-t px-4 py-3",
        className
      )}
    >
      {children}
    </div>
  );
}

Popover.Header = PopoverHeader;
Popover.Body = PopoverBody;
Popover.Footer = PopoverFooter;
