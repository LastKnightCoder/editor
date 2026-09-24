/**
 * AnchoredPanel 基础件 —— 锚定面板：浮层家族的定位基座（Radix Popper 同构层）。
 *
 * 与 Popover 的分工：AnchoredPanel 只管锚定定位（D-004 引擎）、卡片视觉、portal
 * 与显隐过渡——无开合状态（默认锚点在即显示，open 可由宿主驱动）、不监听外点、
 * 不消费 Esc/Tab、不抢焦点，键盘与焦点事件原样冒泡给宿主仲裁。Popover 组合它并
 * 叠加交互层（trigger 注入、外点/Esc/Tab 仲裁、焦点契约、dialog 语义）；卡片与
 * Body/Footer 的视觉形制只有本文件一份。
 *
 * 直接使用的场景：浮层是某个交互会话的一部分、生命周期完全由宿主拥有——如行内
 * 编辑器的选项面板（编辑会话在，面板在；失焦/Esc 由编辑宿主统一判定）。需要独立
 * 开合的浮层用 Popover，勿直接用此件。
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "../UiProvider";
import { cn } from "../cn";
import { useEdgeFade } from "../hooks/useEdgeFade";
import { applyArrowPosition, type AnchoredPlacement } from "./anchoredPosition";
import { FloatingArrow } from "./FloatingArrow";
import { mergeRefs } from "./mergeRefs";
import { useAnchoredPosition } from "./useAnchoredPosition";

/** Body 顶部间距按有无头行分流（头行自带 pb）；由带头行的容器（如 Popover）提供 */
export const PanelHasHeaderContext = createContext<boolean | null>(null);

export interface AnchoredPanelProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "className"
> {
  /** 锚点元素；为空时不渲染（宿主常在 ref 就绪后再挂） */
  anchor: HTMLElement | null;
  /** 12 向全表（引擎 flip/shift 兜底），默认 bottom-start */
  placement?: AnchoredPlacement;
  /** 显隐由宿主驱动；缺省锚点存在即显示（宿主托管用法） */
  open?: boolean;
  /** 8px 菱形箭头（随 flip 换边），默认关 */
  arrow?: boolean;
  /** 透传浮层卡片（宽度控制如 w-[360px]，覆盖 min/max 约束） */
  className?: string;
  children: ReactNode;
  /** 卡片 DOM 引用（AnchoredPanel 内部已占用一位做定位，此处合并外部引用） */
  ref?: Ref<HTMLDivElement>;
}

export function AnchoredPanel({
  anchor,
  placement = "bottom-start",
  open,
  arrow = false,
  className,
  children,
  ref: externalRef,
  ...cardProps
}: AnchoredPanelProps) {
  const portalContainer = usePortalContainer();
  const popRef = useRef<HTMLDivElement | null>(null);
  const visible = open ?? !!anchor;
  // 定位以卡片实际存在为前提：受控 open 场景锚点元素可能晚一拍就绪（anchor state），
  // 锚点未就绪时卡片未挂载、effect 需放弃并在就绪后重跑——把 !!anchor 并入 open 依赖
  useAnchoredPosition({
    open: visible && !!anchor,
    getAnchor: () => anchor?.getBoundingClientRect() ?? null,
    popRef,
    placement,
    onPlace: (pos, pop) => {
      pop.dataset.side = pos.side;
      if (arrow) applyArrowPosition(pos, pop);
    },
  });
  if (!anchor) return null;
  return createPortal(
    <div
      ref={mergeRefs(externalRef, popRef)}
      data-float-card
      data-open={visible}
      {...cardProps}
      className={cn(
        "bg-surface border-line-1 shadow-float group/float",
        "rounded-tau-lg fixed left-0 top-0 z-[250] w-max min-w-[180px] max-w-[340px] border",
        "ease-tau-out outline-none transition-[opacity,transform,visibility] duration-[160ms]",
        visible ? "opacity-100" : "invisible translate-y-[4px] scale-[0.98] opacity-0",
        !visible && "data-[side=top]:-translate-y-[4px]",
        !visible && "data-[side=left]:-translate-x-[4px]",
        !visible && "data-[side=right]:translate-x-[4px]",
        className
      )}
    >
      {arrow && <FloatingArrow tone="surface" />}
      {children}
    </div>,
    portalContainer
  );
}

export interface AnchoredPanelBodyProps {
  children: ReactNode;
  className?: string;
}

/** 正文：独立滚动（上限 min(60vh, 420px)）+ 边缘渐隐 + 透明右边框挤位（D-012 手法，
 *  浮层滚动区通用口径）；顶部间距按有无头行分流：无头行自足 14px，有头行收敛 10px。
 *  滚动轨道上下让位（track margin；track 透明边框不缩短 thumb 活动区）：贴浮层边缘的一端
 *  让出圆角半径，免得 thumb 画进 rounded-tau-lg 的圆角外；头行下方只留 4px */
function AnchoredPanelBody({ children, className }: AnchoredPanelBodyProps) {
  const hasHeader = useContext(PanelHasHeaderContext) ?? false;
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  return (
    <div
      ref={setScrollEl}
      className={cn(
        "text-ink-2 text-tau-body edge-fade-scroll",
        "max-h-[min(60vh,420px)] overflow-y-auto border-r-4 border-r-transparent px-4 pb-3.5 leading-[1.65]",
        "[&::-webkit-scrollbar-track]:mb-[var(--tau-radius-lg)]",
        hasHeader
          ? "pt-2.5 [&::-webkit-scrollbar-track]:mt-1"
          : "pt-3.5 [&::-webkit-scrollbar-track]:mt-[var(--tau-radius-lg)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export interface AnchoredPanelFooterProps {
  children: ReactNode;
  className?: string;
}

/** 应答区：随需——无操作即无 footer；按钮右对齐（主按钮恒在最右） */
function AnchoredPanelFooter({ children, className }: AnchoredPanelFooterProps) {
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

AnchoredPanel.Body = AnchoredPanelBody;
AnchoredPanel.Footer = AnchoredPanelFooter;
