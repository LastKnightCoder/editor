/**
 * Tooltip 基础件 —— 方案 B 定稿（JS 定位引擎，mockups/tooltip/plan-b-engine.html，2026-09-17 用户裁决）。
 *
 * Portal（body 追加 fixed 元素）+ 自研 mini 定位引擎，中间件链：
 * offset（间距 8）→ flip（主轴放不下翻对侧）→ shift（交叉轴夹回视口，边距 8）→
 * arrow（锚点中心在边缘上的投影，两端各留 10px）。
 * 原生锚定路线（方案 A：popover + CSS Anchor Positioning）实测后留档于 mockups/tooltip/。
 *
 * 行为内建（不做成 props）：hover intent（450ms 进入 / 移出即隐 / 400ms 内重开免延迟——
 * 相邻触发器快速扫过不重复等待）；focus-visible 显示；aria-describedby 自动接线；
 * disabled 子元素自动包 wrapper（pointer 事件被吞）；锚点位置变化时 rAF 跟随（动态锚，
 * 如趋势图 hover 热区随鼠标移动）；scroll(capture)/resize 重算。
 * 反相配色复用 bg-ink-1 / text-ink-inverse（深浅主题各自反相，对比度由 token 保障）。
 * 不接 Esc、不进浮层退场注册表（瞬态非阻断，同 Toast 的 D-017 口径）；
 * 不承载可交互内容——可点的说明浮层是 Popover/Menu 的职责。
 */

import {
  useCallback,
  cloneElement,
  useEffect,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { computeTooltipPosition, type TooltipPlacement } from "./tooltipPosition";

export type { TooltipPlacement, TooltipSide, TooltipAlign } from "./tooltipPosition";

export interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  /** 箭头（默认开；8px 菱形，尖端单角 2.5px 圆角，随 flip 自动换边） */
  arrow?: boolean;
  /** 显示延迟毫秒（默认 450；400ms 内重开免延迟） */
  delay?: number;
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
  open: openProp,
  onOpenChange,
  children,
}: TooltipProps) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
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

  /** 定位写入（量两遍：首遍拿内容实际尺寸，第二遍按尺寸精调） */
  const apply = useCallback(() => {
    const a = anchorRef.current;
    const p = popRef.current;
    if (!a || !p) return;
    const { x, y, side, arrowX, arrowY } = computeTooltipPosition(
      a.getBoundingClientRect(),
      p,
      placement
    );
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.dataset.side = side;
    const ar = p.firstElementChild as HTMLElement | null;
    if (ar) {
      if (arrowX != null) {
        ar.style.left = `${arrowX}px`;
        ar.style.top = side === "bottom" ? "-5px" : "auto";
        ar.style.bottom = side === "top" ? "-5px" : "auto";
        ar.style.right = "auto";
      } else {
        ar.style.top = `${arrowY}px`;
        ar.style.left = side === "right" ? "-5px" : "auto";
        ar.style.right = side === "left" ? "-5px" : "auto";
        ar.style.bottom = "auto";
      }
    }
  }, [placement]);

  // open 期间：进场即定位；scroll(capture)/resize → rAF 合并重算；
  // rAF 轮询锚 rect（动态锚场景：趋势图 hover 热区随鼠标逐格移动，无 DOM 事件可挂）
  useLayoutEffect(() => {
    if (!open) return;
    apply();
    apply();
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply();
      });
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    let raf = 0;
    let lastRect = "";
    const poll = () => {
      const a = anchorRef.current;
      if (a) {
        const r = a.getBoundingClientRect();
        const key = `${r.left},${r.top},${r.width},${r.height}`;
        if (key !== lastRect) {
          lastRect = key;
          apply();
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [open, apply, content]);

  if (!isValidElement(children)) return null;
  const child = children as ReactElement<Record<string, unknown>>;
  const controlled = openProp !== undefined;
  const childProps = child.props as Record<string, unknown>;

  // hover intent：受控模式跳过（调用方自己管理时机）
  const enter = () => {
    if (controlled) return;
    window.clearTimeout(timerRef.current);
    const wait = Date.now() - lastClosedAt < REOPEN_SKIP_MS ? 0 : delay;
    timerRef.current = window.setTimeout(() => setOpen(true), wait);
  };
  const leave = () => {
    if (controlled) return;
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };
  const focus = (e: React.FocusEvent) => {
    if (controlled) return; // 受控：时机全归调用方（与 enter/leave 一致）
    if ((e.target as HTMLElement).matches(":focus-visible")) {
      window.clearTimeout(timerRef.current);
      setOpen(true);
    }
  };
  const blur = () => {
    if (!controlled) setOpen(false);
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
      aria-hidden={!open}
      className={clsx(
        "bg-ink-1 text-ink-inverse border-ink-inverse/15 shadow-card group/tip",
        "pointer-events-none fixed left-0 top-0 z-[300] w-max max-w-[280px]",
        "rounded-tau-sm border px-2.5 py-[5px] text-[12px] leading-[1.55]",
        "ease-tau-out transition-[opacity,transform] duration-[130ms]",
        open ? "opacity-100" : "translate-y-[2px] scale-[0.98] opacity-0"
      )}
    >
      {arrow && (
        <span
          aria-hidden
          className={clsx(
            // 不能用 border 打底（四边描边）：内侧两条边藏在 tooltip 主体里不该有框，
            // 只描旋转后朝外的两条斜边。top/bottom 尖端=右下角 → 描 right/bottom、圆右下角；
            // left/right 尖端=左上角 → 描 left/top、圆左上角（与 mockup 实测修正一致）
            "border-ink-inverse/15 bg-ink-1 pointer-events-none absolute size-2",
            "group-data-[side=top]/tip:rotate-45",
            "group-data-[side=top]/tip:rounded-br-[2.5px] group-data-[side=top]/tip:border-b group-data-[side=top]/tip:border-r",
            "group-data-[side=bottom]/tip:rotate-[225deg]",
            "group-data-[side=bottom]/tip:rounded-br-[2.5px] group-data-[side=bottom]/tip:border-b group-data-[side=bottom]/tip:border-r",
            "group-data-[side=left]/tip:rotate-[135deg]",
            "group-data-[side=left]/tip:rounded-tl-[2.5px] group-data-[side=left]/tip:border-l group-data-[side=left]/tip:border-t",
            "group-data-[side=right]/tip:-rotate-45",
            "group-data-[side=right]/tip:rounded-tl-[2.5px] group-data-[side=right]/tip:border-l group-data-[side=right]/tip:border-t"
          )}
        />
      )}
      {content}
    </div>,
    document.body
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
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el;
      // 合并调用方已有 ref（回调 ref 与对象 ref 两种都照顾；React 19 里 ref 在 props 上）
      const prev = childProps.ref;
      if (typeof prev === "function") (prev as (node: HTMLElement | null) => void)(el);
      else if (prev && typeof prev === "object")
        (prev as React.MutableRefObject<HTMLElement | null>).current = el;
    },
  });

  return (
    <>
      {trigger}
      {portal}
    </>
  );
}
