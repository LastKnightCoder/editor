/**
 * Popover 基础件 —— 锚定式可交互内容浮层（D-014）。
 *
 * 家族分工：Tooltip 瞬态说明（hover/focus、不可交互）、Menu 命令面板、Select 表单值
 * 选择、Dialog 模态决策、Toast 回执；Popover 收「点击触发、内容可继续操作」的
 * 非模态浮层——说明卡 / 过滤器组 / 色板 / 成员卡 / 卡片预览。antd 存量 Popover 的
 * trigger="hover" 用法迁 Tooltip、placement 12 向同名直映（D-014 迁移口径）。
 *
 * 定位与卡片视觉组合自 AnchoredPanel（基座只有一份）；本件叠加交互层：
 *  - click toggle（hover 说明归 Tooltip，不设 trigger props；右键归 ContextMenu）
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
import { X } from "lucide-react";
import { AnchoredPanel, PanelHasHeaderContext } from "./AnchoredPanel";
import { mergeRefs } from "./mergeRefs";
import { useLayerDismiss } from "./useLayerDismiss";
import type { AnchoredPlacement } from "./anchoredPosition";

/* ───────── 上下文 ───────── */

interface PopoverRootContextValue {
  close: (refocus?: boolean) => void;
  headerId: string;
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
  trigger?: ReactElement;
  /** 已存在的交互元素可直接作为锚点，适用于虚拟列表单元格。 */
  anchor?: HTMLElement | null;
  locked?: boolean;
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
  anchor,
  locked = false,
  children,
  placement = "top",
  open: openProp,
  onOpenChange,
  arrow = true,
  className,
}: PopoverProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const headerId = useId();

  useLayoutEffect(() => {
    if (anchor) {
      triggerRef.current = anchor;
      setAnchorEl(anchor);
    }
  }, [anchor]);

  const setOpen = (v: boolean) => {
    if (locked && !v) return;
    setOpenState(v);
    onOpenChange?.(v);
  };
  /** refocus：Esc/Tab/× 等键盘流关闭还焦触发器；外点与应用完成不还（指针流各回各家） */
  const close = (refocus = false) => {
    if (locked) return;
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayerDismiss({
    open: open && !!anchorEl, // 卡片随锚点就绪才挂载（AnchoredPanel 一拍），dismiss 登记同以此为前提
    layerRef: cardRef,
    close: () => close(false),
    isAnchor: target => triggerRef.current?.contains(target) ?? false,
    getAnchorEl: () => triggerRef.current,
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

  const triggerEl = trigger
    ? (Children.only(trigger) as ReactElement<Record<string, unknown>>)
    : null;
  const injected: Record<string, unknown> = {
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    ref: mergeRefs((triggerEl?.props as { ref?: Ref<HTMLElement> } | undefined)?.ref, el => {
      triggerRef.current = el;
      setAnchorEl(el);
    }),
    onClick: (e: ReactMouseEvent) => {
      (triggerEl?.props as { onClick?: (e: ReactMouseEvent) => void } | undefined)?.onClick?.(e);
      if (!e.defaultPrevented) setOpen(!open);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      (
        triggerEl?.props as { onKeyDown?: (e: ReactKeyboardEvent) => void } | undefined
      )?.onKeyDown?.(e);
      if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
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
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：Esc 只关本层，不冒泡成页面后退
      close(true);
    } else if (e.key === "Tab") {
      const elements = [
        ...(cardRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]'
        ) ?? []),
      ];
      const active = cardRef.current?.ownerDocument.activeElement;
      if (
        !elements.length ||
        (e.shiftKey && active === elements[0]) ||
        (!e.shiftKey && active === elements[elements.length - 1])
      )
        close(true);
    }
  };

  return (
    <>
      {triggerEl && cloneElement(triggerEl, injected)}
      <AnchoredPanel
        anchor={anchorEl}
        open={open}
        placement={placement}
        arrow={arrow}
        ref={cardRef}
        role="dialog"
        tabIndex={-1}
        inert={!open}
        aria-labelledby={hasHeader ? headerId : undefined}
        onKeyDown={onCardKeyDown}
        className={className}
      >
        <PopoverRootContext.Provider value={{ close, headerId }}>
          <PanelHasHeaderContext.Provider value={hasHeader}>
            {children}
          </PanelHasHeaderContext.Provider>
        </PopoverRootContext.Provider>
      </AnchoredPanel>
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
        className="text-ink-3 hover:bg-hover hover:text-ink-1 -mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[8px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      >
        <X className="size-[13px]" strokeWidth={2} />
      </button>
    </div>
  );
}

Popover.Header = PopoverHeader;
Popover.Body = AnchoredPanel.Body;
Popover.Footer = AnchoredPanel.Footer;
