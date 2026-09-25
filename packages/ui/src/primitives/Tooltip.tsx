/**
 * Tooltip 基础件 —— Portal + 自研 JS mini 定位引擎（选型与排除记录见 D-004）。
 *
 * Portal（body 追加 fixed 元素）+ 自研 mini 定位引擎（D-004；定位生命周期收口
 * useAnchoredPosition，箭头复用 FloatingArrow——D-014 四家共用底盘），中间件链：
 * offset（间距 8）→ flip（主轴放不下翻对侧）→ shift（交叉轴夹回视口，边距 8）→
 * arrow（锚点中心在边缘上的投影，两端各留 10px）。
 *
 * 行为内建（不做成 props）：hover intent（450ms 进入 / 移出即隐 / 400ms 内重开免延迟——
 * 相邻触发器快速扫过不重复等待）；focus-visible 显示；aria-describedby 自动接线；
 * disabled 子元素自动包 wrapper（pointer 事件被吞）；锚点位置变化时 rAF 跟随（动态锚，
 * 如趋势图 hover 热区随鼠标移动）；scroll(capture)/resize 重算。
 * 反相配色复用 bg-ink-1 / text-ink-inverse（深浅主题各自反相，对比度由 token 保障）。
 * 不接 Esc、不进浮层退场注册表（瞬态非阻断，同 Toast 的 D-003 口径）；
 * 不承载可交互内容——可点的说明浮层是 Popover/Menu 的职责。
 */

import {
  useCallback,
  cloneElement,
  useEffect,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "../UiProvider";
import clsx from "clsx";
import {
  applyArrowPosition,
  type AnchoredAlign,
  type AnchoredPlacement,
  type AnchoredSide,
} from "./anchoredPosition";
import { FloatingArrow } from "./FloatingArrow";
import { mergeRefs } from "./mergeRefs";
import { useAnchoredPosition } from "./useAnchoredPosition";

/** 引擎类型的历史名（D-004 起对外暴露；D-014 引擎更名后保留别名，存量引用不动） */
export type TooltipPlacement = AnchoredPlacement;
export type TooltipSide = AnchoredSide;
export type TooltipAlign = AnchoredAlign;

export interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  /** 箭头（默认开；8px 菱形，尖端单角 2.5px 圆角，随 flip 自动换边） */
  arrow?: boolean;
  /** 显示延迟毫秒（默认 450；400ms 内重开免延迟） */
  delay?: number;
  /** 暂停提示并清理内部打开状态与延迟；优先于 open，不影响子元素交互。 */
  disabled?: boolean;
  /** 受控模式（对齐 §5.3 浮层 open 契约）：传入后组件不再做 hover intent，由调用方管理 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 触发器（克隆注入事件与 aria-describedby；disabled 元素自动包 wrapper） */
  children: ReactElement;
}

/** 组联动：上次关闭后该窗口内重开免延迟（相邻触发器快速扫过不重复等待） */
const REOPEN_SKIP_MS = 400;
let lastClosedAt = 0;

export function Tooltip({
  content,
  placement = "top",
  arrow = true,
  delay = 450,
  disabled = false,
  open: openProp,
  onOpenChange,
  children,
}: TooltipProps) {
  const portalContainer = usePortalContainer();
  const anchorRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [openState, setOpenState] = useState(false);
  const open = !disabled && (openProp ?? openState);
  const tipId = useId();
  const timerRef = useRef<number>(0);

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      onOpenChange?.(v);
      if (!v) lastClosedAt = Date.now();
    },
    [onOpenChange]
  );

  // 卸载时清掉挂起中的显示延迟
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!disabled) return;
    window.clearTimeout(timerRef.current);
    setOpenState(false);
  }, [disabled]);

  // open 期间的定位生命周期（双遍进场 / scroll(capture)/resize/内容尺寸跟随 /
  // rAF 轮询动态锚）收口在 useAnchoredPosition（D-014 四家共用）；
  // 此处只声明 Tooltip 特有的衍生写入
  useAnchoredPosition({
    open,
    getAnchor: () => anchorRef.current?.getBoundingClientRect() ?? null,
    popRef,
    placement,
    pollAnchor: true,
    onPlace: (pos, pop) => {
      pop.dataset.side = pos.side;
      if (arrow) applyArrowPosition(pos, pop);
    },
  });

  if (!isValidElement(children)) return null;
  const child = children as ReactElement<Record<string, unknown>>;
  const controlled = openProp !== undefined;
  const childProps = child.props as Record<string, unknown>;

  // hover intent：受控模式跳过（调用方自己管理时机）
  const enter = () => {
    if (disabled || controlled) return;
    window.clearTimeout(timerRef.current);
    const wait = Date.now() - lastClosedAt < REOPEN_SKIP_MS ? 0 : delay;
    timerRef.current = window.setTimeout(() => setOpen(true), wait);
  };
  const leave = () => {
    if (disabled || controlled) return;
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };
  const focus = (e: React.FocusEvent) => {
    if (disabled || controlled) return; // 受控：时机全归调用方（与 enter/leave 一致）
    if ((e.target as HTMLElement).matches(":focus-visible")) {
      window.clearTimeout(timerRef.current);
      setOpen(true);
    }
  };
  const blur = () => {
    if (!disabled && !controlled) setOpen(false);
  };

  // 透传调用方已有的事件处理器（childProps 为宽类型，逐个判函数再调）
  const pass = (name: string, e: unknown, after?: () => void) => {
    const fn = childProps[name];
    if (typeof fn === "function") (fn as (ev: unknown) => void)(e);
    after?.();
  };

  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => pass("onPointerEnter", e, enter),
    onPointerLeave: (e: React.PointerEvent) => pass("onPointerLeave", e, leave),
    onFocus: (e: React.FocusEvent) => pass("onFocus", e, () => focus(e)),
    onBlur: (e: React.FocusEvent) => pass("onBlur", e, blur),
  };

  const portal = createPortal(
    <div
      ref={popRef}
      id={tipId}
      role="tooltip"
      inert={!open}
      className={clsx(
        "bg-ink-1 text-ink-inverse border-ink-inverse/15 shadow-card group/float",
        "pointer-events-none fixed left-0 top-0 z-[300] w-max max-w-[280px]",
        "rounded-tau-sm border px-2.5 py-[5px] text-[12px] leading-[1.55]",
        "ease-tau-out transition-[opacity,transform] duration-[130ms]",
        open ? "opacity-100" : "translate-y-[2px] scale-[0.98] opacity-0"
      )}
    >
      {arrow && <FloatingArrow tone="tooltip" />}
      {content}
    </div>,
    portalContainer
  );

  // Chromium 里 disabled 表单元素不派发 pointer/focus 事件：
  // wrapper 接管全部接线（事件 + aria + 锚 ref），child 原样渲染
  if (childProps.disabled === true) {
    return (
      <>
        <span
          className="inline-flex"
          onPointerEnter={enter}
          onPointerLeave={leave}
          onFocus={e => focus(e)}
          onBlur={blur}
          aria-describedby={open ? tipId : undefined}
          ref={anchorRef}
        >
          {child}
        </span>
        {portal}
      </>
    );
  }

  const trigger = cloneElement(child, {
    ...handlers,
    "aria-describedby": open ? tipId : childProps["aria-describedby"],
    ref: mergeRefs(childProps.ref as Ref<HTMLElement> | undefined, el => {
      anchorRef.current = el;
    }),
  });

  return (
    <>
      {trigger}
      {portal}
    </>
  );
}
